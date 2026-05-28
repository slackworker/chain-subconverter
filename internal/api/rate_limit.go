package api

import (
	"net"
	"strings"
	"sync"
	"time"

	"golang.org/x/time/rate"
)

const ipRateLimiterEntryTTL = 15 * time.Minute

type HandlerOption func(*Handler) error

func WithWriteRequestsPerMinute(requestsPerMinute int) HandlerOption {
	return func(handler *Handler) error {
		handler.writeRateLimiter = newIPRateLimiter(requestsPerMinute)
		return nil
	}
}

func WithReadRequestsPerMinute(requestsPerMinute int) HandlerOption {
	return func(handler *Handler) error {
		handler.readRateLimiter = newIPRateLimiter(requestsPerMinute)
		return nil
	}
}

type ipRateLimiter struct {
	mu        sync.Mutex
	limiters  map[string]ipRateLimiterEntry
	limit     rate.Limit
	burst     int
	entryTTL  time.Duration
	nextSweep time.Time
	now       func() time.Time
}

type ipRateLimiterEntry struct {
	limiter  *rate.Limiter
	lastSeen time.Time
}

func newIPRateLimiter(requestsPerMinute int) *ipRateLimiter {
	if requestsPerMinute <= 0 {
		return nil
	}

	return &ipRateLimiter{
		limiters: make(map[string]ipRateLimiterEntry),
		limit:    rate.Every(time.Minute / time.Duration(requestsPerMinute)),
		burst:    requestsPerMinute,
		entryTTL: ipRateLimiterEntryTTL,
		now:      time.Now,
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

	now := limiter.currentTime()

	limiter.mu.Lock()
	defer limiter.mu.Unlock()

	if limiter.shouldSweep(now) {
		limiter.deleteExpiredEntriesLocked(now)
		limiter.nextSweep = now.Add(limiter.entryTTL)
	}

	entry, ok := limiter.limiters[key]
	if !ok {
		entry = ipRateLimiterEntry{limiter: rate.NewLimiter(limiter.limit, limiter.burst)}
	}
	entry.lastSeen = now
	limiter.limiters[key] = entry

	return entry.limiter.Allow()
}

func (limiter *ipRateLimiter) currentTime() time.Time {
	if limiter.now != nil {
		return limiter.now()
	}

	return time.Now()
}

func (limiter *ipRateLimiter) shouldSweep(now time.Time) bool {
	if limiter.entryTTL <= 0 {
		return false
	}

	return limiter.nextSweep.IsZero() || !now.Before(limiter.nextSweep)
}

func (limiter *ipRateLimiter) deleteExpiredEntriesLocked(now time.Time) {
	if limiter.entryTTL <= 0 {
		return
	}

	cutoff := now.Add(-limiter.entryTTL)
	for key, entry := range limiter.limiters {
		if entry.lastSeen.Before(cutoff) {
			delete(limiter.limiters, key)
		}
	}
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
