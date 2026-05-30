package api

import (
	"bytes"
	"log/slog"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/applog"
	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

func TestWithAccessLog_UsesTrustedForwardedClientIP(t *testing.T) {
	handler, err := NewHandler(
		&fakeConversionSource{result: subconverter.ThreePassResult{}},
		service.NewInMemoryTemplateContentStore(),
		service.NewInMemoryShortLinkStore(),
		"",
		"http://localhost:11200",
		2048,
		service.InputLimits{},
		WithTrustedProxyCIDRs("172.16.0.0/12"),
	)
	if err != nil {
		t.Fatalf("NewHandler() error = %v", err)
	}

	wrappedHandler := WithRequestContext(WithAccessLog(&frontendAssetsHandler{next: handler}))
	request := httptest.NewRequest(http.MethodPost, "/api/resolve-url", strings.NewReader(`{"url":""}`))
	request.Header.Set("Content-Type", "application/json")
	request.RemoteAddr = "172.18.0.2:12345"
	request.Header.Set("X-Forwarded-For", "203.0.113.10")
	recorder := httptest.NewRecorder()

	var buffer bytes.Buffer
	applog.SetLogger(slog.New(slog.NewTextHandler(&buffer, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(applog.Init)

	wrappedHandler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusBadRequest {
		t.Fatalf("status mismatch: got %d want %d", recorder.Code, http.StatusBadRequest)
	}
	if !strings.Contains(buffer.String(), "client_ip=203.0.113.10") {
		t.Fatalf("access log should include trusted forwarded client IP, got %q", buffer.String())
	}
	if !strings.Contains(buffer.String(), "request_id=") {
		t.Fatalf("access log should include request ID, got %q", buffer.String())
	}
	if got := recorder.Header().Get("X-Request-ID"); strings.TrimSpace(got) == "" {
		t.Fatal("response should include X-Request-ID header")
	}
}

func TestWithAccessLog_SkipsSuccessfulHealthz(t *testing.T) {
	handler := WithAccessLog(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.WriteHeader(http.StatusOK)
	}))
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	recorder := httptest.NewRecorder()

	var buffer bytes.Buffer
	applog.SetLogger(slog.New(slog.NewTextHandler(&buffer, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(applog.Init)

	handler.ServeHTTP(recorder, request)

	if buffer.Len() != 0 {
		t.Fatalf("successful healthz should not be logged, got %q", buffer.String())
	}
}

func TestWithAccessLog_LogsWarningCodesOnSuccessfulAPIResponses(t *testing.T) {
	handler := WithAccessLog(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		writer.Header().Set("Content-Type", "application/json")
		writer.WriteHeader(http.StatusOK)
		if recorder, ok := writer.(interface{ SetAccessLogMessages([]service.Message) }); ok {
			recorder.SetAccessLogMessages([]service.Message{{Level: "warning", Code: "DEFAULT_TEMPLATE_CACHE_USED"}})
		}
	}))
	request := httptest.NewRequest(http.MethodPost, "/api/stage1/convert", nil)
	recorder := httptest.NewRecorder()

	var buffer bytes.Buffer
	applog.SetLogger(slog.New(slog.NewTextHandler(&buffer, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(applog.Init)

	handler.ServeHTTP(recorder, request)

	logLine := buffer.String()
	if !strings.Contains(logLine, "level=WARN") {
		t.Fatalf("expected WARN access log, got %q", logLine)
	}
	if !strings.Contains(logLine, "warning_codes=DEFAULT_TEMPLATE_CACHE_USED") {
		t.Fatalf("expected warning codes in access log, got %q", logLine)
	}
}
