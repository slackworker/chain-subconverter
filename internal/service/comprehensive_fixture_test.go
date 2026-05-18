package service

import (
	"context"
	"path/filepath"
	"runtime"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

const dualLandingChainPortForwardFixtureName = "dual-landing-chain-port-forward"

func TestBuildStage2Init_DualLandingChainPortForwardFixture(t *testing.T) {
	stage2Init, err := BuildStage2Init(dualLandingChainPortForwardStage1Input(), dualLandingChainPortForwardConversionFixtures(t))
	if err != nil {
		t.Fatalf("BuildStage2Init() error = %v", err)
	}

	if len(stage2Init.Rows) != 6 {
		t.Fatalf("len(stage2Init.Rows) = %d, want 6", len(stage2Init.Rows))
	}
	if len(stage2Init.ForwardRelays) != 2 {
		t.Fatalf("len(stage2Init.ForwardRelays) = %d, want 2", len(stage2Init.ForwardRelays))
	}
	if !hasChainTarget(stage2Init.ChainTargets, "🇭🇰 香港节点", "proxy-groups") {
		t.Fatalf("expected chain target %q, got %v", "🇭🇰 香港节点", stage2Init.ChainTargets)
	}
	if !hasChainTarget(stage2Init.ChainTargets, "🇯🇵 日本节点", "proxy-groups") {
		t.Fatalf("expected chain target %q, got %v", "🇯🇵 日本节点", stage2Init.ChainTargets)
	}

	alphaChain := findStage2InitRow(t, stage2Init, "Alpha-SS-HK")
	if alphaChain.Mode != "chain" {
		t.Fatalf("Alpha-SS-HK mode = %q, want %q", alphaChain.Mode, "chain")
	}
	if alphaChain.TargetName == nil || *alphaChain.TargetName != "🇭🇰 香港节点" {
		t.Fatalf("Alpha-SS-HK targetName = %v, want %q", alphaChain.TargetName, "🇭🇰 香港节点")
	}

	alphaReality := findStage2InitRow(t, stage2Init, "Alpha-Reality-PortForward")
	if alphaReality.Mode != "none" {
		t.Fatalf("Alpha-Reality-PortForward mode = %q, want %q", alphaReality.Mode, "none")
	}
	if alphaReality.TargetName != nil {
		t.Fatalf("Alpha-Reality-PortForward targetName = %v, want nil", alphaReality.TargetName)
	}
	if alphaReality.LandingNodeType != "Reality" {
		t.Fatalf("Alpha-Reality-PortForward landing type = %q, want %q", alphaReality.LandingNodeType, "Reality")
	}
	if warning, ok := alphaReality.ModeWarnings["chain"]; !ok || warning.ReasonCode != "DISCOURAGED_BY_LANDING_PROTOCOL" {
		t.Fatalf("Alpha-Reality-PortForward chain warning = %v, want protocol warning", alphaReality.ModeWarnings)
	}
}

func TestResolveURLFromSource_DualLandingChainPortForwardFixtureReplayable(t *testing.T) {
	request := GenerateRequest{
		Stage1Input:    dualLandingChainPortForwardStage1Input(),
		Stage2Snapshot: dualLandingChainPortForwardStage2Snapshot(t),
	}
	source := newDualLandingChainPortForwardSource(t)

	generateResponse, err := BuildGenerateResponseFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		request,
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("BuildGenerateResponseFromSource() error = %v", err)
	}

	response, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		nil,
		generateResponse.LongURL,
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("ResolveURLFromSource() error = %v", err)
	}

	if response.RestoreStatus != "replayable" {
		t.Fatalf("restoreStatus = %q, want %q", response.RestoreStatus, "replayable")
	}
	if len(response.Stage2Snapshot.Rows) != 6 {
		t.Fatalf("len(response.Stage2Snapshot.Rows) = %d, want 6", len(response.Stage2Snapshot.Rows))
	}
	if response.ShortURL != "" {
		t.Fatalf("ShortURL = %q, want empty for long-url replay", response.ShortURL)
	}
	if response.LongURL != generateResponse.LongURL {
		t.Fatalf("LongURL mismatch: got %q want %q", response.LongURL, generateResponse.LongURL)
	}
	if len(response.BlockingErrors) != 0 {
		t.Fatalf("expected 0 blocking errors, got %v", response.BlockingErrors)
	}
	if len(response.Messages) != 0 {
		t.Fatalf("expected 0 messages, got %v", response.Messages)
	}
	assertSnapshotRow(t, response.Stage2Snapshot.Rows, "Alpha-Reality-PortForward", "port_forward", "relay-a.example.com:7443")
	assertSnapshotRow(t, response.Stage2Snapshot.Rows, "Alpha-Reality-Direct", "none", "")
	assertSnapshotRow(t, response.Stage2Snapshot.Rows, "Beta-Reality-PortForward", "port_forward", "relay-b.example.com:8443")
	assertSnapshotRow(t, response.Stage2Snapshot.Rows, "Beta-Reality-Direct", "none", "")
}

