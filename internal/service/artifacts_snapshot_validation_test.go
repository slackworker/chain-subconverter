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
	if !strings.Contains(err.Error(), "stage2 rowset size mismatch") {
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
			AdvancedOptions: AdvancedOptions{
				EnablePortForward: true,
			},
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
