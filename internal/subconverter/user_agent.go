package subconverter

import "strings"

// DefaultUserAgent is sent on every upstream subconverter HTTP call when Request.UserAgent is empty.
// Clash Meta family identifier is widely accepted by subscription providers that gate on User-Agent.
const DefaultUserAgent = "clash.meta/1.19.20"

// browserFamilyUserAgentTokens are case-insensitive substrings that identify browser-family
// User-Agents. Subscription providers often return HTML for these, so GET /sub* must not
// forward them upstream. Clash / Mihomo client identifiers do not contain these tokens.
var browserFamilyUserAgentTokens = []string{
	"mozilla/",
	"chrome/",
	"chromium/",
	"safari/",
	"firefox/",
	"edg/",
	"edge/",
	"opr/",
	"opera/",
	"msie ",
	"trident/",
}

// EffectiveUserAgent returns the override when non-empty after trim; otherwise DefaultUserAgent.
func EffectiveUserAgent(override string) string {
	if trimmed := strings.TrimSpace(override); trimmed != "" {
		return trimmed
	}
	return DefaultUserAgent
}

// IsBrowserFamilyUserAgent reports whether ua is a browser-family User-Agent that must not
// be forwarded to upstream subconverter on GET /sub*.
func IsBrowserFamilyUserAgent(userAgent string) bool {
	lower := strings.ToLower(strings.TrimSpace(userAgent))
	if lower == "" {
		return false
	}
	for _, token := range browserFamilyUserAgentTokens {
		if strings.Contains(lower, token) {
			return true
		}
	}
	return false
}

// ForwardableSubscriptionUserAgent returns the client User-Agent to attach as an upstream
// override for GET /sub*. Empty and browser-family values yield "" so EffectiveUserAgent
// applies DefaultUserAgent. Clash / Mihomo / other non-browser clients are forwarded as-is.
func ForwardableSubscriptionUserAgent(userAgent string) string {
	trimmed := strings.TrimSpace(userAgent)
	if trimmed == "" || IsBrowserFamilyUserAgent(trimmed) {
		return ""
	}
	return trimmed
}
