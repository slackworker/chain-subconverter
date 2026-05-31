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
	if first.NetworkScope != SubconverterNetworkScopeInternal {
		t.Fatalf("first network scope = %q, want %q", first.NetworkScope, SubconverterNetworkScopeInternal)
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

func TestResolveSubconverterNetworkScope(t *testing.T) {
	tests := []struct {
		name       string
		versionURL string
		want       SubconverterNetworkScope
	}{
		{name: "docker service host", versionURL: "http://subconverter:25500/version", want: SubconverterNetworkScopeInternal},
		{name: "localhost", versionURL: "http://127.0.0.1:25500/version", want: SubconverterNetworkScopeInternal},
		{name: "private ipv4", versionURL: "http://10.0.0.25:25500/version", want: SubconverterNetworkScopeInternal},
		{name: "internal hostname suffix", versionURL: "https://subconverter.internal/version", want: SubconverterNetworkScopeInternal},
		{name: "public hostname", versionURL: "https://subconverter.example.com/version", want: SubconverterNetworkScopeCrossNetwork},
		{name: "public ipv4", versionURL: "http://8.8.8.8:25500/version", want: SubconverterNetworkScopeCrossNetwork},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			got := resolveSubconverterNetworkScope(test.versionURL)
			if got != test.want {
				t.Fatalf("resolveSubconverterNetworkScope(%q) = %q, want %q", test.versionURL, got, test.want)
			}
		})
	}
}
