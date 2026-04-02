package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

type fakeConversionSource struct {
	result subconverter.ThreePassResult
	err    error
}

func (source *fakeConversionSource) Convert(_ context.Context, _ subconverter.Request) (subconverter.ThreePassResult, error) {
	return source.result, source.err
}

func TestStage1ConvertHandler_HappyPath(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	requestBody := readTextFixture(t, filepath.Join(fixtureDir, "stage1-convert.request.json"))
	expectedResponse := readTextFixture(t, filepath.Join(fixtureDir, "stage1-convert.response.json"))

	handler := mustNewTestHandler(t, &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	})

	request := httptest.NewRequest(http.MethodPost, "/api/stage1/convert", strings.NewReader(requestBody))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if got := recorder.Header().Get("Content-Type"); got != jsonContentType {
		t.Fatalf("content-type mismatch: got %q want %q", got, jsonContentType)
	}

	var response service.Stage1ConvertResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response JSON: %v", err)
	}
	if got := mustMarshalIndented(t, response); strings.TrimSpace(got) != strings.TrimSpace(expectedResponse) {
		t.Fatalf("stage1 response mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, expectedResponse)
	}
}

func TestGenerateHandler_HappyPath(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	requestBody := readTextFixture(t, filepath.Join(fixtureDir, "generate.request.json"))
	expectedResponse := readTextFixture(t, filepath.Join(fixtureDir, "generate.response.json"))

	handler := mustNewTestHandler(t, &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	})

	request := httptest.NewRequest(http.MethodPost, "/api/generate", strings.NewReader(requestBody))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if got := recorder.Header().Get("Content-Type"); got != jsonContentType {
		t.Fatalf("content-type mismatch: got %q want %q", got, jsonContentType)
	}

	var response service.GenerateResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response JSON: %v", err)
	}
	if got := mustMarshalIndented(t, response); strings.TrimSpace(got) != strings.TrimSpace(expectedResponse) {
		t.Fatalf("generate response mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, expectedResponse)
	}
}

func TestSubscriptionHandler_HappyPath(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	expectedConfig := readTextFixture(t, filepath.Join(fixtureDir, "complete-config.chain.yaml"))

	var generateResponse service.GenerateResponse
	readJSONFixture(t, filepath.Join(fixtureDir, "generate.response.json"), &generateResponse)

	handler := mustNewTestHandler(t, &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	})

	request := httptest.NewRequest(http.MethodGet, generateResponse.LongURL, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if got := recorder.Header().Get("Content-Type"); got != yamlContentType {
		t.Fatalf("content-type mismatch: got %q want %q", got, yamlContentType)
	}
	if got := recorder.Header().Get("Cache-Control"); got != noStoreHeader {
		t.Fatalf("cache-control mismatch: got %q want %q", got, noStoreHeader)
	}
	if got := recorder.Header().Get("Content-Disposition"); got != `inline; filename="subscription.yaml"` {
		t.Fatalf("content-disposition mismatch: got %q", got)
	}
	if strings.TrimSpace(recorder.Body.String()) != strings.TrimSpace(expectedConfig) {
		t.Fatalf("subscription body mismatch:\n--- got ---\n%s\n--- want ---\n%s", recorder.Body.String(), expectedConfig)
	}
}

func TestSubscriptionHandler_DownloadDisposition(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var generateResponse service.GenerateResponse
	readJSONFixture(t, filepath.Join(fixtureDir, "generate.response.json"), &generateResponse)

	handler := mustNewTestHandler(t, &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	})

	request := httptest.NewRequest(http.MethodGet, generateResponse.LongURL+"&download=1", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if got := recorder.Header().Get("Content-Disposition"); got != `attachment; filename="subscription.yaml"` {
		t.Fatalf("content-disposition mismatch: got %q", got)
	}
}

func TestHealthzHandler(t *testing.T) {
	handler := mustNewTestHandler(t, &fakeConversionSource{})

	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if got := recorder.Header().Get("Content-Type"); got != "text/plain; charset=utf-8" {
		t.Fatalf("content-type mismatch: got %q want %q", got, "text/plain; charset=utf-8")
	}
	if got := recorder.Body.String(); got != "ok\n" {
		t.Fatalf("body mismatch: got %q want %q", got, "ok\n")
	}
}

func mustNewTestHandler(t *testing.T, source service.ConversionSource) *Handler {
	t.Helper()

	handler, err := NewHandler(source, "http://localhost:11200", 2048)
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}
	return handler
}

func fixtureDirectory(t *testing.T) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}

	return filepath.Join(
		filepath.Dir(currentFile),
		"..",
		"..",
		"testdata",
		"subconverter",
		"3pass-ss2022-test-subscription",
	)
}

func readJSONFixture(t *testing.T, path string, target any) {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %q: %v", path, err)
	}
	if err := json.Unmarshal(data, target); err != nil {
		t.Fatalf("unmarshal fixture %q: %v", path, err)
	}
}

func readTextFixture(t *testing.T, path string) string {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %q: %v", path, err)
	}
	return strings.ReplaceAll(string(data), "\r\n", "\n")
}

func mustMarshalIndented(t *testing.T, value any) string {
	t.Helper()

	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("json.MarshalIndent() error = %v", err)
	}
	return string(data)
}

func loadThreePassResult(t *testing.T, fixtureDir string) subconverter.ThreePassResult {
	t.Helper()

	return subconverter.ThreePassResult{
		LandingDiscovery: subconverter.PassResult{
			RequestURL: readTextFixture(t, filepath.Join(fixtureDir, "landing-discovery.url.txt")),
			YAML:       readTextFixture(t, filepath.Join(fixtureDir, "landing-discovery.yaml")),
		},
		TransitDiscovery: subconverter.PassResult{
			RequestURL: readTextFixture(t, filepath.Join(fixtureDir, "transit-discovery.url.txt")),
			YAML:       readTextFixture(t, filepath.Join(fixtureDir, "transit-discovery.yaml")),
		},
		FullBase: subconverter.PassResult{
			RequestURL: readTextFixture(t, filepath.Join(fixtureDir, "full-base.url.txt")),
			YAML:       readTextFixture(t, filepath.Join(fixtureDir, "full-base.yaml")),
		},
	}
}
