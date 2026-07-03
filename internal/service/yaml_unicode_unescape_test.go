package service

import (
	"strings"
	"testing"
)

func TestUnescapeYAMLUnicodeEscapes_ConvertsUnicodeEscapeSequences(t *testing.T) {
	input := `name: \U0001F1FA\U0001F1F8`
	got := unescapeYAMLUnicodeEscapes(input)
	if !strings.Contains(got, "🇺🇸") {
		t.Fatalf("unescapeYAMLUnicodeEscapes() = %q, want rendered emoji", got)
	}
	if strings.Contains(got, `\U0001F1FA`) || strings.Contains(got, `\U0001F1F8`) {
		t.Fatalf("unescapeYAMLUnicodeEscapes() = %q, want uppercase unicode escapes removed", got)
	}
}

func TestUnescapeYAMLUnicodeEscapes_LeavesLowercaseUnicodeEscapesUntouched(t *testing.T) {
	input := `name: \uD83C\uDDFA\uD83C\uDDF8`
	got := unescapeYAMLUnicodeEscapes(input)
	if got != input {
		t.Fatalf("unescapeYAMLUnicodeEscapes() = %q, want lowercase unicode escapes untouched", got)
	}
	if strings.Contains(got, "�") {
		t.Fatalf("unescapeYAMLUnicodeEscapes() = %q, want no replacement rune", got)
	}
}
