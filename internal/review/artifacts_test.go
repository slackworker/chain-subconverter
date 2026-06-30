package review

import (
	"context"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
	"github.com/slackworker/chain-subconverter/internal/testfixtures"
)

type fakeConversionSource struct {
	result subconverter.ThreePassResult
	err    error
}

func (source *fakeConversionSource) Convert(_ context.Context, _ subconverter.Request) (subconverter.ThreePassResult, error) {
	return source.result, source.err
}

type fakeTemplatePreparingSource struct {
	request        subconverter.Request
	templateConfig string
	result         subconverter.ThreePassResult
	err            error
}

func (source *fakeTemplatePreparingSource) PrepareConversion(_ context.Context, _ service.Stage1Input) (service.PreparedConversion, error) {
	return service.PreparedConversion{
		Request:                    source.request,
		TemplateConfig:             source.templateConfig,
		EffectiveTemplateURL:       "https://template-source.example/config.ini",
		ManagedTemplateURL:         "http://127.0.0.1:38123/internal/templates/abc123.ini",
		RecognizedRegionGroupNames: []string{"🇩🇪 德国节点"},
	}, nil
}

func (source *fakeTemplatePreparingSource) Convert(_ context.Context, request subconverter.Request) (subconverter.ThreePassResult, error) {
	source.request = request
	return source.result, source.err
}

type fakeManagedSnapshotSource struct {
	result                  subconverter.ThreePassResult
	templateConfig          string
	gotPlans                []subconverter.ConvertPlan
	renderManagedPass3Calls int
}

func (source *fakeManagedSnapshotSource) PrepareConversion(_ context.Context, stage1Input service.Stage1Input) (service.PreparedConversion, error) {
	normalized := service.NormalizeStage1Input(stage1Input)
	return service.PreparedConversion{
		Request: subconverter.Request{
			LandingRawText: normalized.LandingRawText,
			TransitRawText: normalized.TransitRawText,
			Options: subconverter.AdvancedOptions{
				Emoji:          normalized.AdvancedOptions.Emoji,
				UDP:            normalized.AdvancedOptions.UDP,
				SkipCertVerify: normalized.AdvancedOptions.SkipCertVerify,
				Config:         normalized.AdvancedOptions.Config,
				Include:        append([]string(nil), normalized.AdvancedOptions.Include...),
				Exclude:        append([]string(nil), normalized.AdvancedOptions.Exclude...),
			},
		},
		TemplateConfig:       source.templateConfig,
		EffectiveTemplateURL: "https://template-source.example/config.ini",
		ManagedTemplateURL:   "http://managed-template.invalid/internal/templates/test.ini",
	}, nil
}

func (source *fakeManagedSnapshotSource) Convert(_ context.Context, _ subconverter.Request) (subconverter.ThreePassResult, error) {
	return source.result, nil
}

func (source *fakeManagedSnapshotSource) ConvertWithPlan(_ context.Context, _ subconverter.Request, plan subconverter.ConvertPlan) (subconverter.ThreePassResult, error) {
	source.gotPlans = append(source.gotPlans, plan)
	result := source.result
	if !plan.IncludeFullBase {
		result.FullBase = subconverter.PassResult{}
	}
	return result, nil
}

func (source *fakeManagedSnapshotSource) RenderManagedPass3(_ context.Context, _ service.PreparedConversion, _ string, _ string) (string, error) {
	source.renderManagedPass3Calls++
	return source.result.FullBase.YAML, nil
}

