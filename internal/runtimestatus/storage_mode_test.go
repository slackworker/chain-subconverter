package runtimestatus

import "testing"

func TestInferStorageMode(t *testing.T) {
	tests := []struct {
		path string
		want string
	}{
		{"/tmp/short-links.sqlite3", StorageModeTemporary},
		{"/tmp", StorageModeTemporary},
		{"data/short-links.sqlite3", StorageModePersistent},
		{"/data/short-links.sqlite3", StorageModePersistent},
	}

	for _, tc := range tests {
		if got := InferStorageMode(tc.path); got != tc.want {
			t.Fatalf("InferStorageMode(%q) = %q, want %q", tc.path, got, tc.want)
		}
	}
}
