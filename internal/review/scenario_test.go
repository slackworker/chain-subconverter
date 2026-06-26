package review

import (
	"os"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/testfixtures"
)

func TestLoadCase_DefaultExample(t *testing.T) {
	testCase, err := LoadCase(filepath.Join("testdata", "3pass-ss2022-test-subscription"))
	if err != nil {
		t.Fatalf("LoadCase() error = %v", err)
	}

	if testCase.Name != "3pass-ss2022-test-subscription" {
		t.Fatalf("testCase.Name = %q, want %q", testCase.Name, "3pass-ss2022-test-subscription")
	}
	if testCase.Stage1Input.LandingRawText == "" {
		t.Fatal("LandingRawText should not be empty")
	}
	if testCase.Stage1Input.TransitRawText == "" {
		t.Fatal("TransitRawText should not be empty")
	}
	if len(testCase.Stage1Input.ForwardRelayItems) != 0 {
		t.Fatalf("ForwardRelayItems = %v, want empty", testCase.Stage1Input.ForwardRelayItems)
	}
	if !hasBoolValue(testCase.Stage1Input.AdvancedOptions.Emoji, true) {
		t.Fatal("Emoji default should be true")
	}
	if !hasBoolValue(testCase.Stage1Input.AdvancedOptions.UDP, true) {
		t.Fatal("UDP default should be true")
	}
	if testCase.Stage1Input.AdvancedOptions.SkipCertVerify != nil {
		t.Fatal("SkipCertVerify placeholder should stay omitted")
	}
	if !hasStringValue(testCase.Stage1Input.AdvancedOptions.Config, "https://raw.githubusercontent.com/slackworker/Aethersailor-Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini") {
		t.Fatalf("Config = %v, want tracked default template URL", testCase.Stage1Input.AdvancedOptions.Config)
	}
	if testCase.Stage1Input.AdvancedOptions.Include != nil {
		t.Fatalf("Include = %v, want omitted placeholder", testCase.Stage1Input.AdvancedOptions.Include)
	}
	if testCase.Stage1Input.AdvancedOptions.Exclude != nil {
		t.Fatalf("Exclude = %v, want omitted placeholder", testCase.Stage1Input.AdvancedOptions.Exclude)
	}
	if len(testCase.Stage2Input.Rows) == 0 {
		t.Fatal("Stage2Input.Rows should not be empty")
	}
}

func TestLoadStage1Case_DoesNotRequireStage2Input(t *testing.T) {
	caseDir := t.TempDir()
	stage1InputDir := filepath.Join(caseDir, "stage1", "input")
	if err := os.MkdirAll(stage1InputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(stage1 input) error = %v", err)
	}

	files := map[string]string{
		testfixtures.LandingFileName:         "landing-node",
		testfixtures.TransitFileName:         "transit-node",
		testfixtures.ForwardRelaysFileName:   "",
		testfixtures.AdvancedOptionsFileName: "emoji: true\nudp: true\n",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(stage1InputDir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("os.WriteFile(%q) error = %v", name, err)
		}
	}

	testCase, err := LoadStage1Case(caseDir)
	if err != nil {
		t.Fatalf("LoadStage1Case() error = %v", err)
	}

	if testCase.Stage1Input.LandingRawText != "landing-node" {
		t.Fatalf("LandingRawText = %q, want %q", testCase.Stage1Input.LandingRawText, "landing-node")
	}
	if len(testCase.Stage2Input.Rows) != 0 {
		t.Fatalf("Stage2Input.Rows length = %d, want 0", len(testCase.Stage2Input.Rows))
	}
}

func TestLoadStage1Case_PrefersCanonicalScenarioForTrackedFixtureDirectory(t *testing.T) {
	repoRoot := t.TempDir()
	scenarioID := "tracked-canonical-stage1"
	scenarioDir, canonicalFile := writeTrackedCanonicalFixture(t, repoRoot, scenarioID)

	expectedScenario, err := testfixtures.LoadStage1Scenario(canonicalFile)
	if err != nil {
		t.Fatalf("LoadStage1Scenario() error = %v", err)
	}
	expected := toServiceStage1Input(expectedScenario.Stage1Input.ToReviewStage1Input())

	testCase, err := LoadStage1Case(scenarioDir)
	if err != nil {
		t.Fatalf("LoadStage1Case() error = %v", err)
	}

	if !reflect.DeepEqual(testCase.Stage1Input, expected) {
		t.Fatalf("Stage1Input = %#v, want %#v", testCase.Stage1Input, expected)
	}
	if testCase.Stage1Input.LandingRawText == "file-landing" {
		t.Fatal("LoadStage1Case() should ignore tracked stage1/input files when canonical scenario exists")
	}
}

