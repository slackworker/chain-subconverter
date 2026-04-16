package service

import (
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func TestBuildStage2Init_DefaultChainHappyPath(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var request Stage1ConvertRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.request.json"), &request)

	var expectedResponse Stage1ConvertResponse
	readJSONFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.response.json"), &expectedResponse)

	stage2Init, err := BuildStage2Init(request.Stage1Input, ConversionFixtures{
		LandingDiscoveryYAML: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "landing-discovery.yaml")),
		TransitDiscoveryYAML: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "transit-discovery.yaml")),
		FullBaseYAML:         readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "full-base.yaml")),
	})
	if err != nil {
		t.Fatalf("BuildStage2Init() error = %v", err)
	}

	if got, want := stage2Init.AvailableModes, []string{"none", "chain"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("AvailableModes mismatch: got %v want %v", got, want)
	}

	if len(stage2Init.ForwardRelays) != 0 {
		t.Fatalf("ForwardRelays should be empty, got %v", stage2Init.ForwardRelays)
	}

	if !reflect.DeepEqual(stage2Init.Rows, expectedResponse.Stage2Init.Rows) {
		t.Fatalf("Rows mismatch: got %#v want %#v", stage2Init.Rows, expectedResponse.Stage2Init.Rows)
	}

	if !hasChainTarget(stage2Init.ChainTargets, "🇺🇸 美国节点", "proxy-groups") {
		t.Fatalf("expected chain target %q with kind %q, got %v", "🇺🇸 美国节点", "proxy-groups", stage2Init.ChainTargets)
	}
	if target, ok := findChainTarget(stage2Init.ChainTargets, "🇺🇸 美国节点", "proxy-groups"); !ok || target.IsEmpty {
		t.Fatalf("expected non-empty chain target %q, got %v", "🇺🇸 美国节点", stage2Init.ChainTargets)
	}
}

func TestBuildStage2Init_DoesNotFallbackToPortForwardWhenChainAutoDetectFails(t *testing.T) {
	stage2Init, err := BuildStage2Init(
		Stage1Input{
			AdvancedOptions: AdvancedOptions{
				EnablePortForward: true,
			},
			ForwardRelayItems: []string{"relay.example.com:443"},
		},
		ConversionFixtures{
			LandingDiscoveryYAML: "proxies:\n- {name: Unknown Landing, type: ss}\n",
			TransitDiscoveryYAML: "proxies:\n- {name: transit-a, type: ss}\n",
			FullBaseYAML: strings.Join([]string{
				"proxies:",
				"- {name: Unknown Landing, type: ss, server: landing.example.com, port: 443}",
				"- {name: transit-a, type: ss, server: transit.example.com, port: 443}",
				"proxy-groups:",
				"  - name: 🇭🇰 香港节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇺🇸 美国节点",
				"    type: url-test",
				"    proxies:",
				"      - transit-a",
				"  - name: 🇯🇵 日本节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇸🇬 新加坡节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇼🇸 台湾节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇰🇷 韩国节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"",
			}, "\n"),
		},
	)
	if err != nil {
		t.Fatalf("BuildStage2Init() error = %v", err)
	}

	if got, want := stage2Init.AvailableModes, []string{"none", "chain", "port_forward"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("AvailableModes mismatch: got %v want %v", got, want)
	}
	if len(stage2Init.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(stage2Init.Rows))
	}

	row := stage2Init.Rows[0]
	if row.Mode != "none" {
		t.Fatalf("row mode mismatch: got %q want %q", row.Mode, "none")
	}
	if row.TargetName != nil {
		t.Fatalf("row targetName mismatch: got %v want nil", *row.TargetName)
	}
}

func TestBuildStage2Init_FallsBackToPortForwardWhenChainUnavailable(t *testing.T) {
	stage2Init, err := BuildStage2Init(
		Stage1Input{
			AdvancedOptions: AdvancedOptions{
				EnablePortForward: true,
			},
			ForwardRelayItems: []string{"relay.example.com:443"},
		},
		ConversionFixtures{
			LandingDiscoveryYAML: "proxies:\n- {name: Unknown Landing, type: ss}\n",
			TransitDiscoveryYAML: "proxies:\n",
			FullBaseYAML: strings.Join([]string{
				"proxies:",
				"- {name: Unknown Landing, type: ss, server: landing.example.com, port: 443}",
				"proxy-groups:",
				"  - name: 🇭🇰 香港节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇺🇸 美国节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇯🇵 日本节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇸🇬 新加坡节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇼🇸 台湾节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇰🇷 韩国节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"",
			}, "\n"),
		},
	)
	if err != nil {
		t.Fatalf("BuildStage2Init() error = %v", err)
	}

	if got, want := stage2Init.AvailableModes, []string{"none", "port_forward"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("AvailableModes mismatch: got %v want %v", got, want)
	}
	if target, ok := findChainTarget(stage2Init.ChainTargets, "🇺🇸 美国节点", "proxy-groups"); !ok || !target.IsEmpty {
		t.Fatalf("expected empty chain target %q to remain visible, got %v", "🇺🇸 美国节点", stage2Init.ChainTargets)
	}
	if len(stage2Init.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(stage2Init.Rows))
	}

	row := stage2Init.Rows[0]
	if row.Mode != "port_forward" {
		t.Fatalf("row mode mismatch: got %q want %q", row.Mode, "port_forward")
	}
	if row.TargetName == nil || *row.TargetName != "relay.example.com:443" {
		t.Fatalf("row targetName mismatch: got %v want %q", row.TargetName, "relay.example.com:443")
	}
}

