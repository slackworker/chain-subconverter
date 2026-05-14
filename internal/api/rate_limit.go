package api

import (
	"net"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

type HandlerOption func(*Handler)

func WithWriteRequestsPerMinute(requestsPerMinute int) HandlerOption {
	return func(handler *Handler) {
		handler.writeRateLimiter = newIPRateLimiter(requestsPerMinute)
	}
}

type ipRateLimiter struct {
	mu       sync.Mutex
	limiters map[string]*rate.Limiter
	limit    rate.Limit
	burst    int
}

func newIPRateLimiter(requestsPerMinute int) *ipRateLimiter {
	if requestsPerMinute <= 0 {
		return nil
	}

	return &ipRateLimiter{
		limiters: make(map[string]*rate.Limiter),
		limit:    rate.Every(time.Minute / time.Duration(requestsPerMinute)),
		burst:    requestsPerMinute,
	}
}

func (limiter *ipRateLimiter) allow(clientIP string) bool {
	if limiter == nil {
		return true
	}

	key := strings.TrimSpace(clientIP)
	if key == "" {
		key = "unknown"
	}

	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	ipLimiter, ok := limiter.limiters[key]
	if !ok {
		ipLimiter = rate.NewLimiter(limiter.limit, limiter.burst)
		limiter.limiters[key] = ipLimiter
	}

	return ipLimiter.Allow()
}

func clientIPAddress(remoteAddr string) string {
	trimmedAddr := strings.TrimSpace(remoteAddr)
	if trimmedAddr == "" {
		return ""
	}

	host, _, err := net.SplitHostPort(trimmedAddr)
	if err == nil {
		return host
	}

	return strings.Trim(trimmedAddr, "[]")
}