func TestResolveURLFromSource_DualLandingChainPortForwardFixtureShortURL(t *testing.T) {
	request := GenerateRequest{
		Stage1Input:    dualLandingChainPortForwardStage1Input(),
		Stage2Snapshot: dualLandingChainPortForwardStage2Snapshot(t),
	}
	source := newDualLandingChainPortForwardSource(t)
	store := NewInMemoryShortLinkStore()

	generated, err := BuildGenerateResponseFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		request,
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("BuildGenerateResponseFromSource() error = %v", err)
	}

	shortLinkResponse, err := BuildShortLinkResponse(context.Background(), "http://localhost:11200", store, generated.LongURL, 0, InputLimits{})
	if err != nil {
		t.Fatalf("BuildShortLinkResponse() error = %v", err)
	}

	response, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		store,
		shortLinkResponse.ShortURL,
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("ResolveURLFromSource() error = %v", err)
	}

	if response.RestoreStatus != "replayable" {
		t.Fatalf("restoreStatus = %q, want %q", response.RestoreStatus, "replayable")
	}
	if response.ShortURL != shortLinkResponse.ShortURL {
		t.Fatalf("ShortURL mismatch: got %q want %q", response.ShortURL, shortLinkResponse.ShortURL)
	}
	if response.LongURL != shortLinkResponse.LongURL {
		t.Fatalf("LongURL mismatch: got %q want %q", response.LongURL, shortLinkResponse.LongURL)
	}
}

func dualLandingChainPortForwardFixtureDirectory(t *testing.T) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}

	return filepath.Join(
		filepath.Dir(currentFile),
		"..",
		"review",
		"testdata",
		dualLandingChainPortForwardFixtureName,
	)
}

type dualLandingChainPortForwardSource struct {
	result subconverter.ThreePassResult
}

func newDualLandingChainPortForwardSource(t *testing.T) *dualLandingChainPortForwardSource {
	t.Helper()

	return &dualLandingChainPortForwardSource{
		result: loadThreePassResultFromDirectory(t, dualLandingChainPortForwardFixtureDirectory(t)),
	}
}

func (source *dualLandingChainPortForwardSource) PrepareConversion(_ context.Context, stage1Input Stage1Input) (PreparedConversion, error) {
	return PreparedConversion{
		Request:              toSubconverterRequest(stage1Input),
		TemplateConfig:       dualLandingChainPortForwardTemplateConfig(),
		EffectiveTemplateURL: "https://templates.example.com/chain-subconverter-comprehensive.ini",
		ManagedTemplateURL:   "http://managed-template.invalid/internal/templates/dual-landing-chain-port-forward.ini",
	}, nil
}

func (source *dualLandingChainPortForwardSource) Convert(_ context.Context, _ subconverter.Request) (subconverter.ThreePassResult, error) {
	return source.result, nil
}

