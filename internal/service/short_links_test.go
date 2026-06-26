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
	payload := BuildLongURLPayload(stage1InputWithTemplate(Stage1Input{LandingRawText: "a", TransitRawText: "b"}), Stage2Snapshot{})
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
	payload := BuildLongURLPayload(stage1InputWithTemplate(Stage1Input{LandingRawText: "a", TransitRawText: "b"}), Stage2Snapshot{})
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

func TestCanonicalShortLinkStateKey_IgnoresRowIDNoiseAndStage2RowOrder(t *testing.T) {
	stage1 := stage1InputWithTemplate(Stage1Input{
		LandingRawText: "landing",
		TransitRawText: "transit",
	})
	targetSG := "🇸🇬 新加坡节点"

	firstPayload := BuildLongURLPayload(stage1, Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "alpha-random-row-id",
				SourceLandingNodeName: "🇸🇬 Alpha",
				ProxyName:             "🇸🇬 Alpha",
				LandingNodeName:       "🇸🇬 Alpha",
				Mode:                  "chain",
				TargetName:            &targetSG,
			},
			{
				RowID:                 "alpha-derived-random",
				SourceLandingNodeName: "🇸🇬 Alpha",
				ProxyName:             "🇸🇬 Alpha 2",
				LandingNodeName:       "🇸🇬 Alpha 2",
				Mode:                  "none",
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "198.51.100.10",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"alpha-random-row-id", "alpha-derived-random"},
			},
		},
	})

	secondPayload := BuildLongURLPayload(stage1, Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "another-random-id-xyz",
				SourceLandingNodeName: "🇸🇬 Alpha",
				ProxyName:             "🇸🇬 Alpha 2",
				LandingNodeName:       "🇸🇬 Alpha 2",
				Mode:                  "none",
			},
			{
				RowID:                 "source-row-random-abc",
				SourceLandingNodeName: "🇸🇬 Alpha",
				ProxyName:             "🇸🇬 Alpha",
				LandingNodeName:       "🇸🇬 Alpha",
				Mode:                  "chain",
				TargetName:            &targetSG,
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "198.51.100.10",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"source-row-random-abc", "another-random-id-xyz"},
			},
		},
	})

	firstLongURL, err := EncodeLongURL("https://a.example.com/base", firstPayload, 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() first error = %v", err)
	}
	secondLongURL, err := EncodeLongURL("https://b.example.com/base", secondPayload, 0)
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
		t.Fatalf("CanonicalShortLinkStateKey() mismatch after row order/id noise: %q != %q", firstKey, secondKey)
	}
	if DeterministicShortID(firstKey) != DeterministicShortID(secondKey) {
		t.Fatalf("DeterministicShortID() mismatch after row order/id noise")
	}
}

func TestCanonicalShortLinkStateKey_ChangesWhenFallbackMemberOrderChanges(t *testing.T) {
	stage1 := stage1InputWithTemplate(Stage1Input{
		LandingRawText: "landing",
		TransitRawText: "transit",
	})
	targetSG := "🇸🇬 新加坡节点"

	buildURL := func(memberRowIDs []string) string {
		payload := BuildLongURLPayload(stage1, Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "row-source",
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             "🇸🇬 Alpha",
					LandingNodeName:       "🇸🇬 Alpha",
					Mode:                  "chain",
					TargetName:            &targetSG,
				},
				{
					RowID:                 "row-derived",
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             "🇸🇬 Alpha 2",
					LandingNodeName:       "🇸🇬 Alpha 2",
					Mode:                  "none",
				},
			},
			ServerAggregationGroups: []ServerAggregationGroup{
				{
					Server:       "198.51.100.10",
					Enabled:      true,
					Strategy:     "fallback",
					MemberRowIDs: memberRowIDs,
				},
			},
		})
		longURL, err := EncodeLongURL("https://a.example.com/base", payload, 0)
		if err != nil {
			t.Fatalf("EncodeLongURL() error = %v", err)
		}
		return longURL
	}

	orderedKey, err := CanonicalShortLinkStateKey(buildURL([]string{"row-source", "row-derived"}), InputLimits{})
	if err != nil {
		t.Fatalf("CanonicalShortLinkStateKey() ordered error = %v", err)
	}
	reorderedKey, err := CanonicalShortLinkStateKey(buildURL([]string{"row-derived", "row-source"}), InputLimits{})
	if err != nil {
		t.Fatalf("CanonicalShortLinkStateKey() reordered error = %v", err)
	}
	if orderedKey == reorderedKey {
		t.Fatalf("CanonicalShortLinkStateKey() should change when fallback member order changes")
	}
}

