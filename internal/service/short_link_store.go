package service

import (
	"context"
	"errors"
	"fmt"
	"sync"
	"time"
)

var ErrShortURLNotFound = errors.New("short URL not found")
var ErrShortIDCollision = errors.New("short ID collision")

type ShortLinkResolver interface {
	ResolveShortID(context.Context, string) (string, error)
}

type ShortLinkStore interface {
	ShortLinkResolver
	CreateOrGet(context.Context, string, string, string) (ShortLinkEntry, error)
}

type ShortLinkEntry struct {
	ShortID string
	LongURL string
}

type ShortLinkRecord struct {
	LongURL        string
	LastAccessedAt time.Time
}

type InMemoryShortLinkStore struct {
	mu                sync.Mutex
	records           map[string]ShortLinkRecord
	shortIDByStateKey map[string]string
}

func NewInMemoryShortLinkStore() *InMemoryShortLinkStore {
	return &InMemoryShortLinkStore{
		records:           make(map[string]ShortLinkRecord),
		shortIDByStateKey: make(map[string]string),
	}
}

func (store *InMemoryShortLinkStore) Save(shortID string, longURL string) {
	store.mu.Lock()
	if stateKey, err := CanonicalShortLinkStateKey(longURL, InputLimits{}); err == nil {
		store.shortIDByStateKey[stateKey] = shortID
	}
	store.records[shortID] = ShortLinkRecord{
		LongURL:        longURL,
		LastAccessedAt: time.Now().UTC(),
	}
	store.mu.Unlock()
}

func (store *InMemoryShortLinkStore) CreateOrGet(_ context.Context, stateKey string, shortID string, longURL string) (ShortLinkEntry, error) {
	store.mu.Lock()
	defer store.mu.Unlock()

	if existingShortID, ok := store.shortIDByStateKey[stateKey]; ok {
		record := store.records[existingShortID]
		record.LongURL = longURL
		record.LastAccessedAt = time.Now().UTC()
		store.records[existingShortID] = record
		return ShortLinkEntry{ShortID: existingShortID, LongURL: longURL}, nil
	}

	if existingRecord, ok := store.records[shortID]; ok && existingRecord.LongURL != longURL {
		return ShortLinkEntry{}, fmt.Errorf("%w for %q", ErrShortIDCollision, shortID)
	}

	store.shortIDByStateKey[stateKey] = shortID
	store.records[shortID] = ShortLinkRecord{
		LongURL:        longURL,
		LastAccessedAt: time.Now().UTC(),
	}

	return ShortLinkEntry{ShortID: shortID, LongURL: longURL}, nil
}

func (store *InMemoryShortLinkStore) ResolveShortID(_ context.Context, shortID string) (string, error) {
	store.mu.Lock()
	record, ok := store.records[shortID]
	if !ok {
		store.mu.Unlock()
		return "", ErrShortURLNotFound
	}
	record.LastAccessedAt = time.Now().UTC()
	store.records[shortID] = record
	store.mu.Unlock()
	return record.LongURL, nil
}
