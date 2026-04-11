package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
)

type TemplateContentReader interface {
	Load(id string) (string, bool)
}

type TemplateContentStore interface {
	TemplateContentReader
	Save(content string) (string, error)
	Delete(id string)
}

type InMemoryTemplateContentStore struct {
	mu      sync.RWMutex
	content map[string]string
}

func NewInMemoryTemplateContentStore() *InMemoryTemplateContentStore {
	return &InMemoryTemplateContentStore{
		content: make(map[string]string),
	}
}

func (store *InMemoryTemplateContentStore) Save(content string) (string, error) {
	randomBytes := make([]byte, 16)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("generate managed template id: %w", err)
	}
	id := hex.EncodeToString(randomBytes)

	store.mu.Lock()
	store.content[id] = content
	store.mu.Unlock()

	return id, nil
}

func (store *InMemoryTemplateContentStore) Load(id string) (string, bool) {
	store.mu.RLock()
	content, ok := store.content[id]
	store.mu.RUnlock()
	return content, ok
}

func (store *InMemoryTemplateContentStore) Delete(id string) {
	store.mu.Lock()
	delete(store.content, id)
	store.mu.Unlock()
}
