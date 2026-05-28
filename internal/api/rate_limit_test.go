package api

import (
	"testing"
	"time"
)

func TestIPRateLimiter_AllowsSameIPAgainAfterTTLExpiry(t *testing.T) {
	current := time.Unix(1_700_000_000, 0)
	limiter := newIPRateLimiter(1)
	limiter.entryTTL = time.Minute
	limiter.now = func() time.Time {
		return current
	}

	if !limiter.allow("198.51.100.10") {
		t.Fatal("first request should be allowed")
	}
	if limiter.allow("198.51.100.10") {
		t.Fatal("second request within the same minute should be rate limited")
	}

	current = current.Add(2 * time.Minute)

	if !limiter.allow("198.51.100.10") {
		t.Fatal("request after TTL expiry should be allowed")
	}
}

func TestIPRateLimiter_DeletesExpiredEntriesOnSweep(t *testing.T) {
	current := time.Unix(1_700_000_000, 0)
	limiter := newIPRateLimiter(60)
	limiter.entryTTL = time.Minute
	limiter.now = func() time.Time {
		return current
	}

	if !limiter.allow("198.51.100.10") {
		t.Fatal("first IP should be allowed")
	}
	current = current.Add(10 * time.Second)
	if !limiter.allow("198.51.100.11") {
		t.Fatal("second IP should be allowed")
	}
	if got := len(limiter.limiters); got != 2 {
		t.Fatalf("limiter size mismatch before expiry: got %d want %d", got, 2)
	}

	current = current.Add(2 * time.Minute)
	if !limiter.allow("198.51.100.12") {
		t.Fatal("new IP after expiry should be allowed")
	}
	if got := len(limiter.limiters); got != 1 {
		t.Fatalf("limiter size mismatch after sweep: got %d want %d", got, 1)
	}
}