func TestLoadStage1Case_FallsBackToFilesWhenTrackedCanonicalScenarioMissing(t *testing.T) {
	repoRoot := t.TempDir()
	scenarioDir := filepath.Join(repoRoot, "internal", "review", "testdata", "tracked-missing-canonical")
	stage1InputDir := filepath.Join(scenarioDir, "stage1", "input")
	if err := os.MkdirAll(stage1InputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(stage1 input) error = %v", err)
	}

	files := map[string]string{
		testfixtures.LandingFileName:         "file-landing",
		testfixtures.TransitFileName:         "file-transit",
		testfixtures.ForwardRelaysFileName:   "file-relay:7443",
		testfixtures.AdvancedOptionsFileName: "emoji: true\nudp: true\nconfig: https://files.example/config.ini\n",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(stage1InputDir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("os.WriteFile(%q) error = %v", name, err)
		}
	}

	testCase, err := LoadStage1Case(scenarioDir)
	if err != nil {
		t.Fatalf("LoadStage1Case() error = %v", err)
	}

	if testCase.Stage1Input.LandingRawText != "file-landing" {
		t.Fatalf("LandingRawText = %q, want %q", testCase.Stage1Input.LandingRawText, "file-landing")
	}
	if !hasStringListValue(testCase.Stage1Input.ForwardRelayItems, []string{"file-relay:7443"}) {
		t.Fatalf("ForwardRelayItems = %v, want file fallback values", testCase.Stage1Input.ForwardRelayItems)
	}
}

func TestLoadStage1Case_FileFallbackMatchesRenderedCanonicalReviewInput(t *testing.T) {
	tests := []struct {
		name         string
		scenarioFile string
	}{
		{
			name:         "dual landing",
			scenarioFile: filepath.Join("..", "..", "testdata", "canonical-scenarios", "dual-landing-chain-port-forward.stage1.json"),
		},
		{
			name:         "minimal 3pass",
			scenarioFile: filepath.Join("..", "..", "testdata", "canonical-scenarios", "3pass-ss2022-test-subscription.stage1.json"),
		},
	}

	for _, test := range tests {
		t.Run(test.name, func(t *testing.T) {
			scenario, err := testfixtures.LoadStage1Scenario(test.scenarioFile)
			if err != nil {
				t.Fatalf("LoadStage1Scenario() error = %v", err)
			}
			renderedFiles, err := testfixtures.RenderReviewStage1InputFiles(scenario.Stage1Input)
			if err != nil {
				t.Fatalf("RenderReviewStage1InputFiles() error = %v", err)
			}

			caseDir := t.TempDir()
			stage1InputDir := filepath.Join(caseDir, "stage1", "input")
			if err := os.MkdirAll(stage1InputDir, 0o755); err != nil {
				t.Fatalf("os.MkdirAll(stage1 input) error = %v", err)
			}
			for _, renderedFile := range renderedFiles {
				if err := os.WriteFile(filepath.Join(stage1InputDir, renderedFile.Name), []byte(renderedFile.Content), 0o644); err != nil {
					t.Fatalf("os.WriteFile(%q) error = %v", renderedFile.Name, err)
				}
			}

			loadedCase, err := LoadStage1Case(caseDir)
			if err != nil {
				t.Fatalf("LoadStage1Case() error = %v", err)
			}

			expected := toServiceStage1Input(scenario.Stage1Input.ToReviewStage1Input())
			if !reflect.DeepEqual(loadedCase.Stage1Input, expected) {
				t.Fatalf("Stage1Input = %#v, want %#v", loadedCase.Stage1Input, expected)
			}
		})
	}
}

