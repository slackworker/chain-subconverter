package service

import (
	"strconv"
	"strings"
)

// unescapeYAMLUnicodeEscapes converts common Go/JSON-style unicode escape sequences
// inside YAML scalar text: \uXXXX and \UXXXXXXXX.
//
// Why: yaml.v3 will parse these into real runes, but this codebase mostly preserves
// the original YAML text lines (for stable output). If the upstream YAML contains
// escape sequences, they will be preserved into the final output unless we
// unescape them here.
func unescapeYAMLUnicodeEscapes(input string) string {
	// Fast path.
	if !strings.Contains(input, `\u`) && !strings.Contains(input, `\U`) {
		return input
	}

	var b strings.Builder
	b.Grow(len(input))

	for i := 0; i < len(input); {
		if input[i] == '\\' && i+1 < len(input) {
			switch input[i+1] {
			case 'u':
				// \uXXXX (4 hex digits)
				if i+2+4 <= len(input) {
					hex := input[i+2 : i+2+4]
					if r, ok := parseHexRune(hex); ok {
						b.WriteRune(r)
						i += 2 + 4
						continue
					}
				}
			case 'U':
				// \UXXXXXXXX (8 hex digits)
				if i+2+8 <= len(input) {
					hex := input[i+2 : i+2+8]
					if r, ok := parseHexRune(hex); ok {
						b.WriteRune(r)
						i += 2 + 8
						continue
					}
				}
			}
		}

		b.WriteByte(input[i])
		i++
	}

	return b.String()
}

func parseHexRune(hex string) (rune, bool) {
	// Note: ParseUint will accept leading zeros, which is exactly what we want.
	v, err := strconv.ParseUint(hex, 16, 32)
	if err != nil {
		return 0, false
	}
	if v > 0x10FFFF {
		return 0, false
	}
	return rune(v), true
}

