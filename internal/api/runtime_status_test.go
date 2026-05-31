package api

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"strings"
	"testing"
	"time"

	"github.com/slackworker/chain-subconverter/internal/runtimestatus"
	"github.com/slackworker/chain-subconverter/internal/service"
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
		runtimestatus.AppStatus{
			Version:     "v-test-release",
			ReleaseTag:  "v-test-release",
			ImageTag:    "image-latest",
			Revision:    "86922c3deadbeef86922c3deadbeef86922c3d",
			ImageDigest: "sha256:abc123",
		},
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
	if payload.App.Version != "v-test-release" {
		t.Fatalf("app version = %q, want v-test-release", payload.App.Version)
	}
	if payload.App.ReleaseTag != "v-test-release" {
		t.Fatalf("app release tag = %q, want v-test-release", payload.App.ReleaseTag)
	}
	if payload.App.ImageTag != "image-latest" {
		t.Fatalf("app image tag = %q, want image-latest", payload.App.ImageTag)
	}
	if payload.App.Revision != "86922c3deadbeef86922c3deadbeef86922c3d" {
		t.Fatalf("app revision = %q", payload.App.Revision)
	}
	if payload.App.ImageDigest != "sha256:abc123" {
		t.Fatalf("app image digest = %q", payload.App.ImageDigest)
	}
	if !payload.Subconverter.Healthy {
		t.Fatalf("subconverter healthy = false, error=%q", payload.Subconverter.Error)
	}
	if payload.Subconverter.NetworkScope != runtimestatus.SubconverterNetworkScopeCrossNetwork {
		t.Fatalf("subconverter network scope = %q, want %q", payload.Subconverter.NetworkScope, runtimestatus.SubconverterNetworkScopeCrossNetwork)
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

func TestRuntimeStatusHandler_OverCapacityUntilFirstShortLinkWrite(t *testing.T) {
	ctx := context.Background()

	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		writer.WriteHeader(http.StatusOK)
		_, _ = writer.Write([]byte("subconverter v0.9.1-test"))
	}))
	t.Cleanup(upstream.Close)

	dbPath := filepath.Join(t.TempDir(), "runtime-status-over-capacity.db")

	seedStore, err := shortlinkstore.NewSQLiteShortLinkStore(dbPath, 100)
	if err != nil {
		t.Fatalf("NewSQLiteShortLinkStore(seed) error = %v", err)
	}
	for i := 0; i < 100; i++ {
		stateKey := fmt.Sprintf("state-%03d", i)
		shortID := fmt.Sprintf("id%03d", i)
		longURL := fmt.Sprintf("http://example.com/sub?data=%03d", i)
		if _, err := seedStore.CreateOrGet(ctx, stateKey, shortID, longURL); err != nil {
			t.Fatalf("seed CreateOrGet(%q) error = %v", shortID, err)
		}
	}
	if err := seedStore.Close(); err != nil {
		t.Fatalf("seedStore.Close() error = %v", err)
	}

	store, err := shortlinkstore.NewSQLiteShortLinkStore(dbPath, 10)
	if err != nil {
		t.Fatalf("NewSQLiteShortLinkStore(runtime) error = %v", err)
	}
	t.Cleanup(func() { _ = store.Close() })

	runtimeStatusService := runtimestatus.NewService(
		runtimestatus.AppStatus{Version: "v-test-over-capacity"},
		store,
		runtimestatus.NewUpstreamProber(upstream.URL, 2*time.Second),
	)

	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, store, WithRuntimeStatus(runtimeStatusService))

	beforeReq := httptest.NewRequest(http.MethodGet, "/api/runtime-status", nil)
	beforeResp := httptest.NewRecorder()
	handler.ServeHTTP(beforeResp, beforeReq)
	if beforeResp.Code != http.StatusOK {
		t.Fatalf("status mismatch before write: got %d want %d, body=%s", beforeResp.Code, http.StatusOK, beforeResp.Body.String())
	}
	var beforePayload runtimestatus.Snapshot
	if err := json.Unmarshal(beforeResp.Body.Bytes(), &beforePayload); err != nil {
		t.Fatalf("decode runtime status before write: %v", err)
	}
	if beforePayload.Storage.Used != 100 || beforePayload.Storage.Capacity != 10 {
		t.Fatalf("runtime status before write storage = %d/%d, want 100/10", beforePayload.Storage.Used, beforePayload.Storage.Capacity)
	}

	longURL, err := service.EncodeLongURL(
		"http://localhost:11200",
		service.BuildLongURLPayload(
			service.Stage1Input{
				AdvancedOptions: service.AdvancedOptions{Config: stringPtr("https://templates.example.com/default.ini")},
			},
			service.Stage2Snapshot{},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	writeReq := httptest.NewRequest(
		http.MethodPost,
		"/api/short-links",
		strings.NewReader(`{"longUrl":"`+longURL+`"}`),
	)
	writeResp := httptest.NewRecorder()
	handler.ServeHTTP(writeResp, writeReq)
	if writeResp.Code != http.StatusOK {
		t.Fatalf("short-links write status mismatch: got %d want %d, body=%s", writeResp.Code, http.StatusOK, writeResp.Body.String())
	}

	afterReq := httptest.NewRequest(http.MethodGet, "/api/runtime-status", nil)
	afterResp := httptest.NewRecorder()
	handler.ServeHTTP(afterResp, afterReq)
	if afterResp.Code != http.StatusOK {
		t.Fatalf("status mismatch after write: got %d want %d, body=%s", afterResp.Code, http.StatusOK, afterResp.Body.String())
	}
	var afterPayload runtimestatus.Snapshot
	if err := json.Unmarshal(afterResp.Body.Bytes(), &afterPayload); err != nil {
		t.Fatalf("decode runtime status after write: %v", err)
	}
	if afterPayload.Storage.Used != 10 || afterPayload.Storage.Capacity != 10 {
		t.Fatalf("runtime status after write storage = %d/%d, want 10/10", afterPayload.Storage.Used, afterPayload.Storage.Capacity)
	}

	if _, err := store.ResolveShortID(ctx, "id000"); err != service.ErrShortURLNotFound {
		t.Fatalf("ResolveShortID(id000) after write err = %v, want ErrShortURLNotFound", err)
	}
}