func TestLoadStage1Case_TreatsDollarSyntaxAsLiteralInput(t *testing.T) {
	caseDir := t.TempDir()
	stage1InputDir := filepath.Join(caseDir, "stage1", "input")
	if err := os.MkdirAll(stage1InputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(stage1 input) error = %v", err)
	}

	files := map[string]string{
		testfixtures.LandingFileName:       "literal-${LANDING}",
		testfixtures.TransitFileName:       "https://example.com/sub?token=$TOKEN",
		testfixtures.ForwardRelaysFileName: "",
		testfixtures.AdvancedOptionsFileName: strings.TrimSpace(`
config: ${CONFIG_PATH}
include: "(?i)$HK"
exclude: "^${BLOCKED}$"
`) + "\n",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(stage1InputDir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("os.WriteFile(%q) error = %v", name, err)
		}
	}

	t.Setenv("LANDING", "expanded-landing")
	t.Setenv("TOKEN", "expanded-token")
	t.Setenv("CONFIG_PATH", "expanded-config")
	t.Setenv("BLOCKED", "expanded-blocked")

	testCase, err := LoadStage1Case(caseDir)
	if err != nil {
		t.Fatalf("LoadStage1Case() error = %v", err)
	}

	if testCase.Stage1Input.LandingRawText != "literal-${LANDING}" {
		t.Fatalf("LandingRawText = %q, want literal placeholder", testCase.Stage1Input.LandingRawText)
	}
	if testCase.Stage1Input.TransitRawText != "https://example.com/sub?token=$TOKEN" {
		t.Fatalf("TransitRawText = %q, want literal placeholder", testCase.Stage1Input.TransitRawText)
	}
	if !hasStringValue(testCase.Stage1Input.AdvancedOptions.Config, "${CONFIG_PATH}") {
		t.Fatalf("AdvancedOptions.Config = %v, want literal placeholder", testCase.Stage1Input.AdvancedOptions.Config)
	}
	if !hasStringListValue(testCase.Stage1Input.AdvancedOptions.Include, []string{"(?i)$HK"}) {
		t.Fatalf("AdvancedOptions.Include = %v, want literal placeholder", testCase.Stage1Input.AdvancedOptions.Include)
	}
	if !hasStringListValue(testCase.Stage1Input.AdvancedOptions.Exclude, []string{"^${BLOCKED}$"}) {
		t.Fatalf("AdvancedOptions.Exclude = %v, want literal placeholder", testCase.Stage1Input.AdvancedOptions.Exclude)
	}
}

func TestLoadStage1Case_TreatsBlankAdvancedOptionPlaceholdersAsOmittedValues(t *testing.T) {
	caseDir := t.TempDir()
	stage1InputDir := filepath.Join(caseDir, "stage1", "input")
	if err := os.MkdirAll(stage1InputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(stage1 input) error = %v", err)
	}

	files := map[string]string{
		testfixtures.LandingFileName:       "landing-node",
		testfixtures.TransitFileName:       "transit-node",
		testfixtures.ForwardRelaysFileName: "",
		testfixtures.AdvancedOptionsFileName: strings.TrimSpace(`
emoji: true
udp: true
skipCertVerify:
config: ""
include: ""
exclude: ""
`) + "\n",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(stage1InputDir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("os.WriteFile(%q) error = %v", name, err)
		}
	}

	testCase, err := LoadStage1Case(caseDir)
	if err != nil {
		t.Fatalf("LoadStage1Case() error = %v", err)
	}

	if testCase.Stage1Input.AdvancedOptions.SkipCertVerify != nil {
		t.Fatal("SkipCertVerify placeholder should stay omitted")
	}
	if testCase.Stage1Input.AdvancedOptions.Config != nil {
		t.Fatalf("Config = %v, want omitted string", testCase.Stage1Input.AdvancedOptions.Config)
	}
	if testCase.Stage1Input.AdvancedOptions.Include != nil {
		t.Fatalf("Include = %v, want omitted string", testCase.Stage1Input.AdvancedOptions.Include)
	}
	if testCase.Stage1Input.AdvancedOptions.Exclude != nil {
		t.Fatalf("Exclude = %v, want omitted string", testCase.Stage1Input.AdvancedOptions.Exclude)
	}
}

func TestLoadCase_PrefersWrappedStage2SnapshotEvenWhenRowsEmpty(t *testing.T) {
	caseDir := t.TempDir()
	stage1InputDir := filepath.Join(caseDir, "stage1", "input")
	stage2InputDir := filepath.Join(caseDir, "stage2", "input")
	if err := os.MkdirAll(stage1InputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(stage1 input) error = %v", err)
	}
	if err := os.MkdirAll(stage2InputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(stage2 input) error = %v", err)
	}

	files := map[string]string{
		filepath.Join(stage1InputDir, testfixtures.LandingFileName):         "landing-node",
		filepath.Join(stage1InputDir, testfixtures.TransitFileName):         "transit-node",
		filepath.Join(stage1InputDir, testfixtures.ForwardRelaysFileName):   "",
		filepath.Join(stage1InputDir, testfixtures.AdvancedOptionsFileName): "emoji: true\nudp: true\n",
		filepath.Join(stage2InputDir, Stage2SnapshotFileName): strings.TrimSpace(`
{
  "stage2Snapshot": {
    "rows": []
  },
  "rows": [
    {
      "landingNodeName": "should-not-be-used",
      "mode": "chain",
      "targetName": "unexpected-target"
    }
  ]
}
`) + "\n",
	}
	for path, content := range files {
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("os.WriteFile(%q) error = %v", path, err)
		}
	}

	testCase, err := LoadCase(caseDir)
	if err != nil {
		t.Fatalf("LoadCase() error = %v", err)
	}

	if len(testCase.Stage2Input.Rows) != 0 {
		t.Fatalf("Stage2Input.Rows length = %d, want 0", len(testCase.Stage2Input.Rows))
	}
}

