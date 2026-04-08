package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
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
	requestBody := readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.request.json"))
	expectedResponse := readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.response.json"))

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
	requestBody := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.request.json"))
	expectedResponse := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.response.json"))

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
	expectedConfig := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "complete-config.chain.yaml"))

	var generateResponse service.GenerateResponse
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.response.json"), &generateResponse)

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
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.response.json"), &generateResponse)

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

func TestStage1ConvertHandler_MapsForwardRelayErrorToSpecModel(t *testing.T) {
	handler := mustNewTestHandler(t, &fakeConversionSource{
		result: singleLandingResult("HK Landing", "ss", false),
	})

	request := httptest.NewRequest(http.MethodPost, "/api/stage1/convert", strings.NewReader(`{"stage1Input":{"landingRawText":"","transitRawText":"","forwardRelayRawText":" relay.example.com:80","advancedOptions":{"emoji":true,"udp":true,"skipCertVerify":false,"config":"","include":"","exclude":"","enablePortForward":true}}}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "INVALID_FORWARD_RELAY_LINE",
		Message: "invalid forward relay line",
		Scope:   "stage1_field",
		Context: map[string]any{"field": "forwardRelayRawText"},
	})
}

func TestGenerateHandler_MapsRowsetMismatchToSpecModel(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	handler := mustNewTestHandler(t, &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	})

	request := httptest.NewRequest(http.MethodPost, "/api/generate", strings.NewReader(`{"stage1Input":{"landingRawText":"ss://landing","transitRawText":"ss://transit","forwardRelayRawText":"","advancedOptions":{"emoji":true,"udp":true,"skipCertVerify":false,"config":"","include":"","exclude":"","enablePortForward":false}},"stage2Snapshot":{"rows":[{"landingNodeName":"missing-row","mode":"chain","targetName":"🇭🇰 香港节点"}]}}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "STAGE2_ROWSET_MISMATCH",
		Message: "stage2 rowset mismatch",
		Scope:   "global",
	})
}

func TestGenerateHandler_MapsLongURLTooLongToSpecModel(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	requestBody := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.request.json"))

	handler, err := NewHandler(&fakeConversionSource{result: loadThreePassResult(t, fixtureDir)}, "http://localhost:11200", 32)
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/generate", strings.NewReader(requestBody))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "LONG_URL_TOO_LONG",
		Message: "long URL exceeds maximum length",
		Scope:   "global",
	})
}

func TestSubscriptionHandler_MapsRenderFailureToRenderFailed(t *testing.T) {
	targetName := "relay.example.com:80"
	longURL, err := service.EncodeLongURL(
		"http://localhost:11200",
		service.BuildLongURLPayload(
			service.Stage1Input{
				ForwardRelayRawText: targetName,
				AdvancedOptions: service.AdvancedOptions{
					EnablePortForward: true,
				},
			},
			service.Stage2Snapshot{
				Rows: []service.Stage2Row{{
					LandingNodeName: "HK Landing",
					Mode:            "port_forward",
					TargetName:      &targetName,
				}},
			},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	handler := mustNewTestHandler(t, &fakeConversionSource{
		result: singleLandingResult("HK Landing", "ss", true),
	})

	request := httptest.NewRequest(http.MethodGet, longURL, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusInternalServerError, service.BlockingError{
		Code:    "RENDER_FAILED",
		Message: `apply stage2 row for landing node "HK Landing": proxy is missing server field`,
		Scope:   "global",
	})
}

func mustNewTestHandler(t *testing.T, source service.ConversionSource) *Handler {
	t.Helper()

	handler, err := NewHandler(source, "http://localhost:11200", 2048)
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}
	return handler
}

func assertBlockingError(t *testing.T, recorder *httptest.ResponseRecorder, wantStatus int, want service.BlockingError) {
	t.Helper()

	if recorder.Code != wantStatus {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, wantStatus, recorder.Body.String())
	}

	var response struct {
		Messages       []service.Message       `json:"messages"`
		BlockingErrors []service.BlockingError `json:"blockingErrors"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode error response JSON: %v", err)
	}
	if len(response.Messages) != 0 {
		t.Fatalf("expected empty messages, got %v", response.Messages)
	}
	if len(response.BlockingErrors) != 1 {
		t.Fatalf("expected 1 blocking error, got %v", response.BlockingErrors)
	}

	got := response.BlockingErrors[0]
	if got.Code != want.Code || got.Message != want.Message || got.Scope != want.Scope {
		t.Fatalf("blocking error mismatch: got %+v want %+v", got, want)
	}
	if !reflect.DeepEqual(got.Context, want.Context) {
		t.Fatalf("blocking error context mismatch: got %v want %v", got.Context, want.Context)
	}
}

func singleLandingResult(landingName string, landingType string, omitServer bool) subconverter.ThreePassResult {
	proxyLine := "- {name: " + landingName + ", type: " + landingType + ", server: landing.example.com, port: 443}"
	if omitServer {
		proxyLine = "- {name: " + landingName + ", type: " + landingType + ", port: 443}"
	}

	fullBaseYAML := strings.Join([]string{
		"proxies:",
		proxyLine,
		"proxy-groups:",
		"  - name: 🇭🇰 香港节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"  - name: 🇺🇸 美国节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"  - name: 🇯🇵 日本节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"  - name: 🇸🇬 新加坡节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"  - name: 🇼🇸 台湾节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"  - name: 🇰🇷 韩国节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"",
	}, "\n")

	return subconverter.ThreePassResult{
		LandingDiscovery: subconverter.PassResult{YAML: "proxies:\n- {name: " + landingName + ", type: " + landingType + "}\n"},
		TransitDiscovery: subconverter.PassResult{YAML: "proxies:\n"},
		FullBase:         subconverter.PassResult{YAML: fullBaseYAML},
	}
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
		"internal",
		"review",
		"testdata",
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
			RequestURL: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "landing-discovery.url.txt")),
			YAML:       readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "landing-discovery.yaml")),
		},
		TransitDiscovery: subconverter.PassResult{
			RequestURL: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "transit-discovery.url.txt")),
			YAML:       readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "transit-discovery.yaml")),
		},
		FullBase: subconverter.PassResult{
			RequestURL: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "full-base.url.txt")),
			YAML:       readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "full-base.yaml")),
		},
	}
}
