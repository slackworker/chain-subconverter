package api

import (
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"testing"
	"time"

	"github.com/slackworker/chain-subconverter/internal/runtimestatus"
	shortlinkstore "github.com/slackworker/chain-subconverter/internal/store"
)

func TestRuntimeStatusHandler(t *testing.T) {
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
		_, _ = writer.Write([]byte("subconverter v0.9.1-test"))
	}))
	t.Cleanup(upstream.Close)

	dbPath := filepath.Join(t.TempDir(), "runtime-status.db")
	store, err := shortlinkstore.NewSQLiteShortLinkStore(dbPath, 100)
	if err != nil {
		t.Fatalf("NewSQLiteShortLinkStore() error = %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	runtimeStatusService := runtimestatus.NewService(
		"test-app",
		store,
		runtimestatus.NewUpstreamProber(upstream.URL, 2*time.Second),
	)

	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, store, WithRuntimeStatus(runtimeStatusService))

	request := httptest.NewRequest(http.MethodGet, "/api/runtime-status?refresh=1", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	var payload runtimestatus.Snapshot
	if err := json.Unmarshal(recorder.Body.Bytes(), &payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if payload.App.Version != "test-app" {
		t.Fatalf("app version = %q, want test-app", payload.App.Version)
	}
	if !payload.Subconverter.Healthy {
		t.Fatalf("subconverter healthy = false, error=%q", payload.Subconverter.Error)
	}
	if payload.Subconverter.Version != "subconverter v0.9.1-test" {
		t.Fatalf("subconverter version = %q", payload.Subconverter.Version)
	}
	if payload.Storage.Mode != runtimestatus.StorageModeTemporary {
		t.Fatalf("storage mode = %q, want temporary for tempdir db path", payload.Storage.Mode)
	}
	if payload.Storage.Capacity != 100 {
		t.Fatalf("storage capacity = %d, want 100", payload.Storage.Capacity)
	}
}

func TestRuntimeStatusHandler_WithoutService(t *testing.T) {
	handler := mustNewTestHandler(t, &fakeConversionSource{})

	request := httptest.NewRequest(http.MethodGet, "/api/runtime-status", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusServiceUnavailable {
		t.Fatalf("status mismatch: got %d want %d", recorder.Code, http.StatusServiceUnavailable)
	}
}
