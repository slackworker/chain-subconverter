package service

import (
	"context"
	"errors"
	"sync"
	"time"
)

var ErrShortURLNotFound = errors.New("short URL not found")

type ShortLinkResolver interface {
	ResolveShortID(context.Context, string) (string, error)
}

type ShortLinkRecord struct {
	LongURL        string
	LastAccessedAt time.Time
}

type InMemoryShortLinkStore struct {
	mu      sync.Mutex
	records map[string]ShortLinkRecord
}

func NewInMemoryShortLinkStore() *InMemoryShortLinkStore {
	return &InMemoryShortLinkStore{
		records: make(map[string]ShortLinkRecord),
	}
}

func (store *InMemoryShortLinkStore) Save(shortID string, longURL string) {
	store.mu.Lock()
	store.records[shortID] = ShortLinkRecord{
		LongURL:        longURL,
		LastAccessedAt: time.Now().UTC(),
	}
	store.mu.Unlock()
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
