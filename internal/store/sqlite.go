package store

import (
	"context"
	"database/sql"
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/slackworker/chain-subconverter/internal/service"

	sqlite3 "github.com/mattn/go-sqlite3"
)

// SQLiteShortLinkStore implements ShortLinkStore backed by a local SQLite file.
// It provides LRU eviction when the store reaches its configured capacity.
type SQLiteShortLinkStore struct {
	db          *sql.DB
	maxCapacity int
	writeMu     sync.Mutex
}

// NewSQLiteShortLinkStore opens (or creates) a SQLite database at dbPath
// and initializes the schema. maxCapacity controls LRU eviction.
func NewSQLiteShortLinkStore(dbPath string, maxCapacity int) (*SQLiteShortLinkStore, error) {
	if maxCapacity <= 0 {
		return nil, fmt.Errorf("max capacity must be greater than zero")
	}
	if err := ensureParentDir(dbPath); err != nil {
		return nil, fmt.Errorf("prepare sqlite path: %w", err)
	}

	db, err := sql.Open("sqlite3", dbPath+"?_journal_mode=WAL&_busy_timeout=5000")
	if err != nil {
		return nil, fmt.Errorf("open sqlite: %w", err)
	}
	db.SetMaxOpenConns(1)

	if err := initSchema(db); err != nil {
		_ = db.Close()
		return nil, fmt.Errorf("init schema: %w", err)
	}

	return &SQLiteShortLinkStore{db: db, maxCapacity: maxCapacity}, nil
}

func initSchema(db *sql.DB) error {
	if err := recreateLegacySchema(db); err != nil {
		return err
	}

	_, err := db.Exec(`
		CREATE TABLE IF NOT EXISTS short_links (
			state_key        TEXT NOT NULL UNIQUE,
			short_id         TEXT PRIMARY KEY,
			long_url         TEXT NOT NULL,
			last_accessed_at TEXT NOT NULL
		);
		CREATE INDEX IF NOT EXISTS idx_short_links_last_accessed ON short_links(last_accessed_at);
	`)
	return err
}

func recreateLegacySchema(db *sql.DB) error {
	rows, err := db.Query(`PRAGMA table_info(short_links)`)
	if err != nil {
		return fmt.Errorf("inspect short_links schema: %w", err)
	}
	defer rows.Close()

	hasTable := false
	hasStateKey := false
	for rows.Next() {
		hasTable = true
		var cid int
		var name string
		var columnType string
		var notNull int
		var defaultValue sql.NullString
		var pk int
		if err := rows.Scan(&cid, &name, &columnType, &notNull, &defaultValue, &pk); err != nil {
			return fmt.Errorf("scan short_links schema: %w", err)
		}
		if name == "state_key" {
			hasStateKey = true
		}
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("read short_links schema: %w", err)
	}
	if !hasTable || hasStateKey {
		return nil
	}
	if _, err := db.Exec(`DROP TABLE IF EXISTS short_links`); err != nil {
		return fmt.Errorf("drop legacy short_links table: %w", err)
	}
	return nil
}

// CreateOrGet atomically upserts a short-link mapping. If a record with the
// same state_key already exists, it returns the existing record, refreshes its
// last_accessed_at, and updates the stored long_url to the current canonical
// long URL. If the store is at capacity, it evicts the LRU record.
func (s *SQLiteShortLinkStore) CreateOrGet(ctx context.Context, stateKey string, shortID string, longURL string) (ShortLinkEntry, error) {
	s.writeMu.Lock()
	defer s.writeMu.Unlock()

	now := time.Now().UTC().Format(time.RFC3339Nano)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return ShortLinkEntry{}, fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	// Check if a record for this canonical state already exists.
	existingShortID, existingLongURL, err := lookupByStateKey(ctx, tx, stateKey)
	if err == nil {
		if existingLongURL != longURL {
			if err := updateLongURL(ctx, tx, existingShortID, longURL); err != nil {
				return ShortLinkEntry{}, err
			}
		}
		if err := refreshLastAccessedAt(ctx, tx, existingShortID, now); err != nil {
			return ShortLinkEntry{}, err
		}
		if err := tx.Commit(); err != nil {
			return ShortLinkEntry{}, fmt.Errorf("commit tx: %w", err)
		}
		return ShortLinkEntry{ShortID: existingShortID, LongURL: longURL}, nil
	}
	if !errors.Is(err, sql.ErrNoRows) {
		return ShortLinkEntry{}, fmt.Errorf("lookup existing state key: %w", err)
	}

	// Evict LRU if at capacity.
	var count int
	if err := tx.QueryRowContext(ctx, `SELECT COUNT(*) FROM short_links`).Scan(&count); err != nil {
		return ShortLinkEntry{}, fmt.Errorf("count records: %w", err)
	}
	if count >= s.maxCapacity {
		_, err := tx.ExecContext(ctx, `
			DELETE FROM short_links WHERE short_id = (
				SELECT short_id FROM short_links ORDER BY last_accessed_at ASC, rowid ASC LIMIT 1
			)
		`)
		if err != nil {
			return ShortLinkEntry{}, fmt.Errorf("evict lru: %w", err)
		}
	}

	// Insert new record.
	_, err = tx.ExecContext(ctx, `
		INSERT INTO short_links (state_key, short_id, long_url, last_accessed_at) VALUES (?, ?, ?, ?)
	`, stateKey, shortID, longURL, now)
	if err != nil {
		if isStateKeyConstraintError(err) {
			existingShortID, existingLongURL, lookupErr := lookupByStateKey(ctx, tx, stateKey)
			if lookupErr != nil {
				return ShortLinkEntry{}, fmt.Errorf("lookup existing state key after conflict: %w", lookupErr)
			}
			if existingLongURL != longURL {
				if err := updateLongURL(ctx, tx, existingShortID, longURL); err != nil {
					return ShortLinkEntry{}, err
				}
			}
			if err := refreshLastAccessedAt(ctx, tx, existingShortID, now); err != nil {
				return ShortLinkEntry{}, err
			}
			if err := tx.Commit(); err != nil {
				return ShortLinkEntry{}, fmt.Errorf("commit tx: %w", err)
			}
			return ShortLinkEntry{ShortID: existingShortID, LongURL: longURL}, nil
		}
		if isShortIDConstraintError(err) {
			return ShortLinkEntry{}, service.ErrShortIDCollision
		}
		return ShortLinkEntry{}, fmt.Errorf("insert short link: %w", err)
	}

	if err := tx.Commit(); err != nil {
		return ShortLinkEntry{}, fmt.Errorf("commit tx: %w", err)
	}
	return ShortLinkEntry{ShortID: shortID, LongURL: longURL}, nil
}

