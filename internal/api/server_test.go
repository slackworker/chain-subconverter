package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
	"time"

	"github.com/slackworker/chain-subconverter/internal/config"
	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

type fakeConversionSource struct {
	gotRequest subconverter.Request
	result     subconverter.ThreePassResult
	err        error
}

func (source *fakeConversionSource) Convert(_ context.Context, request subconverter.Request) (subconverter.ThreePassResult, error) {
	source.gotRequest = request
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

func TestStage1ConvertHandler_NormalizesEmptyAdvancedOptionStrings(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}
	handler := mustNewTestHandler(t, source)

	request := httptest.NewRequest(
		http.MethodPost,
		"/api/stage1/convert",
		strings.NewReader(`{"stage1Input":{"landingRawText":"ss://landing","transitRawText":"ss://transit","forwardRelayItems":[],"advancedOptions":{"emoji":null,"udp":null,"skipCertVerify":null,"config":"","include":[],"exclude":[]}}}`),
	)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if source.gotRequest.Options.Config != nil || source.gotRequest.Options.Include != nil || source.gotRequest.Options.Exclude != nil {
		t.Fatalf(
			"expected empty advanced option strings to normalize to nil: got config=%v include=%v exclude=%v",
			source.gotRequest.Options.Config,
			source.gotRequest.Options.Include,
			source.gotRequest.Options.Exclude,
		)
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

func TestResolveURLHandler_ResolvesShortURL(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	var requestPayload service.GenerateRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.request.json"), &requestPayload)

	storedLongURL, err := service.EncodeLongURL(
		"https://legacy.example.com/base",
		service.BuildLongURLPayload(requestPayload.Stage1Input, requestPayload.Stage2Snapshot),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	shortLinks := service.NewInMemoryShortLinkStore()
	shortLinks.Save("7NpK2mQx9a", storedLongURL)

	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}, shortLinks)

	request := httptest.NewRequest(http.MethodPost, "/api/resolve-url", strings.NewReader(`{"url":"https://example.com/sub/7NpK2mQx9a"}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	var response service.ResolveURLResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response JSON: %v", err)
	}

	wantLongURL, err := service.EncodeLongURL(
		"http://localhost:11200",
		service.BuildLongURLPayload(requestPayload.Stage1Input, requestPayload.Stage2Snapshot),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	if response.LongURL != wantLongURL {
		t.Fatalf("longUrl mismatch: got %q want %q", response.LongURL, wantLongURL)
	}
	if response.ShortURL != "http://localhost:11200/sub/7NpK2mQx9a" {
		t.Fatalf("shortUrl mismatch: got %q want %q", response.ShortURL, "http://localhost:11200/sub/7NpK2mQx9a")
	}
	if response.RestoreStatus != "replayable" {
		t.Fatalf("restoreStatus mismatch: got %q want %q", response.RestoreStatus, "replayable")
	}
	if len(response.Messages) != 0 || len(response.BlockingErrors) != 0 {
		t.Fatalf("expected empty messages/errors, got messages=%v blockingErrors=%v", response.Messages, response.BlockingErrors)
	}
}

func TestResolveURLHandler_MapsShortURLNotFoundToSpecModel(t *testing.T) {
	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, service.NewInMemoryShortLinkStore())

	request := httptest.NewRequest(http.MethodPost, "/api/resolve-url", strings.NewReader(`{"url":"https://example.com/sub/missing"}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "SHORT_URL_NOT_FOUND",
		Message: "short URL not found",
		Scope:   "stage3_field",
		Context: map[string]any{"field": "currentLinkInput"},
	})
}

func TestResolveURLHandler_MapsDecodeFailuresToStage3FieldScope(t *testing.T) {
	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, service.NewInMemoryShortLinkStore())

	testCases := []struct {
		name    string
		body    string
		message string
	}{
		{
			name:    "malformed json",
			body:    `{"url":`,
			message: "decode JSON body: unexpected EOF",
		},
		{
			name:    "wrong field type",
			body:    `{"url":123}`,
			message: "decode JSON body: json: cannot unmarshal number into Go struct field ResolveURLRequest.url of type string",
		},
		{
			name:    "unknown field",
			body:    `{"unexpected":"value"}`,
			message: "decode JSON body: json: unknown field \"unexpected\"",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/resolve-url", strings.NewReader(testCase.body))
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)

			assertBlockingError(t, recorder, http.StatusBadRequest, service.BlockingError{
				Code:    "INVALID_REQUEST",
				Message: testCase.message,
				Scope:   "stage3_field",
				Context: map[string]any{"field": "currentLinkInput"},
			})
		})
	}
}

