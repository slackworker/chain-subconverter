// Package store provides short-link storage implementations.
//
// The ShortLinkStore interface defines the contract for short-link persistence.
// The primary implementation is SQLiteShortLinkStore, backed by a local SQLite file.
package store

import (
	"context"

	"github.com/slackworker/chain-subconverter/internal/service"
)

// ShortLinkStore defines the contract for short-link index persistence.
// Implementations must be safe for concurrent use.
type ShortLinkStore interface {
	// CreateOrGet atomically stores a short-link mapping, or returns the existing record
	// if a mapping for the same canonical state key already exists. It must also evict
	// the least recently accessed record if the store is at capacity.
	CreateOrGet(ctx context.Context, stateKey string, shortID string, longURL string) (ShortLinkEntry, error)

	// ResolveShortID looks up the longURL for the given shortID.
	// Returns service.ErrShortURLNotFound if the shortID does not exist.
	// On success, refreshes the lastAccessedAt timestamp.
	ResolveShortID(ctx context.Context, shortID string) (string, error)

	// Close releases all resources held by the store.
	Close() error
}

// ShortLinkEntry represents a stored short-link mapping.
type ShortLinkEntry = service.ShortLinkEntry
