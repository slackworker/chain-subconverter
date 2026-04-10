package service

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"sync"
)

var managedTemplateStore = struct {
	mu      sync.RWMutex
	content map[string]string
}{
	content: make(map[string]string),
}

func storeManagedTemplate(content string) (string, error) {
	randomBytes := make([]byte, 16)
	if _, err := rand.Read(randomBytes); err != nil {
		return "", fmt.Errorf("generate managed template id: %w", err)
	}
	id := hex.EncodeToString(randomBytes)

	managedTemplateStore.mu.Lock()
	managedTemplateStore.content[id] = content
	managedTemplateStore.mu.Unlock()

	return id, nil
}

func LoadManagedTemplate(id string) (string, bool) {
	managedTemplateStore.mu.RLock()
	content, ok := managedTemplateStore.content[id]
	managedTemplateStore.mu.RUnlock()
	return content, ok
}

func deleteManagedTemplate(id string) {
	managedTemplateStore.mu.Lock()
	delete(managedTemplateStore.content, id)
	managedTemplateStore.mu.Unlock()
}
