package api

import (
	"bytes"
	"log"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"

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

	wrappedHandler := WithAccessLog(&frontendAssetsHandler{next: handler})
	request := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	request.RemoteAddr = "172.18.0.2:12345"
	request.Header.Set("X-Forwarded-For", "203.0.113.10")
	recorder := httptest.NewRecorder()

	previousWriter := log.Writer()
	previousFlags := log.Flags()
	defer log.SetOutput(previousWriter)
	defer log.SetFlags(previousFlags)

	var buffer bytes.Buffer
	log.SetOutput(&buffer)
	log.SetFlags(0)

	wrappedHandler.ServeHTTP(recorder, request)

	if recorder.Code != http.StatusOK {
		t.Fatalf("status mismatch: got %d want %d", recorder.Code, http.StatusOK)
	}
	if !strings.Contains(buffer.String(), "client_ip=203.0.113.10") {
		t.Fatalf("access log should include trusted forwarded client IP, got %q", buffer.String())
	}
}
