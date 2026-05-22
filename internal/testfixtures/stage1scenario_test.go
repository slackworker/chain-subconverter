package testfixtures

import (
	"path/filepath"
	"reflect"
	"runtime"
	"strings"
	"testing"
)

func TestLoadStage1Scenario_DualLandingChainPortForward(t *testing.T) {
	scenario, err := LoadStage1Scenario(dualLandingChainPortForwardScenarioFile(t))
	if err != nil {
		t.Fatalf("LoadStage1Scenario() error = %v", err)
	}

	if scenario.SchemaVersion != 1 {
		t.Fatalf("SchemaVersion = %d, want 1", scenario.SchemaVersion)
	}
	if scenario.ScenarioID != "dual-landing-chain-port-forward" {
		t.Fatalf("ScenarioID = %q", scenario.ScenarioID)
	}
	if len(scenario.Stage1Input.LandingItems) != 6 {
		t.Fatalf("len(LandingItems) = %d, want 6", len(scenario.Stage1Input.LandingItems))
	}
	if len(scenario.Stage1Input.ManualSocks5Items) != 1 {
		t.Fatalf("len(ManualSocks5Items) = %d, want 1", len(scenario.Stage1Input.ManualSocks5Items))
	}
	if len(scenario.Stage1Input.TransitItems) != 2 {
		t.Fatalf("len(TransitItems) = %d, want 2", len(scenario.Stage1Input.TransitItems))
	}
	if len(scenario.Stage1Input.ForwardRelayItems) != 2 {
		t.Fatalf("len(ForwardRelayItems) = %d, want 2", len(scenario.Stage1Input.ForwardRelayItems))
	}
	if len(scenario.TransitFixtures) != 2 {
		t.Fatalf("len(TransitFixtures) = %d, want 2", len(scenario.TransitFixtures))
	}
	if scenario.TemplateFixture == nil {
		t.Fatal("TemplateFixture should not be nil")
	}

	if got := scenario.Stage1Input.LandingRawText(); got == "" {
		t.Fatal("LandingRawText() should not be empty")
	}
	if got := scenario.Stage1Input.LandingRawTextWithManualSocks(); got == scenario.Stage1Input.LandingRawText() {
		t.Fatal("LandingRawTextWithManualSocks() should append manual socks URIs")
	}
	if got := scenario.Stage1Input.TransitRawText(); got != "https://fixtures.example.com/transit-a-subscription.txt\nhttps://fixtures.example.com/transit-b-subscription.txt" {
		t.Fatalf("TransitRawText() = %q", got)
	}
	if scenario.TemplateFixture.InputURL != "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini" {
		t.Fatalf("TemplateFixture.InputURL = %q", scenario.TemplateFixture.InputURL)
	}
	if got := scenario.Stage1Input.ManualSocks5Items[0].GeneratedURI; got != "tg://socks?server=manual-socks-hk.example.test&port=1080&remarks=Manual-SOCKS5-HK-Fallback&user=demo-user&pass=demo-pass" {
		t.Fatalf("GeneratedURI = %q", got)
	}
	files, err := RenderReviewStage1InputFiles(scenario.Stage1Input)
	if err != nil {
		t.Fatalf("RenderReviewStage1InputFiles() error = %v", err)
	}
	assertRenderedFile(t, files, LandingFileName, scenario.Stage1Input.LandingRawTextWithManualSocks()+"\n")
	transitA, err := scenario.ReadRelativeFile(scenario.TransitFixtures[0].URIContentFile)
	if err != nil {
		t.Fatalf("ReadRelativeFile(transit-a) error = %v", err)
	}
	if transitA == "" {
		t.Fatal("transit-a content should not be empty")
	}
	templateConfig, err := scenario.ReadRelativeFile(scenario.TemplateFixture.ContentFile)
	if err != nil {
		t.Fatalf("ReadRelativeFile(template-config) error = %v", err)
	}
	if got := strings.Count(templateConfig, "custom_proxy_group="); got != 6 {
		t.Fatalf("template config group count = %d, want 6", got)
	}
	if !strings.Contains(templateConfig, "HongKong") || !strings.Contains(templateConfig, "Japan") {
		t.Fatalf("template config should preserve current region matchers, got %q", templateConfig)
	}
	assertTransitCorpusRichness(t, scenario)
	if strings.TrimSpace(templateConfig) == "" {
		t.Fatal("template config should not be blank")
	}
}