func TestResolveURLHandler_MapsShortLinkStoreUnavailableToSpecModel(t *testing.T) {
	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, failingShortLinkStore{err: errors.New("store unavailable")})

	request := httptest.NewRequest(http.MethodPost, "/api/resolve-url", strings.NewReader(`{"url":"https://example.com/sub/7NpK2mQx9a"}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusServiceUnavailable, service.BlockingError{
		Code:      "SHORT_LINK_STORE_UNAVAILABLE",
		Message:   "short link store is unavailable",
		Scope:     "global",
		Retryable: boolPtr(true),
	})
}

func TestShortLinksHandler_HappyPath(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	var requestPayload service.GenerateRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.request.json"), &requestPayload)

	legacyLongURL, err := service.EncodeLongURL(
		"https://legacy.example.com/base",
		service.BuildLongURLPayload(requestPayload.Stage1Input, requestPayload.Stage2Snapshot),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}, service.NewInMemoryShortLinkStore())

	request := httptest.NewRequest(http.MethodPost, "/api/short-links", strings.NewReader(`{"longUrl":"`+legacyLongURL+`"}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}

	var response service.ShortLinkResponse
	if err := json.NewDecoder(recorder.Body).Decode(&response); err != nil {
		t.Fatalf("decode response JSON: %v", err)
	}

	wantLongURL, err := service.EncodeLongURL(
		"http://localhost:11200",
		service.BuildLongURLPayload(requestPayload.Stage1Input, requestPayload.Stage2Snapshot),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}
	wantShortURL, err := service.BuildShortURL("http://localhost:11200", service.DeterministicShortID(wantLongURL))
	if err != nil {
		t.Fatalf("BuildShortURL() error = %v", err)
	}

	if response.LongURL != wantLongURL {
		t.Fatalf("longUrl mismatch: got %q want %q", response.LongURL, wantLongURL)
	}
	if response.ShortURL != wantShortURL {
		t.Fatalf("shortUrl mismatch: got %q want %q", response.ShortURL, wantShortURL)
	}
	if len(response.Messages) != 0 || len(response.BlockingErrors) != 0 {
		t.Fatalf("expected empty messages/errors, got messages=%v blockingErrors=%v", response.Messages, response.BlockingErrors)
	}

	request = httptest.NewRequest(http.MethodPost, "/api/short-links", strings.NewReader(`{"longUrl":"`+legacyLongURL+`"}`))
	recorder = httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)
	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch on second request: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	var secondResponse service.ShortLinkResponse
	if err := json.NewDecoder(recorder.Body).Decode(&secondResponse); err != nil {
		t.Fatalf("decode second response JSON: %v", err)
	}
	if secondResponse.ShortURL != response.ShortURL {
		t.Fatalf("shortUrl should be idempotent: got %q want %q", secondResponse.ShortURL, response.ShortURL)
	}
}