func TestBuildStage2Init_DoesNotCountLandingNodeAsRegionMember(t *testing.T) {
	stage2Init, err := BuildStage2Init(
		Stage1Input{},
		ConversionFixtures{
			LandingDiscoveryYAML: "proxies:\n- {name: Unknown Landing, type: ss}\n",
			TransitDiscoveryYAML: "proxies:\n",
			FullBaseYAML: strings.Join([]string{
				"proxies:",
				"- {name: Unknown Landing, type: ss, server: landing.example.com, port: 443}",
				"proxy-groups:",
				"  - name: 🇭🇰 香港节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇺🇸 美国节点",
				"    type: url-test",
				"    proxies:",
				"      - Unknown Landing",
				"  - name: 🇯🇵 日本节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇸🇬 新加坡节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇼🇸 台湾节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"  - name: 🇰🇷 韩国节点",
				"    type: url-test",
				"    proxies:",
				"      - DIRECT",
				"",
			}, "\n"),
		},
	)
	if err != nil {
		t.Fatalf("BuildStage2Init() error = %v", err)
	}

	if got, want := stage2Init.AvailableModes, []string{"none"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("AvailableModes mismatch: got %v want %v", got, want)
	}
	if target, ok := findChainTarget(stage2Init.ChainTargets, "🇺🇸 美国节点", "proxy-groups"); !ok || !target.IsEmpty {
		t.Fatalf("expected empty chain target %q when region group only contains landing node, got %v", "🇺🇸 美国节点", stage2Init.ChainTargets)
	}
}

func TestParseForwardRelays_NormalizesAndRejectsDuplicates(t *testing.T) {
	_, err := parseForwardRelays(Stage1Input{
		AdvancedOptions: AdvancedOptions{
			EnablePortForward: true,
		},
		ForwardRelayItems: []string{"Relay.EXAMPLE.com:00080", "relay.example.com:80"},
	})
	if err == nil {
		t.Fatal("parseForwardRelays() error = nil, want duplicate error")
	}
	if !strings.Contains(err.Error(), `duplicate forward relay "relay.example.com:80"`) {
		t.Fatalf("parseForwardRelays() error = %v, want duplicate normalized relay", err)
	}
}

func TestParseForwardRelays_RejectsInvalidLines(t *testing.T) {
	testCases := []string{
		" relay.example.com:80",
		"localhost:80",
		"010.0.0.1:80",
		"relay.example.com:not-a-port",
		"2001:db8::1:443",
	}

	for _, rawLine := range testCases {
		t.Run(rawLine, func(t *testing.T) {
			_, err := parseForwardRelays(Stage1Input{
				AdvancedOptions: AdvancedOptions{
					EnablePortForward: true,
				},
				ForwardRelayItems: []string{rawLine},
			})
			if err == nil {
				t.Fatal("parseForwardRelays() error = nil, want invalid line error")
			}
			if !strings.Contains(err.Error(), "invalid forward relay line") {
				t.Fatalf("parseForwardRelays() error = %v, want invalid line error", err)
			}
		})
	}
}

func TestBuildStage2Init_IgnoresCustomConfigForRegionAutoDetect(t *testing.T) {
	stage2Init, err := BuildStage2Init(
		Stage1Input{
			AdvancedOptions: AdvancedOptions{
				Config: stringPtr("https://example.com/custom.ini"),
			},
		},
		singleLandingFixture("Unknown Landing", "ss", "🇺🇸 美国节点"),
	)
	if err != nil {
		t.Fatalf("BuildStage2Init() error = %v", err)
	}

	if len(stage2Init.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(stage2Init.Rows))
	}

	row := stage2Init.Rows[0]
	if row.Mode != "none" {
		t.Fatalf("row mode mismatch: got %q want %q", row.Mode, "none")
	}
	if row.TargetName != nil {
		t.Fatalf("row targetName mismatch: got %v want nil", row.TargetName)
	}
}