func TestLoadStage1Scenario_3PassSS2022TestSubscription(t *testing.T) {
	scenario, err := LoadStage1Scenario(threePassSS2022TestSubscriptionScenarioFile(t))
	if err != nil {
		t.Fatalf("LoadStage1Scenario() error = %v", err)
	}

	if scenario.SchemaVersion != 1 {
		t.Fatalf("SchemaVersion = %d, want 1", scenario.SchemaVersion)
	}
	if scenario.ScenarioID != "3pass-ss2022-test-subscription" {
		t.Fatalf("ScenarioID = %q", scenario.ScenarioID)
	}
	if len(scenario.Stage1Input.LandingItems) != 1 {
		t.Fatalf("len(LandingItems) = %d, want 1", len(scenario.Stage1Input.LandingItems))
	}
	if len(scenario.Stage1Input.ManualSocks5Items) != 0 {
		t.Fatalf("len(ManualSocks5Items) = %d, want 0", len(scenario.Stage1Input.ManualSocks5Items))
	}
	if len(scenario.Stage1Input.TransitItems) != 1 {
		t.Fatalf("len(TransitItems) = %d, want 1", len(scenario.Stage1Input.TransitItems))
	}
	if len(scenario.Stage1Input.ForwardRelayItems) != 0 {
		t.Fatalf("len(ForwardRelayItems) = %d, want 0", len(scenario.Stage1Input.ForwardRelayItems))
	}
	if len(scenario.TransitFixtures) != 0 {
		t.Fatalf("len(TransitFixtures) = %d, want 0", len(scenario.TransitFixtures))
	}
	if scenario.TemplateFixture != nil {
		t.Fatal("TemplateFixture should be nil for minimal 3pass canonical scenario")
	}
	if got := scenario.Stage1Input.LandingRawText(); got != "ss://MjAyMi1ibGFrZTMtYWVzLTI1Ni1nY206MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=@198.51.100.10:8888#SS2022-Test-256-US" {
		t.Fatalf("LandingRawText() = %q", got)
	}
	if got := scenario.Stage1Input.TransitRawText(); got != "http://198.51.100.20:3001/download/test-subscription" {
		t.Fatalf("TransitRawText() = %q", got)
	}
	files, err := RenderReviewStage1InputFiles(scenario.Stage1Input)
	if err != nil {
		t.Fatalf("RenderReviewStage1InputFiles() error = %v", err)
	}
	assertRenderedFile(t, files, LandingFileName, "ss://MjAyMi1ibGFrZTMtYWVzLTI1Ni1nY206MDEyMzQ1Njc4OWFiY2RlZjAxMjM0NTY3ODlhYmNkZWY=@198.51.100.10:8888#SS2022-Test-256-US\n")
	assertRenderedFile(t, files, TransitFileName, "http://198.51.100.20:3001/download/test-subscription\n")
	assertRenderedFile(t, files, ForwardRelaysFileName, "")
	assertRenderedFile(t, files, AdvancedOptionsFileName, "emoji: true\nudp: true\nskipCertVerify:\nconfig: https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini\ninclude:\nexclude:\n")
	if got := scenario.Stage1Input.LandingRawTextWithManualSocks(); got != scenario.Stage1Input.LandingRawText() {
		t.Fatalf("LandingRawTextWithManualSocks() = %q, want identical landing text when no manual socks items", got)
	}
}

func TestRenderReviewStage1InputFiles(t *testing.T) {
	emoji := true
	udp := true
	skipCertVerify := false
	config := "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini"

	files, err := RenderReviewStage1InputFiles(CanonicalStage1Input{
		LandingItems: []string{"landing-a", "landing-b"},
		ManualSocks5Items: []ManualSocks5Item{{
			Name:         "Manual-SOCKS5-Test",
			Server:       "manual-socks.example.test",
			Port:         1080,
			GeneratedURI: "tg://socks?server=manual-socks.example.test&port=1080&remarks=Manual-SOCKS5-Test",
		}},
		TransitItems:      []string{"transit-a", "transit-b"},
		ForwardRelayItems: []string{"relay-a:7443"},
		AdvancedOptions: AdvancedOptions{
			Emoji:          &emoji,
			UDP:            &udp,
			SkipCertVerify: &skipCertVerify,
			Config:         &config,
			Include:        []string{"HK", "JP"},
			Exclude:        []string{"Expired"},
		},
	})
	if err != nil {
		t.Fatalf("RenderReviewStage1InputFiles() error = %v", err)
	}

	assertRenderedFile(t, files, LandingFileName, "landing-a\nlanding-b\ntg://socks?server=manual-socks.example.test&port=1080&remarks=Manual-SOCKS5-Test\n")
	assertRenderedFile(t, files, TransitFileName, "transit-a\ntransit-b\n")
	assertRenderedFile(t, files, ForwardRelaysFileName, "relay-a:7443\n")
	assertRenderedFile(t, files, AdvancedOptionsFileName, "emoji: true\nudp: true\nskipCertVerify: false\nconfig: https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini\ninclude:\n  - HK\n  - JP\nexclude:\n  - Expired\n")
}

