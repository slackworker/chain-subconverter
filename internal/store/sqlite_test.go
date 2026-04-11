package store

import (
	"context"
	"os"
	"path/filepath"
	"sync"
	"testing"
	"time"

	"github.com/slackworker/chain-subconverter/internal/service"
)

func newTestStore(t *testing.T, maxCapacity int) *SQLiteShortLinkStore {
	t.Helper()
	dbPath := filepath.Join(t.TempDir(), "test.db")
	store, err := NewSQLiteShortLinkStore(dbPath, maxCapacity)
	if err != nil {
		t.Fatalf("NewSQLiteShortLinkStore() error = %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })
	return store
}

func TestCreateAndResolve(t *testing.T) {
	store := newTestStore(t, 100)
	ctx := context.Background()

	entry, err := store.CreateOrGet(ctx, "abc123", "http://example.com/subscription?data=payload1")
	if err != nil {
		t.Fatalf("CreateOrGet() error = %v", err)
	}
	if entry.ShortID != "abc123" {
		t.Fatalf("shortID mismatch: got %q want %q", entry.ShortID, "abc123")
	}
	if entry.LongURL != "http://example.com/subscription?data=payload1" {
		t.Fatalf("longURL mismatch: got %q want %q", entry.LongURL, "http://example.com/subscription?data=payload1")
	}

	longURL, err := store.ResolveShortID(ctx, "abc123")
	if err != nil {
		t.Fatalf("ResolveShortID() error = %v", err)
	}
	if longURL != "http://example.com/subscription?data=payload1" {
		t.Fatalf("resolved longURL mismatch: got %q", longURL)
	}
}

func TestResolveShortID_NotFound(t *testing.T) {
	store := newTestStore(t, 100)
	ctx := context.Background()

	_, err := store.ResolveShortID(ctx, "nonexistent")
	if err != service.ErrShortURLNotFound {
		t.Fatalf("ResolveShortID() error = %v, want ErrShortURLNotFound", err)
	}
}

func TestCreateOrGet_Idempotent(t *testing.T) {
	store := newTestStore(t, 100)
	ctx := context.Background()

	longURL := "http://example.com/subscription?data=same-payload"

	entry1, err := store.CreateOrGet(ctx, "id1", longURL)
	if err != nil {
		t.Fatalf("first CreateOrGet() error = %v", err)
	}

	// Same longURL, different shortID proposed — should return existing.
	entry2, err := store.CreateOrGet(ctx, "id2", longURL)
	if err != nil {
		t.Fatalf("second CreateOrGet() error = %v", err)
	}

	if entry2.ShortID != entry1.ShortID {
		t.Fatalf("idempotent shortID mismatch: got %q want %q", entry2.ShortID, entry1.ShortID)
	}
	if entry2.LongURL != longURL {
		t.Fatalf("idempotent longURL mismatch: got %q want %q", entry2.LongURL, longURL)
	}
}

func TestCreateOrGet_ExistingRecordRefreshesLastAccessedAt(t *testing.T) {
	store := newTestStore(t, 100)
	ctx := context.Background()

	entry, err := store.CreateOrGet(ctx, "id1", "http://example.com/subscription?data=same-payload")
	if err != nil {
		t.Fatalf("first CreateOrGet() error = %v", err)
	}
	before := mustLastAccessedAt(t, store, entry.ShortID)

	time.Sleep(10 * time.Millisecond)

	if _, err := store.CreateOrGet(ctx, "id2", entry.LongURL); err != nil {
		t.Fatalf("second CreateOrGet() error = %v", err)
	}
	after := mustLastAccessedAt(t, store, entry.ShortID)
	if !after.After(before) {
		t.Fatalf("last_accessed_at was not refreshed: before=%v after=%v", before, after)
	}
}

func TestCreateOrGet_ConcurrentIdempotent(t *testing.T) {
	store := newTestStore(t, 100)
	ctx := context.Background()
	const workers = 12
	longURL := "http://example.com/subscription?data=concurrent"

	type result struct {
		entry ShortLinkEntry
		err   error
	}
	results := make([]result, workers)
	start := make(chan struct{})
	var wg sync.WaitGroup

	for i := 0; i < workers; i++ {
		wg.Add(1)
		go func(index int) {
			defer wg.Done()
			<-start
			entry, err := store.CreateOrGet(ctx, string(rune('a'+index)), longURL)
			results[index] = result{entry: entry, err: err}
		}(i)
	}

	close(start)
	wg.Wait()

	var canonicalShortID string
	for i, result := range results {
		if result.err != nil {
			t.Fatalf("CreateOrGet() worker %d error = %v", i, result.err)
		}
		if result.entry.LongURL != longURL {
			t.Fatalf("CreateOrGet() worker %d longURL = %q, want %q", i, result.entry.LongURL, longURL)
		}
		if canonicalShortID == "" {
			canonicalShortID = result.entry.ShortID
			continue
		}
		if result.entry.ShortID != canonicalShortID {
			t.Fatalf("CreateOrGet() worker %d shortID = %q, want %q", i, result.entry.ShortID, canonicalShortID)
		}
	}

	resolvedLongURL, err := store.ResolveShortID(ctx, canonicalShortID)
	if err != nil {
		t.Fatalf("ResolveShortID() error = %v", err)
	}
	if resolvedLongURL != longURL {
		t.Fatalf("ResolveShortID() longURL = %q, want %q", resolvedLongURL, longURL)
	}
}

func TestLRUEviction(t *testing.T) {
	store := newTestStore(t, 3)
	ctx := context.Background()

	// Fill to capacity.
	for i := range 3 {
		shortID := string(rune('a' + i))
		longURL := "http://example.com/sub?data=" + shortID
		if _, err := store.CreateOrGet(ctx, shortID, longURL); err != nil {
			t.Fatalf("CreateOrGet(%q) error = %v", shortID, err)
		}
	}

	// All three should resolve.
	for i := range 3 {
		shortID := string(rune('a' + i))
		if _, err := store.ResolveShortID(ctx, shortID); err != nil {
			t.Fatalf("ResolveShortID(%q) before eviction: %v", shortID, err)
		}
	}

	// Access "a" to make it most recently used.
	_, _ = store.ResolveShortID(ctx, "a")

	// Insert a 4th record — should evict the LRU (which is "b", since "a" was just accessed).
	if _, err := store.CreateOrGet(ctx, "d", "http://example.com/sub?data=d"); err != nil {
		t.Fatalf("CreateOrGet(d) error = %v", err)
	}

	// "b" should be evicted (it was the least recently accessed).
	_, err := store.ResolveShortID(ctx, "b")
	if err != service.ErrShortURLNotFound {
		t.Fatalf("expected ErrShortURLNotFound for evicted %q, got err=%v", "b", err)
	}

	// "a", "c", "d" should still be resolvable.
	for _, id := range []string{"a", "c", "d"} {
		if _, err := store.ResolveShortID(ctx, id); err != nil {
			t.Fatalf("ResolveShortID(%q) after eviction: %v", id, err)
		}
	}
}

func TestResolveShortID_RefreshesLastAccessedAt(t *testing.T) {
	store := newTestStore(t, 100)
	ctx := context.Background()

	entry, err := store.CreateOrGet(ctx, "refresh1", "http://example.com/refresh")
	if err != nil {
		t.Fatalf("CreateOrGet() error = %v", err)
	}
	before := mustLastAccessedAt(t, store, entry.ShortID)

	time.Sleep(10 * time.Millisecond)

	if _, err := store.ResolveShortID(ctx, entry.ShortID); err != nil {
		t.Fatalf("ResolveShortID() error = %v", err)
	}
	after := mustLastAccessedAt(t, store, entry.ShortID)
	if !after.After(before) {
		t.Fatalf("last_accessed_at was not refreshed: before=%v after=%v", before, after)
	}
}

func TestPersistence(t *testing.T) {
	dbPath := filepath.Join(t.TempDir(), "persist.db")
	ctx := context.Background()

	// Create and populate.
	store1, err := NewSQLiteShortLinkStore(dbPath, 100)
	if err != nil {
		t.Fatalf("open store: %v", err)
	}
	if _, err := store1.CreateOrGet(ctx, "persist1", "http://example.com/persistent"); err != nil {
		t.Fatalf("CreateOrGet() error = %v", err)
	}
	_ = store1.Close()

	// Reopen and verify.
	store2, err := NewSQLiteShortLinkStore(dbPath, 100)
	if err != nil {
		t.Fatalf("reopen store: %v", err)
	}
	defer store2.Close()

	longURL, err := store2.ResolveShortID(ctx, "persist1")
	if err != nil {
		t.Fatalf("ResolveShortID() after reopen: %v", err)
	}
	if longURL != "http://example.com/persistent" {
		t.Fatalf("persisted longURL mismatch: got %q", longURL)
	}
}

func TestNewSQLiteShortLinkStore_InvalidCapacity(t *testing.T) {
	_, err := NewSQLiteShortLinkStore(filepath.Join(t.TempDir(), "test.db"), 0)
	if err == nil {
		t.Fatal("expected error for zero capacity")
	}
}

func TestNewSQLiteShortLinkStore_InvalidPath(t *testing.T) {
	_, err := NewSQLiteShortLinkStore(filepath.Join(os.DevNull, "impossible", "path.db"), 100)
	if err == nil {
		t.Fatal("expected error for invalid path")
	}
}

func mustLastAccessedAt(t *testing.T, store *SQLiteShortLinkStore, shortID string) time.Time {
	t.Helper()

	var raw string
	err := store.db.QueryRow(`SELECT last_accessed_at FROM short_links WHERE short_id = ?`, shortID).Scan(&raw)
	if err != nil {
		t.Fatalf("query last_accessed_at for %q: %v", shortID, err)
	}
	parsed, err := time.Parse(time.RFC3339Nano, raw)
	if err != nil {
		t.Fatalf("parse last_accessed_at for %q: %v", shortID, err)
	}
	return parsed
}
