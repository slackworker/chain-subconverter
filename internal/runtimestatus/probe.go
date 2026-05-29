package runtimestatus

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"strings"
	"sync"
	"time"
)

const defaultProbeCacheTTL = 15 * time.Second

// UpstreamProber fetches subconverter /version and records latency.
type UpstreamProber struct {
	client  *http.Client
	version string
	ttl     time.Duration

	mu       sync.Mutex
	cached   SubconverterStatus
	cachedAt time.Time
}

func NewUpstreamProber(versionURL string, timeout time.Duration) *UpstreamProber {
	return &UpstreamProber{
		client:  &http.Client{Timeout: timeout},
		version: strings.TrimSuffix(versionURL, "/"),
		ttl:     defaultProbeCacheTTL,
	}
}

func (prober *UpstreamProber) Status(ctx context.Context, refresh bool) SubconverterStatus {
	prober.mu.Lock()
	defer prober.mu.Unlock()

	if !refresh && !prober.cachedAt.IsZero() && time.Since(prober.cachedAt) < prober.ttl {
		return prober.cached
	}

	status := prober.probe(ctx)
	prober.cached = status
	prober.cachedAt = time.Now().UTC()
	return status
}

func (prober *UpstreamProber) probe(ctx context.Context) SubconverterStatus {
	start := time.Now()
	checkedAt := start.UTC().Format(time.RFC3339Nano)

	request, err := http.NewRequestWithContext(ctx, http.MethodGet, prober.version, nil)
	if err != nil {
		return SubconverterStatus{
			Healthy:       false,
			LastCheckedAt: checkedAt,
			Error:         sanitizeProbeError(err),
		}
	}

	response, err := prober.client.Do(request)
	latencyMs := time.Since(start).Milliseconds()
	latency := latencyMs

	if err != nil {
		return SubconverterStatus{
			Healthy:       false,
			LatencyMs:     &latency,
			LastCheckedAt: checkedAt,
			Error:         sanitizeProbeError(err),
		}
	}
	defer response.Body.Close()

	body, readErr := io.ReadAll(io.LimitReader(response.Body, 4096))
	if readErr != nil {
		return SubconverterStatus{
			Healthy:       false,
			LatencyMs:     &latency,
			LastCheckedAt: checkedAt,
			Error:         sanitizeProbeError(readErr),
		}
	}

	if response.StatusCode < 200 || response.StatusCode >= 300 {
		return SubconverterStatus{
			Healthy:       false,
			LatencyMs:     &latency,
			LastCheckedAt: checkedAt,
			Error:         fmt.Sprintf("upstream returned HTTP %d", response.StatusCode),
		}
	}

	versionText := strings.TrimSpace(string(body))
	if versionText == "" {
		versionText = "unknown"
	}

	return SubconverterStatus{
		Healthy:       true,
		LatencyMs:     &latency,
		Version:       versionText,
		LastCheckedAt: checkedAt,
	}
}

func sanitizeProbeError(err error) string {
	if err == nil {
		return ""
	}
	message := strings.TrimSpace(err.Error())
	if message == "" {
		return "upstream probe failed"
	}
	lower := strings.ToLower(message)
	if strings.Contains(lower, "timeout") || strings.Contains(lower, "deadline") {
		return "upstream probe timed out"
	}
	if strings.Contains(lower, "connection refused") {
		return "upstream connection refused"
	}
	if strings.Contains(lower, "no such host") || strings.Contains(lower, "dns") {
		return "upstream host unreachable"
	}
	return "upstream probe failed"
}
