package review

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

type fakeConversionSource struct {
	result subconverter.ThreePassResult
	err    error
}

func (source *fakeConversionSource) Convert(_ context.Context, _ subconverter.Request) (subconverter.ThreePassResult, error) {
	return source.result, source.err
}

func TestBuildDefaultArtifacts_HappyPath(t *testing.T) {
	testCase, err := LoadScenario(filepath.Join("testdata", "3pass-ss2022-test-subscription"))
	if err != nil {
		t.Fatalf("LoadScenario() error = %v", err)
	}

	fixtureDir := filepath.Join("testdata", "3pass-ss2022-test-subscription")
	stage1Bundle, err := BuildStage1Artifacts(context.Background(), &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}, testCase)
	if err != nil {
		t.Fatalf("BuildStage1Artifacts() error = %v", err)
	}

	assertArtifactContains(t, stage1Bundle.Files, "stage1/output/review-summary.md", "🇺🇸 SS2022-Test-256-US => chain => 🇺🇸 美国节点")
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
