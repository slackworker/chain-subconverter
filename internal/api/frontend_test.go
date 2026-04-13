package api

import (
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestWithFrontendAssets_ServesIndexForRoot(t *testing.T) {
	distDir := writeFrontendDistFixture(t)
	next := http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.NotFound(writer, nil)
	})

	handler := WithFrontendAssets(next, distDir)
	request := httptest.NewRequest(http.MethodGet, "/", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d", recorder.Code, http.StatusOK)
	}
	if !strings.Contains(recorder.Body.String(), "Chain Converter for Mihomo") {
		t.Fatalf("expected SPA index body, got %q", recorder.Body.String())
	}
}

func TestWithFrontendAssets_ServesStaticAssetFile(t *testing.T) {
	distDir := writeFrontendDistFixture(t)
	next := http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		http.NotFound(writer, nil)
	})

	handler := WithFrontendAssets(next, distDir)
	request := httptest.NewRequest(http.MethodGet, "/assets/app.css", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d", recorder.Code, http.StatusOK)
	}
	if got := strings.TrimSpace(recorder.Body.String()); got != "body { color: #123456; }" {
		t.Fatalf("asset body mismatch: got %q", got)
	}
}

func TestWithFrontendAssets_PreservesAPIRoutes(t *testing.T) {
	distDir := writeFrontendDistFixture(t)
	next := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusNotFound)
		_, _ = writer.Write([]byte(`{"path":"` + request.URL.Path + `"}`))
	})

	handler := WithFrontendAssets(next, distDir)
	request := httptest.NewRequest(http.MethodGet, "/api/missing", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status mismatch: got %d want %d", recorder.Code, http.StatusNotFound)
	}
	if got := recorder.Header().Get("Content-Type"); got != "application/json" {
		t.Fatalf("content-type mismatch: got %q want %q", got, "application/json")
	}
	if got := strings.TrimSpace(recorder.Body.String()); got != `{"path":"/api/missing"}` {
		t.Fatalf("body mismatch: got %q", got)
	}
}

func TestWithFrontendAssets_PreservesMissingBuiltAsset404(t *testing.T) {
	distDir := writeFrontendDistFixture(t)
	next := http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusNotFound)
		_, _ = writer.Write([]byte("api missing: " + request.URL.Path))
	})

	handler := WithFrontendAssets(next, distDir)
	request := httptest.NewRequest(http.MethodGet, "/assets/missing.js", nil)
	recorder := httptest.NewRecorder()

	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusNotFound {
		t.Fatalf("status mismatch: got %d want %d", recorder.Code, http.StatusNotFound)
	}
	if got := strings.TrimSpace(recorder.Body.String()); got != "api missing: /assets/missing.js" {
		t.Fatalf("body mismatch: got %q", got)
	}
}

func writeFrontendDistFixture(t *testing.T) string {
	t.Helper()
	distDir := t.TempDir()
	assetsDir := filepath.Join(distDir, "assets")
	if err := os.MkdirAll(assetsDir, 0o755); err != nil {
		t.Fatalf("MkdirAll() error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(distDir, "index.html"), []byte("<html><body>Chain Converter for Mihomo</body></html>"), 0o644); err != nil {
		t.Fatalf("WriteFile(index.html) error = %v", err)
	}
	if err := os.WriteFile(filepath.Join(assetsDir, "app.css"), []byte("body { color: #123456; }\n"), 0o644); err != nil {
		t.Fatalf("WriteFile(app.css) error = %v", err)
	}
	return distDir
}