func TestBuildStage2Init_PropagatesDefaultRegionMatcherLoadError(t *testing.T) {
	_, err := buildStage2Init(
		Stage1Input{},
		singleLandingFixture("US Landing", "ss", "🇺🇸 美国节点"),
		func(_ string) ([]regionMatcher, error) {
			return parseRegionMatchers("custom_proxy_group=🇺🇸 美国节点`url-test`(")
		},
	)
	if err == nil {
		t.Fatal("buildStage2Init() error = nil, want default region matcher load error")
	}
	if !strings.Contains(err.Error(), "load region matchers") {
		t.Fatalf("buildStage2Init() error = %v, want loader context", err)
	}
	if !strings.Contains(err.Error(), `compile region matcher "🇺🇸 美国节点"`) {
		t.Fatalf("buildStage2Init() error = %v, want compile error", err)
	}
}

func TestBuildStage2Init_SkipsAutoFillWhenMultipleRegionsMatch(t *testing.T) {
	stage2Init, err := buildStage2Init(
		Stage1Input{},
		singleLandingFixture("HK US Landing", "ss", "🇺🇸 美国节点"),
		func(_ string) ([]regionMatcher, error) {
			return parseRegionMatchers(strings.Join([]string{
				"custom_proxy_group=🇭🇰 香港节点`url-test`HK",
				"custom_proxy_group=🇺🇸 美国节点`url-test`US",
			}, "\n"))
		},
	)
	if err != nil {
		t.Fatalf("buildStage2Init() error = %v", err)
	}

	if len(stage2Init.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(stage2Init.Rows))
	}

	row := stage2Init.Rows[0]
	if row.Mode != "none" {
		t.Fatalf("row mode mismatch: got %q want %q", row.Mode, "none")
	}
	if row.TargetName != nil {
		t.Fatalf("row targetName mismatch: got %v want nil", row.TargetName)
	}
}

func TestBuildStage2Init_UsesTemplateConfigForDynamicRegionAutoDetect(t *testing.T) {
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: DE Landing, type: ss}\n",
		TransitDiscoveryYAML: "proxies:\n- {name: transit-de, type: ss}\n",
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: DE Landing, type: ss, server: landing.example.com, port: 443}",
			"- {name: transit-de, type: ss, server: transit.example.com, port: 443}",
			"proxy-groups:",
			"  - name: 🇩🇪 德国节点",
			"    type: fallback",
			"    proxies:",
			"      - transit-de",
			"",
		}, "\n"),
		TemplateConfig: "custom_proxy_group=🇩🇪 德国节点`fallback`(DE|德国)`https://cp.cloudflare.com/generate_204`300,,50\n",
	}

	stage2Init, err := BuildStage2Init(Stage1Input{}, fixtures)
	if err != nil {
		t.Fatalf("BuildStage2Init() error = %v", err)
	}
	if !hasChainTarget(stage2Init.ChainTargets, "🇩🇪 德国节点", "proxy-groups") {
		t.Fatalf("expected dynamic chain target, got %v", stage2Init.ChainTargets)
	}
	row := stage2Init.Rows[0]
	if row.Mode != "chain" {
		t.Fatalf("row mode mismatch: got %q want %q", row.Mode, "chain")
	}
	if row.TargetName == nil || *row.TargetName != "🇩🇪 德国节点" {
		t.Fatalf("row targetName mismatch: got %v want %q", row.TargetName, "🇩🇪 德国节点")
	}
}

func TestBuildStage2Init_RestrictsVLESSRealityChainAndFallsBackToRelay(t *testing.T) {
	stage2Init, err := BuildStage2Init(
		Stage1Input{
			AdvancedOptions: AdvancedOptions{
				EnablePortForward: true,
			},
			ForwardRelayItems: []string{"Relay.EXAMPLE.com:00080"},
		},
		singleLandingFixture("HK Reality", "vless-reality", "🇭🇰 香港节点"),
	)
	if err != nil {
		t.Fatalf("BuildStage2Init() error = %v", err)
	}

	if got, want := stage2Init.AvailableModes, []string{"none", "chain", "port_forward"}; !reflect.DeepEqual(got, want) {
		t.Fatalf("AvailableModes mismatch: got %v want %v", got, want)
	}

	row := stage2Init.Rows[0]
	if row.Mode != "port_forward" {
		t.Fatalf("row mode mismatch: got %q want %q", row.Mode, "port_forward")
	}
	if row.TargetName == nil || *row.TargetName != "relay.example.com:80" {
		t.Fatalf("row targetName mismatch: got %v want %q", row.TargetName, "relay.example.com:80")
	}
	restriction, ok := row.RestrictedModes["chain"]
	if !ok {
		t.Fatalf("expected restrictedModes.chain, got %v", row.RestrictedModes)
	}
	if restriction.ReasonCode != "UNSUPPORTED_BY_LANDING_PROTOCOL" {
		t.Fatalf("ReasonCode mismatch: got %q", restriction.ReasonCode)
	}
}