func TestShortLinksHandler_MapsInvalidLongURLToSpecModel(t *testing.T) {
	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, service.NewInMemoryShortLinkStore())

	request := httptest.NewRequest(http.MethodPost, "/api/short-links", strings.NewReader(`{"longUrl":"https://example.com/sub/7NpK2mQx9a"}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "INVALID_LONG_URL",
		Message: "long URL payload is invalid",
		Scope:   "stage3_field",
		Context: map[string]any{"field": "currentLinkInput"},
	})
}

func TestShortLinksHandler_MapsDecodeFailuresToStage3FieldScope(t *testing.T) {
	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, service.NewInMemoryShortLinkStore())

	testCases := []struct {
		name    string
		body    string
		message string
	}{
		{
			name:    "malformed json",
			body:    `{"longUrl":`,
			message: "decode JSON body: unexpected EOF",
		},
		{
			name:    "wrong field type",
			body:    `{"longUrl":123}`,
			message: "decode JSON body: json: cannot unmarshal number into Go struct field ShortLinkRequest.longUrl of type string",
		},
		{
			name:    "unknown field",
			body:    `{"unexpected":"value"}`,
			message: "decode JSON body: json: unknown field \"unexpected\"",
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			request := httptest.NewRequest(http.MethodPost, "/api/short-links", strings.NewReader(testCase.body))
			recorder := httptest.NewRecorder()
			handler.ServeHTTP(recorder, request)

			assertBlockingError(t, recorder, http.StatusBadRequest, service.BlockingError{
				Code:    "INVALID_REQUEST",
				Message: testCase.message,
				Scope:   "stage3_field",
				Context: map[string]any{"field": "currentLinkInput"},
			})
		})
	}
}

func TestShortLinksHandler_MapsShortLinkStoreUnavailableToSpecModel(t *testing.T) {
	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, failingShortLinkStore{err: errors.New("store unavailable")})
	validLongURL, err := service.EncodeLongURL(
		"http://localhost:11200",
		service.BuildLongURLPayload(service.Stage1Input{}, service.Stage2Snapshot{}),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodPost, "/api/short-links", strings.NewReader(`{"longUrl":"`+validLongURL+`"}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusServiceUnavailable, service.BlockingError{
		Code:      "SHORT_LINK_STORE_UNAVAILABLE",
		Message:   "short link store is unavailable",
		Scope:     "global",
		Retryable: boolPtr(true),
	})
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

func TestSubscriptionHandler_CompatibleOuterQueryOverridesDecodedPayload(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var generateResponse service.GenerateResponse
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.response.json"), &generateResponse)

	source := &fakeConversionSource{result: loadThreePassResult(t, fixtureDir)}
	handler := mustNewTestHandler(t, source)

	request := httptest.NewRequest(http.MethodGet, generateResponse.LongURL+"&emoji=false", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if source.gotRequest.Options.Emoji == nil || *source.gotRequest.Options.Emoji {
		t.Fatalf("expected emoji override to propagate as false, got %+v", source.gotRequest.Options.Emoji)
	}
}

func TestSubscriptionHandler_PassesThroughExtraQueryToSubconverter(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var generateResponse service.GenerateResponse
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.response.json"), &generateResponse)

	source := &fakeConversionSource{result: loadThreePassResult(t, fixtureDir)}
	handler := mustNewTestHandler(t, source)

	request := httptest.NewRequest(http.MethodGet, generateResponse.LongURL+"&tfo=true", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if got := source.gotRequest.ExtraQuery.Get("tfo"); got != "true" {
		t.Fatalf("expected passthrough query tfo=true, got %q", got)
	}
	if source.gotRequest.ExtraQuery.Get("download") != "" {
		t.Fatalf("download query must not passthrough, got %+v", source.gotRequest.ExtraQuery)
	}
}

func TestShortSubscriptionHandler_HappyPath(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	expectedConfig := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "complete-config.chain.yaml"))

	var requestPayload service.GenerateRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.request.json"), &requestPayload)

	storedLongURL, err := service.EncodeLongURL(
		"https://legacy.example.com/base",
		service.BuildLongURLPayload(requestPayload.Stage1Input, requestPayload.Stage2Snapshot),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	shortLinks := service.NewInMemoryShortLinkStore()
	shortLinks.Save("7NpK2mQx9a", storedLongURL)
	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}, shortLinks)

	request := httptest.NewRequest(http.MethodGet, "/sub/7NpK2mQx9a", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if got := recorder.Header().Get("Content-Type"); got != yamlContentType {
		t.Fatalf("content-type mismatch: got %q want %q", got, yamlContentType)
	}
	if got := recorder.Header().Get("Content-Disposition"); got != `inline; filename="7NpK2mQx9a.yaml"` {
		t.Fatalf("content-disposition mismatch: got %q", got)
	}
	if strings.TrimSpace(recorder.Body.String()) != strings.TrimSpace(expectedConfig) {
		t.Fatalf("short subscription body mismatch:\n--- got ---\n%s\n--- want ---\n%s", recorder.Body.String(), expectedConfig)
	}
}

func TestShortSubscriptionHandler_MapsShortURLNotFoundToSpecModel(t *testing.T) {
	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, service.NewInMemoryShortLinkStore())

	request := httptest.NewRequest(http.MethodGet, "/sub/missing", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "SHORT_URL_NOT_FOUND",
		Message: "short URL not found",
		Scope:   "global",
	})
}

