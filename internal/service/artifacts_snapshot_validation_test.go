package service

import (
	"strings"
	"testing"
)

func TestValidateGenerateSnapshot_RejectsRowsetMismatch(t *testing.T) {
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(Stage1Input{}, Stage2Snapshot{
		Rows: []Stage2Row{},
	}, fixtures)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want rowset mismatch")
	}
	if !strings.Contains(err.Error(), `missing stage2 row for landing node "HK Landing"`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_RejectsTargetForNoneMode(t *testing.T) {
	targetName := "relay.example.com:80"
	fixtures := singleLandingFixture("HK Landing", "ss", "")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "HK Landing",
					Mode:            "none",
					TargetName:      &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want targetName validation")
	}
	if !strings.Contains(err.Error(), "targetName must be empty") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_AllowsChainForReality(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Reality", "vless-reality", "🇭🇰 香港节点")

	resolved, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "HK Reality",
					Mode:            "chain",
					TargetName:      &targetName,
				},
			},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	if len(resolved) != 1 || resolved[0].ProtocolType != "vless-reality" {
		t.Fatalf("resolved landing proxies = %#v, want one vless-reality entry", resolved)
	}
}

func TestValidateGenerateSnapshot_RejectsEmptyChainTarget(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("Unknown Landing", "ss", "")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "Unknown Landing",
					Mode:            "chain",
					TargetName:      &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want empty chain target rejection")
	}
	if !strings.Contains(err.Error(), `chain target "🇭🇰 香港节点"`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code != "EMPTY_CHAIN_TARGET" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", blockingError.Code, "EMPTY_CHAIN_TARGET")
	}
}

func TestValidateGenerateSnapshot_RejectsDuplicateForwardRelayTarget(t *testing.T) {
	targetName := "relay.example.com:80"
	fixtures := dualLandingFixture("HK Landing", "US Landing")

	_, err := validateGenerateSnapshot(
		Stage1Input{
			ForwardRelayItems: []string{targetName},
		},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "HK Landing",
					Mode:            "port_forward",
					TargetName:      &targetName,
				},
				{
					LandingNodeName: "US Landing",
					Mode:            "port_forward",
					TargetName:      &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want duplicate forward relay target rejection")
	}
	if !strings.Contains(err.Error(), `forward relay "relay.example.com:80"`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code != "DUPLICATE_FORWARD_RELAY_TARGET" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", blockingError.Code, "DUPLICATE_FORWARD_RELAY_TARGET")
	}
}

func TestValidateGenerateSnapshot_RejectsChainProxyGroupProfileForPortForward(t *testing.T) {
	targetName := "relay.example.com:80"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{ForwardRelayItems: []string{targetName}},
		Stage2Snapshot{
			Rows: []Stage2Row{{
				LandingNodeName:         "HK Landing",
				Mode:                    "port_forward",
				TargetName:              &targetName,
				ChainProxyGroupProfile: ChainProxyGroupProfileAggressiveFallback,
			}},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want chainProxyGroupProfile validation")
	}
	if !strings.Contains(err.Error(), "chainProxyGroupProfile must be empty") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_RejectsConflictingChainProxyGroupProfilesForSameTarget(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					SourceLandingNodeName:   "HK Landing",
					ProxyName:               "HK Landing",
					Mode:                    "chain",
					TargetName:              &targetName,
					ChainProxyGroupProfile: ChainProxyGroupProfileAggressiveFallback,
				},
				{
					SourceLandingNodeName:   "HK Landing",
					ProxyName:               "HK Landing 2",
					Mode:                    "chain",
					TargetName:              &targetName,
					ChainProxyGroupProfile: ChainProxyGroupProfileAggressiveURLTest,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want chainProxyGroupProfile conflict")
	}
	if !strings.Contains(err.Error(), "chainProxyGroupProfile") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_AllowsMultipleRowsForSameSourceLanding(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	resolved, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "chain",
					TargetName:            &targetName,
				},
				{
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing 2",
					Mode:                  "none",
				},
			},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	if len(resolved) != 1 || resolved[0].Name != "HK Landing" {
		t.Fatalf("resolved landing proxies = %#v, want one HK Landing entry", resolved)
	}
}

func TestValidateGenerateSnapshot_RejectsDuplicateProxyName(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "chain",
					TargetName:            &targetName,
				},
				{
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "none",
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want duplicate proxy name rejection")
	}
	if !strings.Contains(err.Error(), `duplicate proxy name "HK Landing"`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code != "DUPLICATE_PROXY_NAME" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", blockingError.Code, "DUPLICATE_PROXY_NAME")
	}
	wantContext := map[string]any{
		"rowId":                 "HK Landing",
		"sourceLandingNodeName": "HK Landing",
		"proxyName":             "HK Landing",
		"landingNodeName":       "HK Landing",
		"field":                 "proxyName",
	}
	if !mapsEqual(blockingError.Context, wantContext) {
		t.Fatalf("BlockingError.Context mismatch: got %#v want %#v", blockingError.Context, wantContext)
	}
}

func TestValidateGenerateSnapshot_RejectsUnknownSourceLandingWithDerivedRowContext(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "chain",
					TargetName:            &targetName,
				},
				{
					RowID:                 "hk-derived-1",
					SourceLandingNodeName: "Missing Landing",
					ProxyName:             "HK Landing Copy",
					Mode:                  "chain",
					TargetName:            &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want unknown source landing rejection")
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code != "LANDING_NODE_NOT_FOUND" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", blockingError.Code, "LANDING_NODE_NOT_FOUND")
	}
	wantContext := map[string]any{
		"rowId":                 "hk-derived-1",
		"sourceLandingNodeName": "Missing Landing",
		"proxyName":             "HK Landing Copy",
		"landingNodeName":       "Missing Landing",
	}
	if !mapsEqual(blockingError.Context, wantContext) {
		t.Fatalf("BlockingError.Context mismatch: got %#v want %#v", blockingError.Context, wantContext)
	}
}

func mapsEqual(got map[string]any, want map[string]any) bool {
	if len(got) != len(want) {
		return false
	}
	for key, wantValue := range want {
		gotValue, ok := got[key]
		if !ok || gotValue != wantValue {
			return false
		}
	}
	return true
}

func dualLandingFixture(firstLandingName string, secondLandingName string) ConversionFixtures {
	groupLines := []string{"proxy-groups:"}
	for _, groupName := range []string{"🇭🇰 香港节点", "🇺🇸 美国节点", "🇯🇵 日本节点", "🇸🇬 新加坡节点", "🇼🇸 台湾节点", "🇰🇷 韩国节点"} {
		groupLines = append(groupLines,
			"  - name: "+groupName,
			"    type: url-test",
			"    proxies:",
			"      - DIRECT",
		)
	}

	return ConversionFixtures{
		LandingDiscoveryYAML: strings.Join([]string{
			"proxies:",
			inlineLandingFixtureLine(firstLandingName, "ss", false),
			inlineLandingFixtureLine(secondLandingName, "ss", false),
			"",
		}, "\n"),
		TransitDiscoveryYAML: "proxies:\n",
		FullBaseYAML: strings.Join(append([]string{
			"proxies:",
			inlineLandingFixtureLine(firstLandingName, "ss", true),
			inlineLandingFixtureLine(secondLandingName, "ss", true),
		}, append(groupLines, "")...), "\n"),
		TemplateConfig: defaultRegionConfig,
	}
}