func TestCanonicalShortLinkStateKey_IgnoresURLTestMemberOrder(t *testing.T) {
	stage1 := stage1InputWithTemplate(Stage1Input{
		LandingRawText: "landing",
		TransitRawText: "transit",
	})
	targetSG := "🇸🇬 新加坡节点"

	buildURL := func(memberRowIDs []string) string {
		payload := BuildLongURLPayload(stage1, Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "row-source",
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             "🇸🇬 Alpha",
					LandingNodeName:       "🇸🇬 Alpha",
					Mode:                  "chain",
					TargetName:            &targetSG,
				},
				{
					RowID:                 "row-derived",
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             "🇸🇬 Alpha 2",
					LandingNodeName:       "🇸🇬 Alpha 2",
					Mode:                  "none",
				},
			},
			ServerAggregationGroups: []ServerAggregationGroup{
				{
					Server:       "198.51.100.10",
					Enabled:      true,
					Strategy:     "url-test",
					MemberRowIDs: memberRowIDs,
				},
			},
		})
		longURL, err := EncodeLongURL("https://a.example.com/base", payload, 0)
		if err != nil {
			t.Fatalf("EncodeLongURL() error = %v", err)
		}
		return longURL
	}

	orderedKey, err := CanonicalShortLinkStateKey(buildURL([]string{"row-source", "row-derived"}), InputLimits{})
	if err != nil {
		t.Fatalf("CanonicalShortLinkStateKey() ordered error = %v", err)
	}
	reorderedKey, err := CanonicalShortLinkStateKey(buildURL([]string{"row-derived", "row-source"}), InputLimits{})
	if err != nil {
		t.Fatalf("CanonicalShortLinkStateKey() reordered error = %v", err)
	}
	if orderedKey != reorderedKey {
		t.Fatalf("CanonicalShortLinkStateKey() should ignore url-test member order")
	}
}

func TestCanonicalShortLinkStateKey_IgnoresExtendedStrategyMemberOrder(t *testing.T) {
	stage1 := stage1InputWithTemplate(Stage1Input{
		LandingRawText: "landing",
		TransitRawText: "transit",
	})
	targetSG := "🇸🇬 新加坡节点"

	buildURL := func(strategy string, memberRowIDs []string) string {
		payload := BuildLongURLPayload(stage1, Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "row-source",
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             "🇸🇬 Alpha",
					LandingNodeName:       "🇸🇬 Alpha",
					Mode:                  "chain",
					TargetName:            &targetSG,
				},
				{
					RowID:                 "row-derived",
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             "🇸🇬 Alpha 2",
					LandingNodeName:       "🇸🇬 Alpha 2",
					Mode:                  "none",
				},
			},
			ServerAggregationGroups: []ServerAggregationGroup{
				{
					Server:       "198.51.100.10",
					Enabled:      true,
					Strategy:     strategy,
					MemberRowIDs: memberRowIDs,
				},
			},
		})
		longURL, err := EncodeLongURL("https://a.example.com/base", payload, 0)
		if err != nil {
			t.Fatalf("EncodeLongURL() error = %v", err)
		}
		return longURL
	}

	strategies := []string{"select", "load-balance"}
	for _, strategy := range strategies {
		t.Run(strategy, func(t *testing.T) {
			orderedKey, err := CanonicalShortLinkStateKey(buildURL(strategy, []string{"row-source", "row-derived"}), InputLimits{})
			if err != nil {
				t.Fatalf("CanonicalShortLinkStateKey() ordered error = %v", err)
			}
			reorderedKey, err := CanonicalShortLinkStateKey(buildURL(strategy, []string{"row-derived", "row-source"}), InputLimits{})
			if err != nil {
				t.Fatalf("CanonicalShortLinkStateKey() reordered error = %v", err)
			}
			if orderedKey != reorderedKey {
				t.Fatalf("CanonicalShortLinkStateKey() should ignore %s member order", strategy)
			}
		})
	}
}