func TestShortSubscriptionHandler_MapsShortLinkStoreUnavailableToSpecModel(t *testing.T) {
	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, failingShortLinkStore{err: errors.New("store unavailable")})

	request := httptest.NewRequest(http.MethodGet, "/sub/7NpK2mQx9a", nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusServiceUnavailable, service.BlockingError{
		Code:      "SHORT_LINK_STORE_UNAVAILABLE",
		Message:   "short link store is unavailable",
		Scope:     "global",
		Retryable: boolPtr(true),
	})
}

func TestSubscriptionHandler_SupportsPublicBasePath(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	expectedConfig := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "complete-config.chain.yaml"))

	var generateResponse service.GenerateResponse
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.response.json"), &generateResponse)

	templateStore := service.NewInMemoryTemplateContentStore()
	handler, err := NewHandler(
		&fakeConversionSource{result: loadThreePassResult(t, fixtureDir)},
		templateStore,
		service.NewInMemoryShortLinkStore(),
		"http://localhost:11200/base",
		"http://localhost:11200",
		2048,
		service.InputLimits{},
	)
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}

	basePathLongURL, err := service.EncodeLongURL(
		"http://localhost:11200/base",
		mustDecodeLongURLPayloadFromString(t, generateResponse.LongURL),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, basePathLongURL, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if strings.TrimSpace(recorder.Body.String()) != strings.TrimSpace(expectedConfig) {
		t.Fatalf("subscription body mismatch with base path:\n--- got ---\n%s\n--- want ---\n%s", recorder.Body.String(), expectedConfig)
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

	request := httptest.NewRequest(http.MethodPost, "/api/stage1/convert", strings.NewReader(`{"stage1Input":{"landingRawText":"","transitRawText":"","forwardRelayItems":[" relay.example.com:80"],"advancedOptions":{"emoji":true,"udp":true,"skipCertVerify":false,"config":"","include":[],"exclude":[]}}}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "INVALID_FORWARD_RELAY_LINE",
		Message: "invalid forward relay line",
		Scope:   "stage1_field",
		Context: map[string]any{"field": "forwardRelayItems"},
	})
}

func TestGenerateHandler_MapsRowsetMismatchToSpecModel(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	handler := mustNewTestHandler(t, &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	})

	request := httptest.NewRequest(http.MethodPost, "/api/generate", strings.NewReader(`{"stage1Input":{"landingRawText":"ss://landing","transitRawText":"ss://transit","forwardRelayItems":[],"advancedOptions":{"emoji":true,"udp":true,"skipCertVerify":false,"config":"","include":[],"exclude":[]}},"stage2Snapshot":{"rows":[{"landingNodeName":"missing-row","mode":"chain","targetName":"🇭🇰 香港节点"}]}}`))
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

	templateStore := service.NewInMemoryTemplateContentStore()
	handler, err := NewHandler(&fakeConversionSource{result: loadThreePassResult(t, fixtureDir)}, templateStore, service.NewInMemoryShortLinkStore(), "http://localhost:11200", "http://localhost:11200", 32, service.InputLimits{})
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

func TestGenerateHandler_MapsEmptyChainTargetToSpecModel(t *testing.T) {
	handler := mustNewTestHandler(t, &fakeConversionSource{
		result: singleLandingResult("Unknown Landing", "ss", false),
	})

	request := httptest.NewRequest(http.MethodPost, "/api/generate", strings.NewReader(`{"stage1Input":{"landingRawText":"ss://landing","transitRawText":"","forwardRelayItems":[],"advancedOptions":{"emoji":true,"udp":true,"skipCertVerify":false,"config":"","include":[],"exclude":[]}},"stage2Snapshot":{"rows":[{"landingNodeName":"Unknown Landing","mode":"chain","targetName":"🇭🇰 香港节点"}]}}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "EMPTY_CHAIN_TARGET",
		Message: "chain target is empty",
		Scope:   "stage2_row",
		Context: map[string]any{"landingNodeName": "Unknown Landing", "field": "targetName"},
	})
}

func TestSubscriptionHandler_MapsRenderFailureToRenderFailed(t *testing.T) {
	targetName := "relay.example.com:80"
	longURL, err := service.EncodeLongURL(
		"http://localhost:11200",
		service.BuildLongURLPayload(
			service.Stage1Input{
				ForwardRelayItems: []string{targetName},
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

func TestSubscriptionHandler_RejectsDecodedInputLimitFailureAsInvalidLongURL(t *testing.T) {
	handler, err := NewHandler(
		&fakeConversionSource{},
		service.NewInMemoryTemplateContentStore(),
		service.NewInMemoryShortLinkStore(),
		"http://localhost:11200",
		"http://localhost:11200",
		2048,
		service.InputLimits{MaxInputSize: 8},
	)
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}

	longURL, err := service.EncodeLongURL(
		"http://localhost:11200",
		service.BuildLongURLPayload(
			service.Stage1Input{LandingRawText: strings.Repeat("a", 16)},
			service.Stage2Snapshot{},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, longURL, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "INVALID_LONG_URL",
		Message: "validate stage1 input limits: normalized input total size 16 exceeds limit 8",
		Scope:   "global",
	})
}

func TestSubscriptionHandler_RejectsSchemaInvalidLongURLAsInvalidLongURL(t *testing.T) {
	targetName := "HK Relay"
	longURL, err := service.EncodeLongURL(
		"http://localhost:11200",
		service.BuildLongURLPayload(
			service.Stage1Input{},
			service.Stage2Snapshot{
				Rows: []service.Stage2Row{{
					LandingNodeName: "HK 01",
					Mode:            "none",
					TargetName:      &targetName,
				}},
			},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	handler := mustNewTestHandler(t, &fakeConversionSource{})

	request := httptest.NewRequest(http.MethodGet, longURL, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "INVALID_LONG_URL",
		Message: `validate long URL payload schema: targetName must be empty for landing node "HK 01" when mode is none`,
		Scope:   "global",
	})
}

func TestShortLinksHandler_RejectsSchemaInvalidLongURLAsInvalidLongURL(t *testing.T) {
	longURL, err := service.EncodeLongURL(
		"http://localhost:11200",
		service.BuildLongURLPayload(
			service.Stage1Input{},
			service.Stage2Snapshot{
				Rows: []service.Stage2Row{{
					LandingNodeName: "HK 01",
					Mode:            "unsupported",
				}},
			},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	handler := mustNewTestHandlerWithShortLinks(t, &fakeConversionSource{}, service.NewInMemoryShortLinkStore())

	request := httptest.NewRequest(http.MethodPost, "/api/short-links", strings.NewReader(`{"longUrl":"`+longURL+`"}`))
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	assertBlockingError(t, recorder, http.StatusUnprocessableEntity, service.BlockingError{
		Code:    "INVALID_LONG_URL",
		Message: "long URL payload is invalid",
		Scope:   "stage3_field",
		Context: map[string]any{"field": "currentLinkInput"},
	})
}

func TestManagedTemplateHandler_ServesConfiguredPrefixedRoute(t *testing.T) {
	templateConfig := "custom_proxy_group=DE Special`fallback`(DE|德国)`https://cp.cloudflare.com/generate_204`300,,50\n"
	templateServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write([]byte(templateConfig))
	}))
	defer templateServer.Close()

	client, err := subconverter.NewClient(config.Subconverter{
		BaseURL:     "http://localhost:25511/sub?",
		Timeout:     time.Second,
		MaxInFlight: 1,
	})
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}
	templateStore := service.NewInMemoryTemplateContentStore()

	managedSource, err := service.NewManagedConversionSource(client, templateStore, "http://internal.example.com/base", time.Second, service.ManagedConversionSourceOptions{})
	if err != nil {
		t.Fatalf("NewManagedConversionSource() error = %v", err)
	}

	prepared, err := managedSource.PrepareConversion(context.Background(), service.Stage1Input{
		AdvancedOptions: service.AdvancedOptions{
			Config: stringPtr(templateServer.URL),
		},
	})
	if err != nil {
		t.Fatalf("PrepareConversion() error = %v", err)
	}
	defer prepared.Cleanup()

	if prepared.Request.Options.Config == nil {
		t.Fatal("managed config URL should not be nil")
	}

	handler, err := NewHandler(&fakeConversionSource{}, templateStore, service.NewInMemoryShortLinkStore(), "http://localhost:11200", "http://internal.example.com/base", 2048, service.InputLimits{})
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}

	request := httptest.NewRequest(http.MethodGet, *prepared.Request.Options.Config, nil)
	recorder := httptest.NewRecorder()
	handler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d, body=%s", recorder.Code, http.StatusOK, recorder.Body.String())
	}
	if strings.TrimSpace(recorder.Body.String()) != strings.TrimSpace(templateConfig) {
		t.Fatalf("managed template body mismatch: got %q want %q", recorder.Body.String(), templateConfig)
	}
}

func mustNewTestHandler(t *testing.T, source service.ConversionSource) *Handler {
	t.Helper()

	return mustNewTestHandlerWithShortLinks(t, source, service.NewInMemoryShortLinkStore())
}

func mustNewTestHandlerWithShortLinks(t *testing.T, source service.ConversionSource, shortLinkStore service.ShortLinkStore) *Handler {
	t.Helper()

	templateStore := service.NewInMemoryTemplateContentStore()
	handler, err := NewHandler(source, templateStore, shortLinkStore, "http://localhost:11200", "http://localhost:11200", 2048, service.InputLimits{})
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}
	return handler
}

func boolPtr(value bool) *bool {
	return &value
}

func stringPtr(value string) *string {
	return &value
}

type failingShortLinkStore struct {
	err error
}

func (store failingShortLinkStore) CreateOrGet(_ context.Context, _ string, _ string) (service.ShortLinkEntry, error) {
	return service.ShortLinkEntry{}, store.err
}

func (store failingShortLinkStore) ResolveShortID(_ context.Context, _ string) (string, error) {
	return "", store.err
}

func mustDecodeLongURLPayloadFromString(t *testing.T, longURL string) service.LongURLPayload {
	t.Helper()

	payload, err := service.DecodeLongURLPayload(longURL, service.InputLimits{})
	if err != nil {
		t.Fatalf("DecodeLongURLPayload() error = %v", err)
	}
	return payload
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
	if !reflect.DeepEqual(got.Retryable, want.Retryable) {
		t.Fatalf("blocking error retryable mismatch: got %v want %v", got.Retryable, want.Retryable)
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
