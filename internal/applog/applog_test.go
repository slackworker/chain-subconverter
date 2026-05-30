package applog

import (
	"bytes"
	"log/slog"
	"strings"
	"testing"
)

func TestAccess_emitsStructuredFields(t *testing.T) {
	var buffer bytes.Buffer
	SetLogger(slog.New(slog.NewTextHandler(&buffer, &slog.HandlerOptions{Level: slog.LevelDebug})))
	t.Cleanup(Init)

	Access(AccessMeta{
		Method:       "GET",
		Path:         "/healthz",
		Status:       200,
		Duration:     3,
		ClientIP:     "127.0.0.1",
		RequestID:    "abc123",
		Operation:    "healthz",
		WarningCodes: []string{"DEFAULT_TEMPLATE_CACHE_USED"},
	})

	output := buffer.String()
	for _, want := range []string{
		"component=access",
		"method=GET",
		"path=/healthz",
		"status=200",
		"client_ip=127.0.0.1",
		"request_id=abc123",
		"op=healthz",
		"warning_codes=DEFAULT_TEMPLATE_CACHE_USED",
	} {
		if !strings.Contains(output, want) {
			t.Fatalf("access log missing %q in %q", want, output)
		}
	}
}

func TestParseLevel(t *testing.T) {
	if parseLevel("debug") != slog.LevelDebug {
		t.Fatal("expected debug level")
	}
	if parseLevel("") != slog.LevelInfo {
		t.Fatal("expected default info level")
	}
}
