package runtimestatus

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

func TestUpstreamProber_CachesUntilRefresh(t *testing.T) {
	calls := 0
	upstream := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		calls++
		writer.WriteHeader(http.StatusOK)
		_, _ = writer.Write([]byte("subconverter cached"))
	}))
	t.Cleanup(upstream.Close)

	prober := NewUpstreamProber(upstream.URL, time.Second)
	ctx := context.Background()

	first := prober.Status(ctx, false)
	second := prober.Status(ctx, false)
	if !first.Healthy || !second.Healthy {
		t.Fatalf("expected healthy probe results")
	}
	if calls != 1 {
		t.Fatalf("expected one upstream call, got %d", calls)
	}

	third := prober.Status(ctx, true)
	if !third.Healthy {
		t.Fatalf("refresh probe unhealthy: %q", third.Error)
	}
	if calls != 2 {
		t.Fatalf("expected two upstream calls after refresh, got %d", calls)
	}
}
