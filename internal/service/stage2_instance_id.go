package service

import "strings"

func stage2ServerKey(server string, sourceID string) string {
	trimmed := strings.TrimSpace(server)
	if trimmed != "" {
		return trimmed
	}
	return "source:" + strings.TrimSpace(sourceID)
}
