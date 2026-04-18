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

	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/review-summary.md", "🇺🇸 SS2022-Test-256-US => chain => 🇺🇸 美国节点")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/full-base.url.raw.txt", "http://localhost:25500/sub?")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/template-diagnostics.json", "recognizedRegionGroups")
	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/autofill-pairs.txt", "🇺🇸 SS2022-Test-256-US => chain => 🇺🇸 美国节点")
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
	assertArtifactContains(t, stage2Bundle.Files, "stage2/output/generate.response.json", "http://localhost:11200/subscription?data=")
	assertArtifactContains(t, stage2Bundle.Files, "stage2/output/complete-config.chain.yaml", "dialer-proxy: 🇺🇸 美国节点")
	assertArtifactEqualsTrimmed(t, stage2Bundle.Files, "stage2/output/complete-config.chain.yaml", readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "complete-config.chain.yaml")))
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
				RequestURL: "http://localhost:25511/sub?target=clash&url=https%3A%2F%2Ftransit.example%2Fsub&list=true&config=http%3A%2F%2F127.0.0.1%3A38123%2Finternal%2Ftemplates%2Fabc123.ini",
				YAML:       "proxies:\n- {name: transit-de, type: ss}\n",
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

	assertArtifactContains(t, bundle.Files, "stage1/output/review-summary.md", "DE Landing => chain => 🇩🇪 德国节点")
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

func TestBuildStage1Artifacts_PreservesRawArtifactsOnStage1Failure(t *testing.T) {
	source := &fakeConversionSource{
		result: subconverter.ThreePassResult{
			LandingDiscovery: subconverter.PassResult{
				RequestURL: "http://localhost:25500/sub?target=clash&url=https%3A%2F%2Flanding.example%2Fsub&list=true",
				YAML:       "proxies:\n- {name: HK Landing, type: ss}\n",
			},
			TransitDiscovery: subconverter.PassResult{
				RequestURL: "http://localhost:25500/sub?target=clash&url=https%3A%2F%2Ftransit.example%2Fsub&list=true",
				YAML:       "proxies:\n- {name: transit-hk, type: ss}\n",
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
		t.Fatal("BuildStage1Artifacts() error = nil, want failure")
	}

	assertArtifactContains(t, bundle.Files, "stage1/output/landing-discovery.url.txt", "landing.example")
	assertArtifactContains(t, bundle.Files, "stage1/output/template-diagnostics.json", "🇭🇰 香港节点")
	assertArtifactContains(t, bundle.Files, "stage1/output/full-base.yaml", "Missing HK Group")
	assertArtifactContains(t, bundle.Files, "stage1/output/stage1-convert.error.txt", "missing recognized region proxy-group")
	if _, ok := findArtifactOK(bundle.Files, "stage1/output/stage1-convert.response.json"); ok {
		t.Fatal("stage1/output/stage1-convert.response.json should be absent when stage1 build fails")
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
