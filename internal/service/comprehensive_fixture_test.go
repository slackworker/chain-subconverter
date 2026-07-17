package service

import (
	"context"
	"os"
	"path/filepath"
	"reflect"
	"regexp"
	"runtime"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
	"github.com/slackworker/chain-subconverter/internal/testfixtures"
)

const dualLandingChainPortForwardFixtureName = "dual-landing-chain-port-forward"

func TestBuildStage2Init_DualLandingChainPortForwardFixture(t *testing.T) {
	stage2Init, err := BuildStage2Init(dualLandingChainPortForwardStage1Input(t), dualLandingChainPortForwardConversionFixtures(t))
	if err != nil {
		t.Fatalf("BuildStage2Init() error = %v", err)
	}

	if len(stage2Init.Rows) != 5 {
		t.Fatalf("len(stage2Init.Rows) = %d, want 5", len(stage2Init.Rows))
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

	alphaChain := findStage2InitRow(t, stage2Init, "🇸🇬 Alpha-SS-SG")
	if alphaChain.Mode != "chain" {
		t.Fatalf("🇸🇬 Alpha-SS-SG mode = %q, want %q", alphaChain.Mode, "chain")
	}
	if alphaChain.TargetName == nil || *alphaChain.TargetName != "🇸🇬 新加坡节点" {
		t.Fatalf("🇸🇬 Alpha-SS-SG targetName = %v, want %q", alphaChain.TargetName, "🇸🇬 新加坡节点")
	}

	alphaReality := findStage2InitRow(t, stage2Init, "🇸🇬 Alpha-Reality-SG")
	if alphaReality.Mode != "chain" {
		t.Fatalf("🇸🇬 Alpha-Reality-SG mode = %q, want %q", alphaReality.Mode, "chain")
	}
	if alphaReality.TargetName == nil || *alphaReality.TargetName != "🇸🇬 新加坡节点" {
		t.Fatalf("🇸🇬 Alpha-Reality-SG targetName = %v, want %q", alphaReality.TargetName, "🇸🇬 新加坡节点")
	}
	if alphaReality.LandingNodeType != "Reality" {
		t.Fatalf("🇸🇬 Alpha-Reality-SG landing type = %q, want %q", alphaReality.LandingNodeType, "Reality")
	}
	if warning, ok := alphaReality.ModeWarnings["chain"]; !ok || warning.ReasonCode != "DISCOURAGED_BY_LANDING_PROTOCOL" {
		t.Fatalf("🇸🇬 Alpha-Reality-SG chain warning = %v, want protocol warning", alphaReality.ModeWarnings)
	}

	betaReality := findStage2InitRow(t, stage2Init, "🇯🇵 Beta-Reality-JP")
	if betaReality.Mode != "chain" {
		t.Fatalf("🇯🇵 Beta-Reality-JP mode = %q, want %q", betaReality.Mode, "chain")
	}
	if betaReality.TargetName == nil || *betaReality.TargetName != "🇯🇵 日本节点" {
		t.Fatalf("🇯🇵 Beta-Reality-JP targetName = %v, want %q", betaReality.TargetName, "🇯🇵 日本节点")
	}

	manualSocks := findStage2InitRow(t, stage2Init, "🇭🇰 Manual-SOCKS5-HK-Fallback")
	if manualSocks.Mode != "chain" {
		t.Fatalf("🇭🇰 Manual-SOCKS5-HK-Fallback mode = %q, want %q", manualSocks.Mode, "chain")
	}
	if manualSocks.TargetName == nil || *manualSocks.TargetName != "🇭🇰 香港节点" {
		t.Fatalf("🇭🇰 Manual-SOCKS5-HK-Fallback targetName = %v, want %q", manualSocks.TargetName, "🇭🇰 香港节点")
	}
	if manualSocks.LandingNodeType != "SOCKS5" {
		t.Fatalf("🇭🇰 Manual-SOCKS5-HK-Fallback landing type = %q, want %q", manualSocks.LandingNodeType, "SOCKS5")
	}
}

func TestResolveURLFromSource_DualLandingChainPortForwardFixtureReplayable(t *testing.T) {
	request := GenerateRequest{
		Stage1Input:    dualLandingChainPortForwardStage1Input(t),
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
	if len(FlatStage2Rows(response.Stage2.Snapshot)) != 8 {
		t.Fatalf("len(FlatStage2Rows(response.Stage2.Snapshot)) = %d, want 8", len(FlatStage2Rows(response.Stage2.Snapshot)))
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
	if !reflect.DeepEqual(response.Messages, []Message{{
		Level:   "info",
		Code:    "RESTORE_METADATA_READY",
		Message: "已读取恢复快照。",
	}}) {
		t.Fatalf("expected replayable restore summary, got %v", response.Messages)
	}
	assertSnapshotRow(t, FlatStage2Rows(response.Stage2.Snapshot), "🇸🇬 Alpha-SS-SG", "chain", "🇭🇰 香港节点")
	assertSnapshotRow(t, FlatStage2Rows(response.Stage2.Snapshot), "🇸🇬 Alpha-SS-SG 2", "chain", "🇸🇬 新加坡节点")
	assertSnapshotRow(t, FlatStage2Rows(response.Stage2.Snapshot), "🇸🇬 Alpha-Reality-SG", "none", "")
	assertSnapshotRow(t, FlatStage2Rows(response.Stage2.Snapshot), "🇸🇬 Alpha-Reality-SG 2", "port_forward", "relay-a.example.com:7443")
	assertSnapshotRow(t, FlatStage2Rows(response.Stage2.Snapshot), "🇸🇬 Alpha-Reality-SG 3", "port_forward", "relay-b.example.com:8443")
	assertSnapshotRow(t, FlatStage2Rows(response.Stage2.Snapshot), "🇯🇵 Beta-Reality-JP", "none", "")
	assertSnapshotRow(t, FlatStage2Rows(response.Stage2.Snapshot), "🇭🇰 Manual-SOCKS5-HK-Fallback", "chain", "🇭🇰 香港节点")
	if !response.Stage2.Snapshot.ChainProxyTargetGroupSwitchOptimizationEnabled {
		t.Fatal("expected chainProxyTargetGroupSwitchOptimizationEnabled to be true")
	}
	assertServerAggregationGroup(
		t,
		FlatAggregationGroups(response.Stage2.Snapshot),
		"198.51.100.10",
		true,
		"fallback",
		[]string{
			"🇸🇬 Alpha-Reality-SG 2",
			"🇸🇬 Alpha-Reality-SG 3",
			"🇸🇬 Alpha-SS-SG",
			"🇸🇬 Alpha-SS-SG 2",
		},
	)
}

func TestResolveURLFromSource_DualLandingChainPortForwardFixtureShortURL(t *testing.T) {
	request := GenerateRequest{
		Stage1Input:    dualLandingChainPortForwardStage1Input(t),
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
	var expectedShortLinkResponse ShortLinkResponse
	readJSONFixture(t, filepath.Join(dualLandingChainPortForwardFixtureDirectory(t), "stage2", "output", "short-links.response.json"), &expectedShortLinkResponse)
	if !reflect.DeepEqual(shortLinkResponse, expectedShortLinkResponse) {
		t.Fatalf("short link response mismatch: got %#v want %#v", shortLinkResponse, expectedShortLinkResponse)
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
	if !reflect.DeepEqual(response.Messages, []Message{{
		Level:   "info",
		Code:    "RESTORE_METADATA_READY",
		Message: "已读取恢复快照。",
	}}) {
		t.Fatalf("expected replayable restore summary, got %v", response.Messages)
	}
}

func TestDualLandingManualReferenceShortIDMatchesGeneratedResult(t *testing.T) {
	request := GenerateRequest{
		Stage1Input:    dualLandingChainPortForwardStage1Input(t),
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

	matches := dualLandingManualReferenceShortIDPattern.FindStringSubmatch(readDualLandingManualReferenceDoc(t))
	if len(matches) != 2 {
		t.Fatalf("failed to parse short ID from docs/testing/preview-inputs.md")
	}

	expectedShortID := matches[1]
	gotShortID := filepath.Base(shortLinkResponse.ShortURL)
	if gotShortID != expectedShortID {
		t.Fatalf("manual reference short ID drift: got %q want %q", gotShortID, expectedShortID)
	}
}

var dualLandingManualReferenceShortIDPattern = regexp.MustCompile("short ID 金样：`([^`]+)`")

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

func dualLandingChainPortForwardCanonicalScenarioFile(t *testing.T) string {
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
		dualLandingChainPortForwardFixtureName+".stage1.json",
	)
}

func dualLandingManualReferenceFile(t *testing.T) string {
	t.Helper()

	_, currentFile, _, ok := runtime.Caller(0)
	if !ok {
		t.Fatal("runtime.Caller failed")
	}

	return filepath.Join(
		filepath.Dir(currentFile),
		"..",
		"..",
		"docs",
		"testing",
		"preview-inputs.md",
	)
}

func readDualLandingManualReferenceDoc(t *testing.T) string {
	t.Helper()

	content, err := os.ReadFile(dualLandingManualReferenceFile(t))
	if err != nil {
		t.Fatalf("read manual reference doc: %v", err)
	}
	return normalizeTestFixtureNewlines(string(content))
}

type dualLandingChainPortForwardSource struct {
	result               subconverter.ThreePassResult
	templateConfig       string
	effectiveTemplateURL string
}

func newDualLandingChainPortForwardSource(t *testing.T) *dualLandingChainPortForwardSource {
	t.Helper()

	return &dualLandingChainPortForwardSource{
		result:               loadThreePassResultFromDirectory(t, dualLandingChainPortForwardFixtureDirectory(t)),
		templateConfig:       dualLandingChainPortForwardTemplateConfig(t),
		effectiveTemplateURL: loadDualLandingChainPortForwardScenario(t).TemplateFixture.InputURL,
	}
}

func (source *dualLandingChainPortForwardSource) PrepareConversion(_ context.Context, stage1Input Stage1Input) (PreparedConversion, error) {
	return PreparedConversion{
		Request:              toSubconverterRequest(stage1Input),
		TemplateConfig:       source.templateConfig,
		EffectiveTemplateURL: source.effectiveTemplateURL,
		ManagedTemplateURL:   "http://managed-template.invalid/internal/templates/dual-landing-chain-port-forward.ini",
	}, nil
}

func (source *dualLandingChainPortForwardSource) Convert(_ context.Context, _ subconverter.Request) (subconverter.ThreePassResult, error) {
	return source.result, nil
}

func (source *dualLandingChainPortForwardSource) ConvertWithPlan(_ context.Context, _ subconverter.Request, plan subconverter.ConvertPlan) (subconverter.ThreePassResult, error) {
	result := source.result
	if !plan.IncludeFullBase {
		result.FullBase = subconverter.PassResult{}
	}
	return result, nil
}

func (source *dualLandingChainPortForwardSource) RenderManagedPass3(_ context.Context, _ PreparedConversion, managedLandingYAML string, managedTransitProxiesYAML string) (string, error) {
	return SynthesizeManagedPass3FullBaseYAML(
		source.result.FullBase.YAML,
		source.result.LandingDiscovery.YAML,
		managedLandingYAML,
		managedTransitProxiesYAML,
	)
}

func dualLandingChainPortForwardStage1Input(t *testing.T) Stage1Input {
	t.Helper()

	scenario := loadDualLandingChainPortForwardScenario(t)

	return Stage1Input{
		LandingRawText:    scenario.Stage1Input.LandingRawTextWithManualSocks(),
		TransitRawText:    scenario.Stage1Input.TransitRawText(),
		ForwardRelayItems: append([]string(nil), scenario.Stage1Input.ForwardRelayItems...),
		AdvancedOptions: AdvancedOptions{
			Emoji:          scenario.Stage1Input.AdvancedOptions.Emoji,
			UDP:            scenario.Stage1Input.AdvancedOptions.UDP,
			SkipCertVerify: scenario.Stage1Input.AdvancedOptions.SkipCertVerify,
			Config:         scenario.Stage1Input.AdvancedOptions.Config,
			Include:        append([]string(nil), scenario.Stage1Input.AdvancedOptions.Include...),
			Exclude:        append([]string(nil), scenario.Stage1Input.AdvancedOptions.Exclude...),
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
		TemplateConfig:       dualLandingChainPortForwardTemplateConfig(t),
	}
}

func dualLandingChainPortForwardStage2Snapshot(t *testing.T) Stage2Snapshot {
	t.Helper()

	var fixture Stage2SnapshotFixture
	readJSONFixture(t, filepath.Join(dualLandingChainPortForwardFixtureDirectory(t), "stage2", "input", "stage2-snapshot.json"), &fixture)
	return fixture.Stage2Snapshot
}

func loadDualLandingChainPortForwardScenario(t *testing.T) testfixtures.Stage1Scenario {
	t.Helper()

	scenario, err := testfixtures.LoadStage1Scenario(dualLandingChainPortForwardCanonicalScenarioFile(t))
	if err != nil {
		t.Fatalf("LoadStage1Scenario() error = %v", err)
	}
	return scenario
}

func dualLandingChainPortForwardTemplateConfig(t *testing.T) string {
	t.Helper()

	scenario := loadDualLandingChainPortForwardScenario(t)
	if scenario.TemplateFixture == nil {
		t.Fatal("TemplateFixture should not be nil")
	}
	content, err := scenario.ReadRelativeFile(scenario.TemplateFixture.ContentFile)
	if err != nil {
		t.Fatalf("ReadRelativeFile(%q) error = %v", scenario.TemplateFixture.ContentFile, err)
	}
	return content
}

func findStage2InitRow(t *testing.T, stage2Init Stage2Init, proxyName string) Stage2InitRow {
	t.Helper()

	for _, row := range stage2Init.Rows {
		if row.ProxyName == proxyName {
			return row
		}
	}

	t.Fatalf("proxy %q not found in stage2 init rows: %v", proxyName, stage2Init.Rows)
	return Stage2InitRow{}
}

func assertSnapshotRow(t *testing.T, rows []Stage2Row, proxyName string, mode string, targetName string) {
	t.Helper()

	for _, row := range rows {
		if row.ProxyName != proxyName {
			continue
		}
		if row.Mode != mode {
			t.Fatalf("row %q mode = %q, want %q", proxyName, row.Mode, mode)
		}
		if targetName == "" {
			if row.TargetName != nil {
				t.Fatalf("row %q targetName = %v, want nil", proxyName, row.TargetName)
			}
			return
		}
		if row.TargetName == nil || *row.TargetName != targetName {
			t.Fatalf("row %q targetName = %v, want %q", proxyName, row.TargetName, targetName)
		}
		return
	}

	t.Fatalf("proxy %q not found in snapshot rows: %v", proxyName, rows)
}

func assertServerAggregationGroup(
	t *testing.T,
	groups []ServerAggregationGroup,
	server string,
	enabled bool,
	strategy string,
	memberRowIDs []string,
) {
	t.Helper()

	for _, group := range groups {
		if group.Server != server {
			continue
		}
		if group.Enabled != enabled {
			t.Fatalf("server aggregation group %q enabled = %v, want %v", server, group.Enabled, enabled)
		}
		if group.Strategy != strategy {
			t.Fatalf("server aggregation group %q strategy = %q, want %q", server, group.Strategy, strategy)
		}
		if !reflect.DeepEqual(group.MemberRowIDs, memberRowIDs) {
			t.Fatalf("server aggregation group %q memberRowIds = %v, want %v", server, group.MemberRowIDs, memberRowIDs)
		}
		return
	}

	t.Fatalf("server aggregation group %q not found: %v", server, groups)
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