func TestBuildShortLinkResponse_FallbackMemberOrderChangesLongURLAndShortID(t *testing.T) {
	store := NewInMemoryShortLinkStore()
	stage1 := stage1InputWithTemplate(Stage1Input{
		LandingRawText: "landing",
		TransitRawText: "transit",
	})
	targetSG := "🇸🇬 新加坡节点"

	buildLongURL := func(memberRowIDs []string) string {
		payload := BuildLongURLPayload(stage1, Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "row-source",
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             "🇸🇬 Alpha",
					LandingNodeName:       "🇸🇬 Alpha",
					Mode:                  "chain",
					TargetName:            &targetSG,
				},
				{
					RowID:                 "row-derived",
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             "🇸🇬 Alpha 2",
					LandingNodeName:       "🇸🇬 Alpha 2",
					Mode:                  "none",
				},
			},
			ServerAggregationGroups: []ServerAggregationGroup{
				{
					Server:       "198.51.100.10",
					Enabled:      true,
					Strategy:     "fallback",
					MemberRowIDs: memberRowIDs,
				},
			},
		})
		longURL, err := EncodeLongURL("https://legacy.example.com/base", payload, 0)
		if err != nil {
			t.Fatalf("EncodeLongURL() error = %v", err)
		}
		return longURL
	}

	firstResponse, err := BuildShortLinkResponse(
		context.Background(),
		"https://public.example.com",
		store,
		buildLongURL([]string{"row-source", "row-derived"}),
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("BuildShortLinkResponse() first error = %v", err)
	}
	secondResponse, err := BuildShortLinkResponse(
		context.Background(),
		"https://public.example.com",
		store,
		buildLongURL([]string{"row-derived", "row-source"}),
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("BuildShortLinkResponse() second error = %v", err)
	}

	if firstResponse.LongURL == secondResponse.LongURL {
		t.Fatalf("longUrl should change when fallback member order changes")
	}
	if firstResponse.ShortURL == secondResponse.ShortURL {
		t.Fatalf("shortUrl should change when fallback member order changes")
	}
}

func TestCanonicalShortLinkStateKey_ChangesWhenVisibleNodeChanges(t *testing.T) {
	stage1 := stage1InputWithTemplate(Stage1Input{
		LandingRawText: "landing",
		TransitRawText: "transit",
	})
	targetSG := "🇸🇬 新加坡节点"

	buildURL := func(proxyName string) string {
		payload := BuildLongURLPayload(stage1, Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "row-random",
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             proxyName,
					LandingNodeName:       proxyName,
					Mode:                  "chain",
					TargetName:            &targetSG,
				},
			},
		})
		longURL, err := EncodeLongURL("https://a.example.com/base", payload, 0)
		if err != nil {
			t.Fatalf("EncodeLongURL() error = %v", err)
		}
		return longURL
	}

	firstKey, err := CanonicalShortLinkStateKey(buildURL("🇸🇬 Alpha"), InputLimits{})
	if err != nil {
		t.Fatalf("CanonicalShortLinkStateKey() first error = %v", err)
	}
	secondKey, err := CanonicalShortLinkStateKey(buildURL("🇸🇬 Alpha-X"), InputLimits{})
	if err != nil {
		t.Fatalf("CanonicalShortLinkStateKey() second error = %v", err)
	}
	if firstKey == secondKey {
		t.Fatalf("CanonicalShortLinkStateKey() should change when proxy name changes")
	}
}
