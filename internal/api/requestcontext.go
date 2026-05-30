package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"net/http"
	pathpkg "path"
	"strings"
)

type requestContextKey struct{}

// RequestContext carries per-request metadata for access and operation logs.
type RequestContext struct {
	RequestID string
	Operation string
	ErrorCode string
}

const requestIDHeader = "X-Request-ID"

// WithRequestContext assigns a request id, exposes it on the response, and
// stores request metadata for downstream logging.
func WithRequestContext(next http.Handler) http.Handler {
	if next == nil {
		return http.NotFoundHandler()
	}

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		requestID := newRequestID()
		writer.Header().Set(requestIDHeader, requestID)

		meta := &RequestContext{
			RequestID: requestID,
			Operation: operationForRequest(request.Method, request.URL.Path),
		}
		ctx := context.WithValue(request.Context(), requestContextKey{}, meta)
		next.ServeHTTP(writer, request.WithContext(ctx))
	})
}

// RequestContextFrom returns request metadata when present.
func RequestContextFrom(ctx context.Context) (RequestContext, bool) {
	meta, ok := ctx.Value(requestContextKey{}).(*RequestContext)
	if !ok || meta == nil {
		return RequestContext{}, false
	}
	return *meta, true
}

// SetRequestErrorCode records the primary blocking error code for access logs.
func SetRequestErrorCode(ctx context.Context, code string) {
	meta, ok := ctx.Value(requestContextKey{}).(*RequestContext)
	if !ok || meta == nil || code == "" {
		return
	}
	meta.ErrorCode = code
}

func newRequestID() string {
	var raw [12]byte
	if _, err := rand.Read(raw[:]); err != nil {
		return "unknown"
	}
	return hex.EncodeToString(raw[:])
}

func operationForRequest(method, requestPath string) string {
	cleanPath := pathpkg.Clean("/" + strings.TrimSpace(requestPath))
	isRead := method == http.MethodGet || method == http.MethodHead

	switch {
	case method == http.MethodPost && cleanPath == "/api/stage1/convert":
		return "stage1_convert"
	case method == http.MethodPost && cleanPath == "/api/generate":
		return "generate"
	case method == http.MethodPost && cleanPath == "/api/short-links":
		return "short_link_create"
	case method == http.MethodPost && cleanPath == "/api/resolve-url":
		return "resolve_url"
	case isRead && cleanPath == "/api/runtime-config":
		return "runtime_config"
	case isRead && cleanPath == "/api/runtime-status":
		return "runtime_status"
	case isRead && cleanPath == "/healthz":
		return "healthz"
	case isRead && strings.Contains(cleanPath, "/internal/templates/"):
		return "managed_template"
	case isRead && strings.HasSuffix(cleanPath, "/sub"):
		return "render_subscription"
	case isRead && strings.Contains(cleanPath, "/sub/"):
		return "render_short_subscription"
	default:
		return "frontend"
	}
}