// ResolveShortID looks up the longURL for the given shortID.
// Returns service.ErrShortURLNotFound if not found.
// On success, refreshes the lastAccessedAt timestamp.
func (s *SQLiteShortLinkStore) ResolveShortID(ctx context.Context, shortID string) (string, error) {
	now := time.Now().UTC().Format(time.RFC3339Nano)

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return "", fmt.Errorf("begin tx: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	var longURL string
	err = tx.QueryRowContext(ctx, `SELECT long_url FROM short_links WHERE short_id = ?`, shortID).Scan(&longURL)
	if errors.Is(err, sql.ErrNoRows) {
		return "", service.ErrShortURLNotFound
	}
	if err != nil {
		return "", fmt.Errorf("lookup short id: %w", err)
	}

	if err := refreshLastAccessedAt(ctx, tx, shortID, now); err != nil {
		return "", err
	}
	if err := tx.Commit(); err != nil {
		return "", fmt.Errorf("commit tx: %w", err)
	}

	return longURL, nil
}

func ensureParentDir(dbPath string) error {
	parentDir := filepath.Dir(dbPath)
	if parentDir == "." || parentDir == "" {
		return nil
	}
	return os.MkdirAll(parentDir, 0o755)
}

func lookupByStateKey(ctx context.Context, tx *sql.Tx, stateKey string) (string, string, error) {
	var shortID string
	var longURL string
	err := tx.QueryRowContext(ctx, `SELECT short_id, long_url FROM short_links WHERE state_key = ?`, stateKey).Scan(&shortID, &longURL)
	if err != nil {
		return "", "", err
	}
	return shortID, longURL, nil
}

func updateLongURL(ctx context.Context, tx *sql.Tx, shortID string, longURL string) error {
	result, err := tx.ExecContext(ctx, `UPDATE short_links SET long_url = ? WHERE short_id = ?`, longURL, shortID)
	if err != nil {
		return fmt.Errorf("update long url: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected for long url update: %w", err)
	}
	if affected != 1 {
		return fmt.Errorf("update long url: expected 1 row, got %d", affected)
	}
	return nil
}

func refreshLastAccessedAt(ctx context.Context, tx *sql.Tx, shortID string, lastAccessedAt string) error {
	result, err := tx.ExecContext(ctx, `UPDATE short_links SET last_accessed_at = ? WHERE short_id = ?`, lastAccessedAt, shortID)
	if err != nil {
		return fmt.Errorf("refresh last accessed at: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return fmt.Errorf("rows affected for refresh: %w", err)
	}
	if affected != 1 {
		return fmt.Errorf("refresh last accessed at: expected 1 row, got %d", affected)
	}
	return nil
}

func isStateKeyConstraintError(err error) bool {
	var sqliteErr sqlite3.Error
	if !errors.As(err, &sqliteErr) {
		return false
	}
	if sqliteErr.Code != sqlite3.ErrConstraint {
		return false
	}
	return strings.Contains(err.Error(), "short_links.state_key")
}

func isShortIDConstraintError(err error) bool {
	var sqliteErr sqlite3.Error
	if !errors.As(err, &sqliteErr) {
		return false
	}
	if sqliteErr.Code != sqlite3.ErrConstraint {
		return false
	}
	return strings.Contains(err.Error(), "short_links.short_id")
}

// Close closes the underlying database connection.
func (s *SQLiteShortLinkStore) Close() error {
	return s.db.Close()
}
