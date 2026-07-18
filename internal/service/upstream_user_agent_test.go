package service

import (
	"context"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

func TestWithUpstreamUserAgent_IgnoresEmpty(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	if got := WithUpstreamUserAgent(ctx, "  "); got != ctx {
		t.Fatalf("expected empty override to leave context unchanged")
	}
	if got := upstreamUserAgentFromContext(WithUpstreamUserAgent(ctx, "")); got != "" {
		t.Fatalf("upstreamUserAgentFromContext() = %q, want empty", got)
	}
}

func TestApplyUpstreamUserAgent_SetsOverride(t *testing.T) {
	t.Parallel()

	ctx := WithUpstreamUserAgent(context.Background(), "clash-verge/v2.4.5")
	request := subconverter.Request{}
	applyUpstreamUserAgent(ctx, &request)
	if request.UserAgent != "clash-verge/v2.4.5" {
		t.Fatalf("UserAgent = %q, want clash-verge/v2.4.5", request.UserAgent)
	}
}

func TestApplyUpstreamUserAgent_LeavesEmptyWithoutOverride(t *testing.T) {
	t.Parallel()

	request := subconverter.Request{}
	applyUpstreamUserAgent(context.Background(), &request)
	if request.UserAgent != "" {
		t.Fatalf("UserAgent = %q, want empty (default applied at HTTP client)", request.UserAgent)
	}
}