func TestParseInlineProxyList_ClassifiesVLESSRealityFromRealityOpts(t *testing.T) {
	proxies, err := parseInlineProxyList("proxies:\n- {name: HK Reality, type: vless, server: landing.example.com, port: 443, reality-opts: {public-key: test-public-key}}\n")
	if err != nil {
		t.Fatalf("parseInlineProxyList() error = %v", err)
	}

	if len(proxies) != 1 {
		t.Fatalf("expected 1 proxy, got %d", len(proxies))
	}
	if proxies[0].Type != "vless-reality" {
		t.Fatalf("proxy type mismatch: got %q want %q", proxies[0].Type, "vless-reality")
	}
}

func fixtureDirectory(t *testing.T) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}

	return filepath.Join(
		filepath.Dir(currentFile),
		"..",
		"..",
		"internal",
		"review",
		"testdata",
		"3pass-ss2022-test-subscription",
	)
}

func readJSONFixture(t *testing.T, path string, target any) {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %q: %v", path, err)
	}
	if err := json.Unmarshal(data, target); err != nil {
		t.Fatalf("unmarshal fixture %q: %v", path, err)
	}
}

func readTextFixture(t *testing.T, path string) string {
	t.Helper()

	data, err := os.ReadFile(path)
	if err != nil {
		t.Fatalf("read fixture %q: %v", path, err)
	}
	return normalizeTestFixtureNewlines(string(data))
}

func hasChainTarget(targets []ChainTarget, name string, kind string) bool {
	_, ok := findChainTarget(targets, name, kind)
	return ok
}

func findChainTarget(targets []ChainTarget, name string, kind string) (ChainTarget, bool) {
	for _, target := range targets {
		if target.Name == name && target.Kind == kind {
			return target, true
		}
	}
	return ChainTarget{}, false
}

func normalizeTestFixtureNewlines(value string) string {
	return strings.ReplaceAll(value, "\r\n", "\n")
}

func singleLandingFixture(landingName string, landingType string, transitGroupName string) ConversionFixtures {
	transitYAML := "proxies:\n"
	fullBaseProxyLines := []string{
		"proxies:",
		inlineLandingFixtureLine(landingName, landingType, true),
	}
	if transitGroupName != "" {
		transitYAML = "proxies:\n- {name: transit-a, type: ss}\n"
		fullBaseProxyLines = append(fullBaseProxyLines, "- {name: transit-a, type: ss, server: transit.example.com, port: 443}")
	}

	groupLines := []string{"proxy-groups:"}
	for _, groupName := range []string{"🇭🇰 香港节点", "🇺🇸 美国节点", "🇯🇵 日本节点", "🇸🇬 新加坡节点", "🇼🇸 台湾节点", "🇰🇷 韩国节点"} {
		member := "DIRECT"
		if groupName == transitGroupName {
			member = "transit-a"
		}
		groupLines = append(groupLines,
			"  - name: "+groupName,
			"    type: url-test",
			"    proxies:",
			"      - "+member,
		)
	}

	return ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n" + inlineLandingFixtureLine(landingName, landingType, false) + "\n",
		TransitDiscoveryYAML: transitYAML,
		FullBaseYAML:         strings.Join(append(fullBaseProxyLines, append(groupLines, "")...), "\n"),
		TemplateConfig:       defaultRegionConfig,
	}
}

func inlineLandingFixtureLine(landingName string, landingType string, includeEndpoint bool) string {
	if landingType == "vless-reality" {
		if includeEndpoint {
			return fmt.Sprintf("- {name: %s, type: vless, server: landing.example.com, port: 443, reality-opts: {public-key: test-public-key}}", landingName)
		}
		return fmt.Sprintf("- {name: %s, type: vless, reality-opts: {public-key: test-public-key}}", landingName)
	}
	if includeEndpoint {
		return fmt.Sprintf("- {name: %s, type: %s, server: landing.example.com, port: 443}", landingName, landingType)
	}
	return fmt.Sprintf("- {name: %s, type: %s}", landingName, landingType)
}