func TestLoadCase_PrefersCanonicalStage1ButKeepsTrackedStage2Snapshot(t *testing.T) {
	repoRoot := t.TempDir()
	scenarioID := "tracked-canonical-loadcase"
	scenarioDir, canonicalFile := writeTrackedCanonicalFixture(t, repoRoot, scenarioID)
	stage2InputDir := filepath.Join(scenarioDir, "stage2", "input")
	if err := os.MkdirAll(stage2InputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(stage2 input) error = %v", err)
	}
	if err := os.WriteFile(
		filepath.Join(stage2InputDir, Stage2SnapshotFileName),
		[]byte(strings.TrimSpace(`
{
  "rows": [
    {
      "landingNodeName": "tracked-row",
      "mode": "chain",
      "targetName": "tracked-target"
    }
  ]
}
`)+"\n"),
		0o644,
	); err != nil {
		t.Fatalf("os.WriteFile(stage2 snapshot) error = %v", err)
	}

	expectedScenario, err := testfixtures.LoadStage1Scenario(canonicalFile)
	if err != nil {
		t.Fatalf("LoadStage1Scenario() error = %v", err)
	}
	expected := toServiceStage1Input(expectedScenario.Stage1Input.ToReviewStage1Input())

	testCase, err := LoadCase(scenarioDir)
	if err != nil {
		t.Fatalf("LoadCase() error = %v", err)
	}

	if !reflect.DeepEqual(testCase.Stage1Input, expected) {
		t.Fatalf("Stage1Input = %#v, want %#v", testCase.Stage1Input, expected)
	}
	if len(testCase.Stage2Input.Rows) != 1 {
		t.Fatalf("Stage2Input.Rows length = %d, want 1", len(testCase.Stage2Input.Rows))
	}
	if testCase.Stage2Input.Rows[0].LandingNodeName != "tracked-row" {
		t.Fatalf("Stage2Input.Rows[0].LandingNodeName = %q, want %q", testCase.Stage2Input.Rows[0].LandingNodeName, "tracked-row")
	}
}

func hasBoolValue(value *bool, want bool) bool {
	return value != nil && *value == want
}

func hasStringValue(value *string, want string) bool {
	return value != nil && *value == want
}

func hasStringListValue(value []string, want []string) bool {
	if len(value) != len(want) {
		return false
	}
	for index := range value {
		if value[index] != want[index] {
			return false
		}
	}
	return true
}

func writeTrackedCanonicalFixture(t *testing.T, repoRoot string, scenarioID string) (string, string) {
	t.Helper()

	scenarioDir := filepath.Join(repoRoot, "internal", "review", "testdata", scenarioID)
	stage1InputDir := filepath.Join(scenarioDir, "stage1", "input")
	if err := os.MkdirAll(stage1InputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(stage1 input) error = %v", err)
	}

	trackedFiles := map[string]string{
		testfixtures.LandingFileName:       "file-landing",
		testfixtures.TransitFileName:       "file-transit",
		testfixtures.ForwardRelaysFileName: "file-relay:7443",
		testfixtures.AdvancedOptionsFileName: strings.TrimSpace(`
emoji: false
udp: false
config: https://files.example/tracked.ini
`) + "\n",
	}
	for name, content := range trackedFiles {
		if err := os.WriteFile(filepath.Join(stage1InputDir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("os.WriteFile(%q) error = %v", name, err)
		}
	}

	canonicalDir := filepath.Join(repoRoot, "testdata", "canonical-scenarios")
	if err := os.MkdirAll(canonicalDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(canonical dir) error = %v", err)
	}
	canonicalFile := filepath.Join(canonicalDir, scenarioID+".stage1.json")
	canonicalContent := strings.TrimSpace(`
{
  "schemaVersion": 1,
  "scenarioID": "`+scenarioID+`",
  "stage1Input": {
    "landingItems": ["landing-a"],
    "manualSocks5Items": [
      {
        "name": "Manual-SOCKS5-Test",
        "server": "manual-socks.example.test",
        "port": 1080,
        "generatedURI": "tg://socks?server=manual-socks.example.test&port=1080&remarks=Manual-SOCKS5-Test"
      }
    ],
    "transitItems": ["transit-a"],
    "forwardRelayItems": ["relay-a:7443"],
    "advancedOptions": {
      "emoji": true,
      "udp": true,
      "skipCertVerify": false,
      "config": "https://canonical.example/config.ini",
      "include": ["HK"],
      "exclude": ["Expired"]
    }
  }
}
`) + "\n"
	if err := os.WriteFile(canonicalFile, []byte(canonicalContent), 0o644); err != nil {
		t.Fatalf("os.WriteFile(canonical) error = %v", err)
	}

	return scenarioDir, canonicalFile
}
