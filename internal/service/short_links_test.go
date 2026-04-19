package service

import (
	"strings"
	"testing"
)

func TestDeterministicShortID_IsBase62Encoded64BitValue(t *testing.T) {
	shortID := DeterministicShortID("https://example.com/sub?data=payload")
	if shortID == "" {
		t.Fatal("DeterministicShortID() returned empty string")
	}
	if len(shortID) > 11 {
		t.Fatalf("DeterministicShortID() length = %d, want <= 11", len(shortID))
	}

	const alphabet = shortIDBase62Alphabet
	for _, char := range shortID {
		if !strings.ContainsRune(alphabet, char) {
			t.Fatalf("DeterministicShortID() contains non-base62 character %q in %q", char, shortID)
		}
	}
}

func TestDeterministicShortID_IsStable(t *testing.T) {
	longURL := "https://example.com/sub?data=payload"
	first := DeterministicShortID(longURL)
	second := DeterministicShortID(longURL)
	if first != second {
		t.Fatalf("DeterministicShortID() mismatch: %q != %q", first, second)
	}
}
