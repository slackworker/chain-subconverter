package service

import (
	"context"
	"strings"
	"testing"
)

func TestDeterministicShortID_IsBase62Encoded64BitStateKey(t *testing.T) {
	shortID := DeterministicShortID("canonical-state-key")
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
	stateKey := "canonical-state-key"
	first := DeterministicShortID(stateKey)
	second := DeterministicShortID(stateKey)
	if first != second {
		t.Fatalf("DeterministicShortID() mismatch: %q != %q", first, second)
	}
}

func TestCanonicalShortLinkStateKey_IgnoresBaseURL(t *testing.T) {
	payload := BuildLongURLPayload(Stage1Input{LandingRawText: "a", TransitRawText: "b"}, Stage2Snapshot{})
	firstLongURL, err := EncodeLongURL("https://a.example.com/base", payload, 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() first error = %v", err)
	}
	secondLongURL, err := EncodeLongURL("https://b.example.com/other", payload, 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() second error = %v", err)
	}

	firstKey, err := CanonicalShortLinkStateKey(firstLongURL, InputLimits{})
	if err != nil {
		t.Fatalf("CanonicalShortLinkStateKey() first error = %v", err)
	}
	secondKey, err := CanonicalShortLinkStateKey(secondLongURL, InputLimits{})
	if err != nil {
		t.Fatalf("CanonicalShortLinkStateKey() second error = %v", err)
	}
	if firstKey != secondKey {
		t.Fatalf("CanonicalShortLinkStateKey() mismatch: %q != %q", firstKey, secondKey)
	}

	if DeterministicShortID(firstKey) != DeterministicShortID(secondKey) {
		t.Fatalf("DeterministicShortID() should be stable across base URLs")
	}
}

func TestBuildShortLinkResponse_KeepsShortIDStableAcrossBaseURLs(t *testing.T) {
	store := NewInMemoryShortLinkStore()
	payload := BuildLongURLPayload(Stage1Input{LandingRawText: "a", TransitRawText: "b"}, Stage2Snapshot{})
	rawLongURL, err := EncodeLongURL("https://legacy.example.com/base", payload, 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	firstResponse, err := BuildShortLinkResponse(context.Background(), "https://a.example.com/base", store, rawLongURL, 0, InputLimits{})
	if err != nil {
		t.Fatalf("BuildShortLinkResponse() first error = %v", err)
	}
	secondResponse, err := BuildShortLinkResponse(context.Background(), "https://b.example.com/other", store, rawLongURL, 0, InputLimits{})
	if err != nil {
		t.Fatalf("BuildShortLinkResponse() second error = %v", err)
	}

	firstShortID := strings.TrimPrefix(firstResponse.ShortURL, "https://a.example.com/base/sub/")
	secondShortID := strings.TrimPrefix(secondResponse.ShortURL, "https://b.example.com/other/sub/")
	if firstShortID != secondShortID {
		t.Fatalf("short ID mismatch across base URLs: %q != %q", firstShortID, secondShortID)
	}
	if firstResponse.LongURL == secondResponse.LongURL {
		t.Fatalf("longUrl should reflect the current public base URL")
	}
	if !strings.HasPrefix(firstResponse.LongURL, "https://a.example.com/base/sub?") {
		t.Fatalf("first longUrl = %q, want base a", firstResponse.LongURL)
	}
	if !strings.HasPrefix(secondResponse.LongURL, "https://b.example.com/other/sub?") {
		t.Fatalf("second longUrl = %q, want base b", secondResponse.LongURL)
	}
}
