package runtimestatus

import (
	"path/filepath"
	"strings"
)

const (
	StorageModeTemporary  = "temporary"
	StorageModePersistent = "persistent"
)

// InferStorageMode classifies persistence from the SQLite database path.
func InferStorageMode(dbPath string) string {
	clean := filepath.Clean(dbPath)
	if clean == "/tmp" || strings.HasPrefix(clean, "/tmp/") {
		return StorageModeTemporary
	}
	return StorageModePersistent
}
