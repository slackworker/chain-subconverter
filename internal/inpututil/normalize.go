package inpututil

import "strings"

// NormalizeNewlines treats CRLF and standalone CR as line breaks.
func NormalizeNewlines(value string) string {
	value = strings.ReplaceAll(value, "\r\n", "\n")
	return strings.ReplaceAll(value, "\r", "\n")
}

// NormalizeURLText trims each line, drops blank entries, and joins the result with '|'.
func NormalizeURLText(raw string) string {
	lines := strings.Split(NormalizeNewlines(raw), "\n")
	parts := make([]string, 0, len(lines))
	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		if trimmed == "" {
			continue
		}
		parts = append(parts, trimmed)
	}
	return strings.Join(parts, "|")
}