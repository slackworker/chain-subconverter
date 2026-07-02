package service

import "testing"

func TestCanonicalizeStage2SnapshotForLinkEncoding_MapsRowIDsToProxyNames(t *testing.T) {
	targetSG := "🇸🇬 新加坡节点"
	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "session-random-alpha",
				SourceLandingNodeName: "🇸🇬 Alpha",
				ProxyName:             "🇸🇬 Alpha",
				Mode:                  "chain",
				TargetName:            &targetSG,
			},
			{
				RowID:                 "session-random-derived",
				SourceLandingNodeName: "🇸🇬 Alpha",
				ProxyName:             "🇸🇬 Alpha 2",
				Mode:                  "none",
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "198.51.100.10",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"session-random-alpha", "session-random-derived"},
			},
		},
	}

	canonical := CanonicalizeStage2SnapshotForLinkEncoding(snapshot)

	if canonical.Rows[0].RowID != "🇸🇬 Alpha" {
		t.Fatalf("rows[0].rowId = %q, want %q", canonical.Rows[0].RowID, "🇸🇬 Alpha")
	}
	if canonical.Rows[1].RowID != "🇸🇬 Alpha 2" {
		t.Fatalf("rows[1].rowId = %q, want %q", canonical.Rows[1].RowID, "🇸🇬 Alpha 2")
	}
	if canonical.ServerAggregationGroups[0].MemberRowIDs[0] != "🇸🇬 Alpha" ||
		canonical.ServerAggregationGroups[0].MemberRowIDs[1] != "🇸🇬 Alpha 2" {
		t.Fatalf("memberRowIds = %#v, want [🇸🇬 Alpha, 🇸🇬 Alpha 2]", canonical.ServerAggregationGroups[0].MemberRowIDs)
	}
}

func TestEncodeLongURL_SemanticEquivalenceIgnoresSessionRowIDs(t *testing.T) {
	stage1 := stage1InputWithTemplate(Stage1Input{
		LandingRawText: "landing",
		TransitRawText: "transit",
	})
	targetSG := "🇸🇬 新加坡节点"

	buildPayload := func(firstRowID string, secondRowID string, memberRowIDs []string) LongURLPayload {
		return BuildLongURLPayload(stage1, Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 firstRowID,
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             "🇸🇬 Alpha",
					Mode:                  "chain",
					TargetName:            &targetSG,
				},
				{
					RowID:                 secondRowID,
					SourceLandingNodeName: "🇸🇬 Alpha",
					ProxyName:             "🇸🇬 Alpha 2",
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
	}

	firstLongURL, err := EncodeLongURL("https://a.example.com/base", buildPayload("random-id-1", "random-id-2", []string{"random-id-1", "random-id-2"}), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() first error = %v", err)
	}
	secondLongURL, err := EncodeLongURL("https://a.example.com/base", buildPayload("another-random-xyz", "yet-another-abc", []string{"another-random-xyz", "yet-another-abc"}), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() second error = %v", err)
	}
	if firstLongURL != secondLongURL {
		t.Fatalf("EncodeLongURL() mismatch for semantically equivalent snapshots:\nfirst=%q\nsecond=%q", firstLongURL, secondLongURL)
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
}

func TestEncodeLongURL_PresentationOrderStillAffectsPayload(t *testing.T) {
	stage1 := stage1InputWithTemplate(Stage1Input{
		LandingRawText: "landing",
		TransitRawText: "transit",
	})
	targetSG := "🇸🇬 新加坡节点"

	buildPayload := func(rowOrder []string) LongURLPayload {
		rowByID := map[string]Stage2Row{
			"row-a": {
				RowID:                 "row-a",
				SourceLandingNodeName: "🇸🇬 Alpha",
				ProxyName:             "🇸🇬 Alpha",
				Mode:                  "chain",
				TargetName:            &targetSG,
			},
			"row-b": {
				RowID:                 "row-b",
				SourceLandingNodeName: "🇸🇬 Beta",
				ProxyName:             "🇸🇬 Beta",
				Mode:                  "none",
			},
		}
		rows := make([]Stage2Row, 0, len(rowOrder))
		for _, rowID := range rowOrder {
			rows = append(rows, rowByID[rowID])
		}
		return BuildLongURLPayload(stage1, Stage2Snapshot{Rows: rows})
	}

	firstLongURL, err := EncodeLongURL("https://a.example.com/base", buildPayload([]string{"row-a", "row-b"}), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() first error = %v", err)
	}
	secondLongURL, err := EncodeLongURL("https://a.example.com/base", buildPayload([]string{"row-b", "row-a"}), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() second error = %v", err)
	}
	if firstLongURL == secondLongURL {
		t.Fatalf("EncodeLongURL() should differ when presentation order changes")
	}
}