func TestBuildDefaultArtifacts_HappyPath(t *testing.T) {
	testCase, err := LoadCase(filepath.Join("testdata", "3pass-ss2022-test-subscription"))
	if err != nil {
		t.Fatalf("LoadCase() error = %v", err)
	}

	fixtureDir := filepath.Join("testdata", "3pass-ss2022-test-subscription")
	stage1Bundle, err := BuildStage1Artifacts(context.Background(), &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}, testCase)
	if err != nil {
		t.Fatalf("BuildStage1Artifacts() error = %v", err)
	}

	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/review-summary.md", "| 🇺🇸 SS2022-Test-256-US | SS | chain | 🇺🇸 美国节点 |")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/full-base.url.raw.txt", "http://localhost:25500/sub?")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/template-diagnostics.json", "recognizedRegionGroups")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/autofill-pairs.txt", "🇺🇸 SS2022-Test-256-US | SS | chain | 🇺🇸 美国节点")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/chain-targets.txt", "[proxy-groups]")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/chain-targets.txt", "🇺🇸 美国节点")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/landing-discovery.yaml", "SS2022-Test-256-US")
	assertArtifactContains(t, stage1Bundle.Files, filepath.Join("stage2", "input", Stage2SnapshotFileName), "stage2Snapshot")
	if len(stage1Bundle.Rows) != 1 {
		t.Fatalf("len(stage1Bundle.Rows) = %d, want 1", len(stage1Bundle.Rows))
	}
	if stage1Bundle.Rows[0].Mode != "chain" {
		t.Fatalf("stage1Bundle.Rows[0].Mode = %q, want %q", stage1Bundle.Rows[0].Mode, "chain")
	}
	if stage1Bundle.Rows[0].TargetName == nil || *stage1Bundle.Rows[0].TargetName != "🇺🇸 美国节点" {
		t.Fatalf("stage1Bundle.Rows[0].TargetName = %v, want %q", stage1Bundle.Rows[0].TargetName, "🇺🇸 美国节点")
	}
	if findArtifact(stage1Bundle.Files, "stage1/output/forward-relays.txt").Content != "(none)\n" {
		t.Fatalf("stage1/output/forward-relays.txt = %q, want %q", findArtifact(stage1Bundle.Files, "stage1/output/forward-relays.txt").Content, "(none)\n")
	}
	if findArtifact(stage1Bundle.Files, "stage1/output/stage1-convert.response.json").Content == "" {
		t.Fatal("stage1/output/stage1-convert.response.json should not be empty")
	}
	testCase.Stage2Input.Rows = cloneRows(stage1Bundle.Rows)

	stage2Bundle, err := BuildStage2Artifacts(context.Background(), &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}, testCase, "http://localhost:11200", 0)
	if err != nil {
		t.Fatalf("BuildStage2Artifacts() error = %v", err)
	}
	assertArtifactContains(t, stage2Bundle.Files, "stage2/output/generate.response.json", "http://localhost:11200/sub?data=")
	assertArtifactContains(t, stage2Bundle.Files, "stage2/output/complete-config.chain.yaml", "dialer-proxy: 🇺🇸 美国节点")
	assertArtifactEqualsTrimmed(t, stage2Bundle.Files, "stage2/output/complete-config.chain.yaml", readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "complete-config.chain.yaml")))
}

