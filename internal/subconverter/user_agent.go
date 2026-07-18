package subconverter

import "strings"

// DefaultUserAgent is sent on every upstream subconverter HTTP call when Request.UserAgent is empty.
// Clash Meta family identifier is widely accepted by subscription providers that gate on User-Agent.
const DefaultUserAgent = "clash.meta/1.19.20"

// EffectiveUserAgent returns the override when non-empty after trim; otherwise DefaultUserAgent.
func EffectiveUserAgent(override string) string {
	if trimmed := strings.TrimSpace(override); trimmed != "" {
		return trimmed
	}
	return DefaultUserAgent
}
