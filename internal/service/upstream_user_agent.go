package service

import (
	"context"
	"strings"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

type upstreamUserAgentContextKey struct{}

// WithUpstreamUserAgent attaches an optional User-Agent override for upstream subconverter calls.
// Empty or whitespace-only values are ignored (callers still get DefaultUserAgent at the HTTP client).
func WithUpstreamUserAgent(ctx context.Context, userAgent string) context.Context {
	trimmed := strings.TrimSpace(userAgent)
	if trimmed == "" {
		return ctx
	}
	return context.WithValue(ctx, upstreamUserAgentContextKey{}, trimmed)
}

func upstreamUserAgentFromContext(ctx context.Context) string {
	if ctx == nil {
		return ""
	}
	value, _ := ctx.Value(upstreamUserAgentContextKey{}).(string)
	return strings.TrimSpace(value)
}

func applyUpstreamUserAgent(ctx context.Context, request *subconverter.Request) {
	if request == nil {
		return
	}
	if override := upstreamUserAgentFromContext(ctx); override != "" {
		request.UserAgent = override
	}
}