func TestBuildDualLandingChainPortForwardArtifacts_HappyPath(t *testing.T) {
	testCase, err := LoadCase(filepath.Join("testdata", "dual-landing-chain-port-forward"))
	if err != nil {
		t.Fatalf("LoadCase() error = %v", err)
	}

	fixtureDir := filepath.Join("testdata", "dual-landing-chain-port-forward")
	source := &fakeTemplatePreparingSource{
		request: subconverter.Request{
			LandingRawText: testCase.Stage1Input.LandingRawText,
			TransitRawText: testCase.Stage1Input.TransitRawText,
			Options: subconverter.AdvancedOptions{
				Emoji:          testCase.Stage1Input.AdvancedOptions.Emoji,
				UDP:            testCase.Stage1Input.AdvancedOptions.UDP,
				SkipCertVerify: testCase.Stage1Input.AdvancedOptions.SkipCertVerify,
				Config:         testCase.Stage1Input.AdvancedOptions.Config,
				Include:        testCase.Stage1Input.AdvancedOptions.Include,
				Exclude:        testCase.Stage1Input.AdvancedOptions.Exclude,
			},
		},
		templateConfig: dualLandingChainPortForwardTemplateConfig(t),
		result:         loadThreePassResult(t, fixtureDir),
	}

	stage1Bundle, err := BuildStage1Artifacts(context.Background(), source, testCase)
	if err != nil {
		t.Fatalf("BuildStage1Artifacts() error = %v", err)
	}

	if len(stage1Bundle.Rows) != 5 {
		t.Fatalf("len(stage1Bundle.Rows) = %d, want 5", len(stage1Bundle.Rows))
	}
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/review-summary.md", "| 🇸🇬 Alpha-SS-SG | SS | chain | 🇸🇬 新加坡节点 |")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/review-summary.md", "| 🇸🇬 Alpha-Reality-SG | Reality | chain | 🇸🇬 新加坡节点 |")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/review-summary.md", "| 🇯🇵 Beta-SS-JP | SS | chain | 🇯🇵 日本节点 |")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/review-summary.md", "| 🇭🇰 Manual-SOCKS5-HK-Fallback | SOCKS5 | chain | 🇭🇰 香港节点 |")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/forward-relays.txt", "relay-a.example.com:7443")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/forward-relays.txt", "relay-b.example.com:8443")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/template-diagnostics.json", "🇭🇰 香港节点")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/template-diagnostics.json", "🇯🇵 日本节点")

	stage2Bundle, err := BuildStage2Artifacts(context.Background(), source, testCase, "http://localhost:11200", 0)
	if err != nil {
		t.Fatalf("BuildStage2Artifacts() error = %v", err)
	}

	assertArtifactEqualsTrimmed(t, stage2Bundle.Files, "stage2/output/generate.request.json", readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.request.json")))
	assertArtifactEqualsTrimmed(t, stage2Bundle.Files, "stage2/output/generate.response.json", readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.response.json")))
	assertArtifactEqualsTrimmed(t, stage2Bundle.Files, "stage2/output/short-links.request.json", readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "short-links.request.json")))
	assertArtifactEqualsTrimmed(t, stage2Bundle.Files, "stage2/output/short-links.response.json", readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "short-links.response.json")))
	assertArtifactEqualsTrimmed(t, stage2Bundle.Files, "stage2/output/long-url.payload.json", readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "long-url.payload.json")))
	assertArtifactEqualsTrimmed(t, stage2Bundle.Files, "stage2/output/complete-config.chain.yaml", readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "complete-config.chain.yaml")))
}

func TestBuildStage2Artifacts_UsesManagedPass3SourcePathWhenAvailable(t *testing.T) {
	testCase, err := LoadCase(filepath.Join("testdata", "dual-landing-chain-port-forward"))
	if err != nil {
		t.Fatalf("LoadCase() error = %v", err)
	}
	testCase.Stage2Input.ServerAggregationGroups = nil

	fixtureDir := filepath.Join("testdata", "dual-landing-chain-port-forward")
	source := &fakeManagedSnapshotSource{
		result:         loadThreePassResult(t, fixtureDir),
		templateConfig: dualLandingChainPortForwardTemplateConfig(t),
	}

	_, err = BuildStage2Artifacts(context.Background(), source, testCase, "http://localhost:11200", 0)
	if err != nil {
		t.Fatalf("BuildStage2Artifacts() error = %v", err)
	}

	if source.renderManagedPass3Calls < 2 {
		t.Fatalf("renderManagedPass3Calls = %d, want >= 2", source.renderManagedPass3Calls)
	}
	if len(source.gotPlans) == 0 {
		t.Fatal("gotPlans is empty, want Stage1InitConvertPlan calls")
	}
	for _, plan := range source.gotPlans {
		if plan != subconverter.Stage1InitConvertPlan() {
			t.Fatalf("unexpected convert plan = %+v, want %+v", plan, subconverter.Stage1InitConvertPlan())
		}
	}
}

func dualLandingChainPortForwardTemplateConfig(t *testing.T) string {
	t.Helper()

	scenario, err := testfixtures.LoadStage1Scenario(filepath.Join("..", "..", "testdata", "canonical-scenarios", "dual-landing-chain-port-forward.stage1.json"))
	if err != nil {
		t.Fatalf("LoadStage1Scenario() error = %v", err)
	}
	if scenario.TemplateFixture == nil {
		t.Fatal("TemplateFixture should not be nil")
	}
	content, err := scenario.ReadRelativeFile(scenario.TemplateFixture.ContentFile)
	if err != nil {
		t.Fatalf("ReadRelativeFile(%q) error = %v", scenario.TemplateFixture.ContentFile, err)
	}
	return content
}