func TestCanonicalStage1Input_ToReviewStage1Input(t *testing.T) {
	tests := []struct {
		name                string
		scenarioFile        string
		manualSocksAppended bool
	}{
		{
			name:                "dual landing appends manual socks",
			scenarioFile:        dualLandingChainPortForwardScenarioFile(t),
			manualSocksAppended: true,
		},
		{
			name:                "minimal 3pass stays unchanged",
			scenarioFile:        threePassSS2022TestSubscriptionScenarioFile(t),
			manualSocksAppended: false,
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			scenario, err := LoadStage1Scenario(test.scenarioFile)
			if err != nil {
				t.Fatalf("LoadStage1Scenario() error = %v", err)
			}

			reviewStage1Input := scenario.Stage1Input.ToReviewStage1Input()
			wantLandingRawText := scenario.Stage1Input.LandingRawTextWithManualSocks()
			if reviewStage1Input.LandingRawText != wantLandingRawText {
				t.Fatalf("LandingRawText = %q, want %q", reviewStage1Input.LandingRawText, wantLandingRawText)
			}
			if reviewStage1Input.TransitRawText != scenario.Stage1Input.TransitRawText() {
				t.Fatalf("TransitRawText = %q, want %q", reviewStage1Input.TransitRawText, scenario.Stage1Input.TransitRawText())
			}
			if !reflect.DeepEqual(reviewStage1Input.ForwardRelayItems, scenario.Stage1Input.ForwardRelayItems) {
				t.Fatalf("ForwardRelayItems = %v, want %v", reviewStage1Input.ForwardRelayItems, scenario.Stage1Input.ForwardRelayItems)
			}
			if test.manualSocksAppended && reviewStage1Input.LandingRawText == scenario.Stage1Input.LandingRawText() {
				t.Fatal("LandingRawText should append manual socks URIs for review semantics")
			}
			if !test.manualSocksAppended && reviewStage1Input.LandingRawText != scenario.Stage1Input.LandingRawText() {
				t.Fatal("LandingRawText should stay unchanged when no manual socks items are present")
			}

			files, err := RenderReviewStage1InputFiles(scenario.Stage1Input)
			if err != nil {
				t.Fatalf("RenderReviewStage1InputFiles() error = %v", err)
			}
			assertRenderedFile(t, files, LandingFileName, renderRawTextFile(reviewStage1Input.LandingRawText))
			assertRenderedFile(t, files, TransitFileName, renderRawTextFile(reviewStage1Input.TransitRawText))
			assertRenderedFile(t, files, ForwardRelaysFileName, renderTextFile(reviewStage1Input.ForwardRelayItems))
		})
	}
}

func dualLandingChainPortForwardScenarioFile(t *testing.T) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}

	return filepath.Join(
		filepath.Dir(currentFile),
		"..",
		"..",
		"testdata",
		"canonical-scenarios",
		"dual-landing-chain-port-forward.stage1.json",
	)
}

func threePassSS2022TestSubscriptionScenarioFile(t *testing.T) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}

	return filepath.Join(
		filepath.Dir(currentFile),
		"..",
		"..",
		"testdata",
		"canonical-scenarios",
		"3pass-ss2022-test-subscription.stage1.json",
	)
}

func assertRenderedFile(t *testing.T, files []RenderedFile, name string, want string) {
	t.Helper()

	for _, file := range files {
		if file.Name != name {
			continue
		}
		if file.Content != want {
			t.Fatalf("%s = %q, want %q", name, file.Content, want)
		}
		return
	}

	t.Fatalf("rendered file %q not found", name)
}

func assertTransitCorpusRichness(t *testing.T, scenario Stage1Scenario) {
	t.Helper()

	protocols := make(map[string]struct{})
	regions := make(map[string]struct{})

	for _, fixture := range scenario.TransitFixtures {
		content, err := scenario.ReadRelativeFile(fixture.URIContentFile)
		if err != nil {
			t.Fatalf("ReadRelativeFile(%q) error = %v", fixture.URIContentFile, err)
		}
		lines := nonEmptyLines(content)
		if len(lines) < 10 {
			t.Fatalf("%s line count = %d, want at least 10", fixture.URIContentFile, len(lines))
		}
		for _, line := range lines {
			protocols[protocolName(line)] = struct{}{}
			for _, region := range []string{"HongKong", "Japan", "UnitedStates", "Singapore", "Taiwan", "Korea"} {
				if strings.Contains(line, region) {
					regions[region] = struct{}{}
				}
			}
		}
	}

	if len(protocols) < 8 {
		t.Fatalf("protocol coverage = %d, want at least 8 (%v)", len(protocols), protocols)
	}
	if len(regions) < 6 {
		t.Fatalf("region coverage = %d, want at least 6 (%v)", len(regions), regions)
	}
}

func nonEmptyLines(content string) []string {
	parts := strings.Split(content, "\n")
	lines := make([]string, 0, len(parts))
	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}
		lines = append(lines, trimmed)
	}
	return lines
}

func protocolName(line string) string {
	switch {
	case strings.HasPrefix(line, "ssr://"):
		return "ssr"
	case strings.HasPrefix(line, "tg://socks?"):
		return "socks5"
	case strings.HasPrefix(line, "hysteria2://") || strings.HasPrefix(line, "hy2://"):
		return "hysteria2"
	case strings.HasPrefix(line, "anytls://"):
		return "anytls"
	case strings.HasPrefix(line, "tuic://"):
		return "tuic"
	case strings.HasPrefix(line, "vmess://"):
		return "vmess"
	case strings.HasPrefix(line, "vless://"):
		return "vless"
	case strings.HasPrefix(line, "trojan://"):
		return "trojan"
	case strings.HasPrefix(line, "ss://"):
		return "ss"
	default:
		return "unknown"
	}
}
