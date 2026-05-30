// Package applog provides structured operator logging for chain-subconverter.
// User-facing API messages live in JSON responses; this package is for stderr /
// container logs only.
package applog

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"sync"
)

const (
	componentAccess       = "access"
	componentAPI          = "api"
	componentBoot         = "startup"
	componentSubconverter = "subconverter"
	componentTemplate     = "template"
)

var (
	loggerMu sync.RWMutex
	logger   = slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
)

// AccessMeta describes one HTTP request summary for operator logs.
type AccessMeta struct {
	Method       string
	Path         string
	Status       int
	Duration     int64
	ClientIP     string
	RequestID    string
	Operation    string
	ErrorCode    string
	WarningCodes []string
	OriginScheme string
	OriginHost   string
	TrustedProxy bool
}

// APIErrorMeta describes one API operation failure for operator logs.
type APIErrorMeta struct {
	RequestID  string
	Operation  string
	Status     int
	Code       string
	Scope      string
	Retryable  *bool
	Cause      string
	UpstreamOp string
}

// UpstreamUnavailableMeta describes one unavailable upstream/subconverter failure.
type UpstreamUnavailableMeta struct {
	RequestID       string
	Operation       string
	ProblemClass    string
	UserInputSource string
	Cause           string
}

// Init configures the process-wide logger from LOG_LEVEL (DEBUG|INFO|WARN|ERROR).
func Init() {
	SetLogger(slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{
		Level: parseLevel(os.Getenv("LOG_LEVEL")),
	})))
}

// SetLogger replaces the process-wide logger (tests).
func SetLogger(next *slog.Logger) {
	loggerMu.Lock()
	defer loggerMu.Unlock()
	if next == nil {
		next = slog.New(slog.NewTextHandler(os.Stderr, &slog.HandlerOptions{Level: slog.LevelInfo}))
	}
	logger = next
}

// Access logs one HTTP request summary without query/body secrets.
func Access(meta AccessMeta) {
	attrs := []slog.Attr{
		slog.String("method", meta.Method),
		slog.String("path", meta.Path),
		slog.Int("status", meta.Status),
		slog.Int64("duration_ms", meta.Duration),
		slog.String("client_ip", meta.ClientIP),
	}
	if meta.RequestID != "" {
		attrs = append(attrs, slog.String("request_id", meta.RequestID))
	}
	if meta.Operation != "" {
		attrs = append(attrs, slog.String("op", meta.Operation))
	}
	if meta.ErrorCode != "" {
		attrs = append(attrs, slog.String("error_code", meta.ErrorCode))
	}
	if len(meta.WarningCodes) > 0 {
		attrs = append(attrs, slog.String("warning_codes", strings.Join(meta.WarningCodes, ",")))
	}
	if meta.OriginScheme != "" {
		attrs = append(attrs, slog.String("origin_scheme", meta.OriginScheme))
	}
	if meta.OriginHost != "" {
		attrs = append(attrs, slog.String("origin_host", meta.OriginHost))
	}
	attrs = append(attrs, slog.Bool("trusted_proxy", meta.TrustedProxy))

	logAttrs(accessLevel(meta.Status, len(meta.WarningCodes) > 0), componentAccess, "http_request", attrs)
}

// APIError logs a failed API operation with request correlation metadata.
func APIError(meta APIErrorMeta) {
	attrs := []slog.Attr{
		slog.String("operation", meta.Operation),
		slog.Int("status", meta.Status),
		slog.String("code", meta.Code),
	}
	if meta.RequestID != "" {
		attrs = append(attrs, slog.String("request_id", meta.RequestID))
	}
	if meta.Scope != "" {
		attrs = append(attrs, slog.String("scope", meta.Scope))
	}
	if meta.Retryable != nil {
		attrs = append(attrs, slog.Bool("retryable", *meta.Retryable))
	}
	if meta.UpstreamOp != "" {
		attrs = append(attrs, slog.String("upstream_op", meta.UpstreamOp))
	}
	if meta.Cause != "" {
		attrs = append(attrs, slog.String("error", meta.Cause))
	}

	level := slog.LevelWarn
	if meta.Status >= 500 {
		level = slog.LevelError
	}
	logAttrs(level, componentAPI, "request_failed", attrs)
}

// UpstreamUnavailable logs a dependency-unavailable failure with classified business context.
func UpstreamUnavailable(meta UpstreamUnavailableMeta) {
	attrs := []slog.Attr{}
	if meta.RequestID != "" {
		attrs = append(attrs, slog.String("request_id", meta.RequestID))
	}
	if meta.Operation != "" {
		attrs = append(attrs, slog.String("operation", meta.Operation))
	}
	if meta.ProblemClass != "" {
		attrs = append(attrs, slog.String("problem_class", meta.ProblemClass))
	}
	if meta.UserInputSource != "" {
		attrs = append(attrs, slog.String("user_input_source", meta.UserInputSource))
	}
	if meta.Cause != "" {
		attrs = append(attrs, slog.String("error", meta.Cause))
	}
	logAttrs(slog.LevelWarn, componentAPI, "upstream_unavailable", attrs)
}

// SubconverterPass logs one subconverter pass timing summary.
func SubconverterPass(pass string, durationMS int64, err error) {
	attrs := []slog.Attr{
		slog.String("pass", pass),
		slog.Int64("duration_ms", durationMS),
	}
	if err != nil {
		attrs = append(attrs, slog.String("error", err.Error()))
		logAttrs(slog.LevelWarn, componentSubconverter, "pass_failed", attrs)
		return
	}
	logAttrs(slog.LevelInfo, componentSubconverter, "pass_completed", attrs)
}

// TemplateCacheUsed logs default template stale-cache fallback for operators.
func TemplateCacheUsed(templateURL string) {
	attrs := []slog.Attr{}
	if templateURL != "" {
		attrs = append(attrs, slog.String("template_url", templateURL))
	}
	logAttrs(slog.LevelInfo, componentTemplate, "default_template_cache_used", attrs)
}

// Info logs a startup or lifecycle message.
func Info(msg string, attrs ...slog.Attr) {
	logAttrs(slog.LevelInfo, componentBoot, msg, attrs)
}

// StringAttr is a small helper for optional startup fields.
func StringAttr(key, value string) slog.Attr {
	return slog.String(key, value)
}

func logAttrs(level slog.Level, component string, msg string, attrs []slog.Attr) {
	loggerMu.RLock()
	l := logger
	loggerMu.RUnlock()

	args := make([]any, 0, len(attrs)+1)
	args = append(args, slog.String("component", component))
	for _, attr := range attrs {
		args = append(args, attr)
	}
	l.Log(context.TODO(), level, msg, args...)
}

func accessLevel(status int, hasWarnings bool) slog.Level {
	switch {
	case status >= 500:
		return slog.LevelError
	case status == 429 || status == 503:
		return slog.LevelWarn
	case hasWarnings:
		return slog.LevelWarn
	default:
		return slog.LevelInfo
	}
}

func parseLevel(raw string) slog.Level {
	switch strings.ToUpper(strings.TrimSpace(raw)) {
	case "DEBUG":
		return slog.LevelDebug
	case "WARN", "WARNING":
		return slog.LevelWarn
	case "ERROR":
		return slog.LevelError
	default:
		return slog.LevelInfo
	}
}