func TestBuildStage1Artifacts_UsesPreparedTemplateConfigAndNormalizesManagedTemplateURL(t *testing.T) {
	source := &fakeTemplatePreparingSource{
		request: subconverter.Request{
			LandingRawText: "https://landing.example/sub",
			TransitRawText: "https://transit.example/sub",
			Options: subconverter.AdvancedOptions{
				Config: stringPtr("http://127.0.0.1:38123/internal/templates/abc123.ini"),
			},
		},
		templateConfig: "custom_proxy_group=🇩🇪 德国节点`fallback`(DE|德国)`https://cp.cloudflare.com/generate_204`300,,50\n",
		result: subconverter.ThreePassResult{
			LandingDiscovery: subconverter.PassResult{
				RequestURL: "http://localhost:25511/sub?target=clash&url=https%3A%2F%2Flanding.example%2Fsub&list=true&config=http%3A%2F%2F127.0.0.1%3A38123%2Finternal%2Ftemplates%2Fabc123.ini",
				YAML:       "proxies:\n- {name: DE Landing, type: ss}\n",
			},
			TransitDiscovery: subconverter.PassResult{
				RequestURL: "http://localhost:25511/sub?target=clash&url=https%3A%2F%2Ftransit.example%2Fsub&config=http%3A%2F%2F127.0.0.1%3A38123%2Finternal%2Ftemplates%2Fabc123.ini",
				YAML: strings.Join([]string{
					"proxies:",
					"- {name: transit-de, type: ss}",
					"proxy-groups:",
					"  - name: 🇩🇪 德国节点",
					"    type: fallback",
					"    proxies:",
					"      - transit-de",
					"",
				}, "\n"),
			},
			FullBase: subconverter.PassResult{
				RequestURL: "http://localhost:25511/sub?target=clash&url=https%3A%2F%2Flanding.example%2Fsub%7Chttps%3A%2F%2Ftransit.example%2Fsub&config=http%3A%2F%2F127.0.0.1%3A38123%2Finternal%2Ftemplates%2Fabc123.ini",
				YAML: strings.Join([]string{
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
			},
		},
	}

	bundle, err := BuildStage1Artifacts(context.Background(), source, Case{
		Name: "custom-template",
		Stage1Input: service.Stage1Input{
			LandingRawText: "https://landing.example/sub",
			TransitRawText: "https://transit.example/sub",
		},
	})
	if err != nil {
		t.Fatalf("BuildStage1Artifacts() error = %v", err)
	}

	assertArtifactContains(t, bundle.Files, "stage1/output/review-summary.md", "| DE Landing | SS | chain | 🇩🇪 德国节点 |")
	assertArtifactContains(t, bundle.Files, "stage1/output/landing-discovery.url.txt", url.QueryEscape(managedTemplateArtifactURLPlaceholder))
	assertArtifactContains(t, bundle.Files, "stage1/output/landing-discovery.url.raw.txt", "abc123.ini")
	assertArtifactContains(t, bundle.Files, "stage1/output/template-source.url.txt", "https://template-source.example/config.ini")
	assertArtifactContains(t, bundle.Files, "stage1/output/template-managed.url.txt", "abc123.ini")
	assertArtifactContains(t, bundle.Files, "stage1/output/template-config.ini", "custom_proxy_group=🇩🇪 德国节点")
	assertArtifactContains(t, bundle.Files, "stage1/output/template-diagnostics.json", "missingRecognizedGroups")
	if strings.Contains(findArtifact(bundle.Files, "stage1/output/landing-discovery.url.txt").Content, "abc123.ini") {
		t.Fatalf("landing-discovery url should not expose raw managed template ID: %q", findArtifact(bundle.Files, "stage1/output/landing-discovery.url.txt").Content)
	}
	if len(bundle.Rows) != 1 || bundle.Rows[0].TargetName == nil || *bundle.Rows[0].TargetName != "🇩🇪 德国节点" {
		t.Fatalf("bundle.Rows = %#v, want default chain target 🇩🇪 德国节点", bundle.Rows)
	}
}

func TestBuildStage1Artifacts_ReportsMissingRecognizedRegionGroupAsUnavailable(t *testing.T) {
	source := &fakeConversionSource{
		result: subconverter.ThreePassResult{
			LandingDiscovery: subconverter.PassResult{
				RequestURL: "http://localhost:25500/sub?target=clash&url=https%3A%2F%2Flanding.example%2Fsub&list=true",
				YAML:       "proxies:\n- {name: HK Landing, type: ss}\n",
			},
			TransitDiscovery: subconverter.PassResult{
				RequestURL: "http://localhost:25500/sub?target=clash&url=https%3A%2F%2Ftransit.example%2Fsub",
				YAML: strings.Join([]string{
					"proxies:",
					"- {name: transit-hk, type: ss}",
					"proxy-groups:",
					"  - name: Missing HK Group",
					"    type: fallback",
					"    proxies:",
					"      - transit-hk",
					"",
				}, "\n"),
			},
			FullBase: subconverter.PassResult{
				RequestURL: "http://localhost:25500/sub?target=clash&url=https%3A%2F%2Flanding.example%2Fsub%7Chttps%3A%2F%2Ftransit.example%2Fsub",
				YAML: strings.Join([]string{
					"proxies:",
					"- {name: HK Landing, type: ss, server: hk.example.com, port: 443}",
					"- {name: transit-hk, type: ss, server: transit.example.com, port: 443}",
					"proxy-groups:",
					"  - name: Missing HK Group",
					"    type: fallback",
					"    proxies:",
					"      - transit-hk",
					"",
				}, "\n"),
			},
		},
	}

	bundle, err := BuildStage1Artifacts(context.Background(), source, Case{
		Name: "missing-region-group",
		Stage1Input: service.Stage1Input{
			LandingRawText: "https://landing.example/sub",
			TransitRawText: "https://transit.example/sub",
		},
	})
	if err == nil {
		t.Fatal("BuildStage1Artifacts() error = nil, want unavailable error")
	}
	if !subconverter.IsUnavailable(err) {
		t.Fatalf("BuildStage1Artifacts() error = %v, want subconverter unavailable", err)
	}

	assertArtifactContains(t, bundle.Files, "stage1/output/landing-discovery.url.txt", "landing.example")
	assertArtifactContains(t, bundle.Files, "stage1/output/template-diagnostics.json", "🇭🇰 香港节点")
	assertArtifactContains(t, bundle.Files, "stage1/output/full-base.yaml", "Missing HK Group")
	assertArtifactContains(t, bundle.Files, "stage1/output/stage1-convert.error.txt", "missing recognized region proxy-group")
	assertArtifactContains(t, bundle.Files, "stage1/output/stage1-convert.error.txt", "transit-discovery result")
	if _, ok := findArtifactOK(bundle.Files, "stage1/output/stage1-convert.response.json"); ok {
		t.Fatal("stage1/output/stage1-convert.response.json should be absent when Stage 1 auto-fill fails")
	}
	if len(bundle.Rows) != 0 {
		t.Fatalf("len(bundle.Rows) = %d, want 0", len(bundle.Rows))
	}
}

func stringPtr(value string) *string {
	return &value
}

func loadThreePassResult(t *testing.T, fixtureDir string) subconverter.ThreePassResult {
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

func readTextFixture(t *testing.T, filePath string) string {
	t.Helper()
	content, err := os.ReadFile(filePath)
	if err != nil {
		t.Fatalf("os.ReadFile(%q) error = %v", filePath, err)
	}
	return string(content)
}

func assertArtifactContains(t *testing.T, files []FileArtifact, relativePath string, wantSubstring string) {
	t.Helper()
	artifact := findArtifact(files, relativePath)
	if !strings.Contains(artifact.Content, wantSubstring) {
		t.Fatalf("artifact %q missing substring %q\n--- got ---\n%s", relativePath, wantSubstring, artifact.Content)
	}
}

func assertArtifactEqualsTrimmed(t *testing.T, files []FileArtifact, relativePath string, want string) {
	t.Helper()
	artifact := findArtifact(files, relativePath)
	if strings.TrimSpace(artifact.Content) != strings.TrimSpace(want) {
		t.Fatalf("artifact %q mismatch\n--- got ---\n%s\n--- want ---\n%s", relativePath, artifact.Content, want)
	}
}

func findArtifact(files []FileArtifact, relativePath string) FileArtifact {
	artifact, ok := findArtifactOK(files, relativePath)
	if !ok {
		panic("missing artifact: " + relativePath)
	}
	return artifact
}

func findArtifactOK(files []FileArtifact, relativePath string) (FileArtifact, bool) {
	for _, artifact := range files {
		if artifact.RelativePath == relativePath {
			return artifact, true
		}
	}
	return FileArtifact{}, false
}