func dualLandingChainPortForwardStage1Input() Stage1Input {
	config := "https://templates.example.com/chain-subconverter-comprehensive.ini"
	emoji := true
	udp := true
	skipCertVerify := false
	return Stage1Input{
		LandingRawText: `ss://YWxwaGEtc3MtaGstc2VjcmV0@198.51.100.10:443#Alpha-SS-HK
vless://11111111-1111-4111-8111-111111111111@198.51.100.10:8443?encryption=none&security=reality&sni=alpha.example.com&pbk=alpha-public-key&fp=chrome&type=tcp#Alpha-Reality-PortForward
vless://11111111-1111-4111-8111-111111111112@198.51.100.10:8443?encryption=none&security=reality&sni=alpha.example.com&pbk=alpha-public-key&fp=chrome&type=tcp#Alpha-Reality-Direct
ss://YmV0YS1zcy1qcC1zZWNyZXQ=@198.51.100.11:443#Beta-SS-JP
vless://22222222-2222-4222-8222-222222222221@198.51.100.11:9443?encryption=none&security=reality&sni=beta.example.com&pbk=beta-public-key&fp=chrome&type=tcp#Beta-Reality-PortForward
vless://22222222-2222-4222-8222-222222222222@198.51.100.11:9443?encryption=none&security=reality&sni=beta.example.com&pbk=beta-public-key&fp=chrome&type=tcp#Beta-Reality-Direct`,
		TransitRawText:    "https://fixtures.example.com/transit-a-subscription.txt\nhttps://fixtures.example.com/transit-b-subscription.txt",
		ForwardRelayItems: []string{"relay-a.example.com:7443", "relay-b.example.com:8443"},
		AdvancedOptions: AdvancedOptions{
			Emoji:          &emoji,
			UDP:            &udp,
			SkipCertVerify: &skipCertVerify,
			Config:         &config,
			Include:        []string{"HK", "JP"},
			Exclude:        []string{"Expired"},
		},
	}
}

func dualLandingChainPortForwardConversionFixtures(t *testing.T) ConversionFixtures {
	t.Helper()

	fixtureDir := dualLandingChainPortForwardFixtureDirectory(t)
	return ConversionFixtures{
		LandingDiscoveryYAML: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "landing-discovery.yaml")),
		TransitDiscoveryYAML: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "transit-discovery.yaml")),
		FullBaseYAML:         readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "full-base.yaml")),
		TemplateConfig:       dualLandingChainPortForwardTemplateConfig(),
	}
}

func dualLandingChainPortForwardStage2Snapshot(t *testing.T) Stage2Snapshot {
	t.Helper()

	var fixture Stage2SnapshotFixture
	readJSONFixture(t, filepath.Join(dualLandingChainPortForwardFixtureDirectory(t), "stage2", "input", "stage2-snapshot.json"), &fixture)
	return fixture.Stage2Snapshot
}

func dualLandingChainPortForwardTemplateConfig() string {
	return `custom_proxy_group=🇭🇰 香港节点` + "`url-test`HK`https://cp.cloudflare.com/generate_204`300,,50\n" +
		`custom_proxy_group=🇯🇵 日本节点` + "`url-test`JP`https://cp.cloudflare.com/generate_204`300,,50\n"
}

func findStage2InitRow(t *testing.T, stage2Init Stage2Init, landingNodeName string) Stage2InitRow {
	t.Helper()

	for _, row := range stage2Init.Rows {
		if row.LandingNodeName == landingNodeName {
			return row
		}
	}

	t.Fatalf("landing node %q not found in stage2 init rows: %v", landingNodeName, stage2Init.Rows)
	return Stage2InitRow{}
}

func assertSnapshotRow(t *testing.T, rows []Stage2Row, landingNodeName string, mode string, targetName string) {
	t.Helper()

	for _, row := range rows {
		if row.LandingNodeName != landingNodeName {
			continue
		}
		if row.Mode != mode {
			t.Fatalf("row %q mode = %q, want %q", landingNodeName, row.Mode, mode)
		}
		if targetName == "" {
			if row.TargetName != nil {
				t.Fatalf("row %q targetName = %v, want nil", landingNodeName, row.TargetName)
			}
			return
		}
		if row.TargetName == nil || *row.TargetName != targetName {
			t.Fatalf("row %q targetName = %v, want %q", landingNodeName, row.TargetName, targetName)
		}
		return
	}

	t.Fatalf("landing node %q not found in snapshot rows: %v", landingNodeName, rows)
}

func loadThreePassResultFromDirectory(t *testing.T, fixtureDir string) subconverter.ThreePassResult {
	t.Helper()

	return subconverter.ThreePassResult{
		LandingDiscovery: subconverter.PassResult{
			RequestURL: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "landing-discovery.url.txt")),
			YAML:       readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "landing-discovery.yaml")),
		},
		TransitDiscovery: subconverter.PassResult{
			RequestURL: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "transit-discovery.url.txt")),
			YAML:       readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "transit-discovery.yaml")),
		},
		FullBase: subconverter.PassResult{
			RequestURL: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "full-base.url.txt")),
			YAML:       readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "full-base.yaml")),
		},
	}
}
