package review

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadScenario_DefaultExample(t *testing.T) {
	scenario, err := LoadScenario(filepath.Join("testdata", "3pass-ss2022-test-subscription"))
	if err != nil {
		t.Fatalf("LoadScenario() error = %v", err)
	}

	if scenario.Name != "3pass-ss2022-test-subscription" {
		t.Fatalf("scenario.Name = %q, want %q", scenario.Name, "3pass-ss2022-test-subscription")
	}
	if scenario.Stage1Input.LandingRawText == "" {
		t.Fatal("LandingRawText should not be empty")
	}
	if scenario.Stage1Input.TransitRawText == "" {
		t.Fatal("TransitRawText should not be empty")
	}
	if scenario.Stage1Input.ForwardRelayRawText != "" {
		t.Fatalf("ForwardRelayRawText = %q, want empty", scenario.Stage1Input.ForwardRelayRawText)
	}
	if !hasBoolValue(scenario.Stage1Input.AdvancedOptions.Emoji, true) {
		t.Fatal("Emoji default should be true")
	}
	if !hasBoolValue(scenario.Stage1Input.AdvancedOptions.UDP, true) {
		t.Fatal("UDP default should be true")
	}
	if scenario.Stage1Input.AdvancedOptions.SkipCertVerify != nil {
		t.Fatal("SkipCertVerify placeholder should stay omitted")
	}
	if scenario.Stage1Input.AdvancedOptions.Config != nil {
		t.Fatalf("Config = %v, want omitted placeholder", scenario.Stage1Input.AdvancedOptions.Config)
	}
	if scenario.Stage1Input.AdvancedOptions.Include != nil {
		t.Fatalf("Include = %v, want omitted placeholder", scenario.Stage1Input.AdvancedOptions.Include)
	}
	if scenario.Stage1Input.AdvancedOptions.Exclude != nil {
		t.Fatalf("Exclude = %v, want omitted placeholder", scenario.Stage1Input.AdvancedOptions.Exclude)
	}
	if scenario.Stage1Input.AdvancedOptions.EnablePortForward {
		t.Fatal("EnablePortForward default should be false")
	}
	if len(scenario.Stage2Input.Rows) == 0 {
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
		LandingFileName:         "landing-node",
		TransitFileName:         "transit-node",
		ForwardRelaysFileName:   "",
		AdvancedOptionsFileName: "emoji: true\nudp: true\nenablePortForward: false\n",
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

func TestLoadStage1Case_TreatsDollarSyntaxAsLiteralInput(t *testing.T) {
	caseDir := t.TempDir()
	stage1InputDir := filepath.Join(caseDir, "stage1", "input")
	if err := os.MkdirAll(stage1InputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(stage1 input) error = %v", err)
	}

	files := map[string]string{
		LandingFileName:       "literal-${LANDING}",
		TransitFileName:       "https://example.com/sub?token=$TOKEN",
		ForwardRelaysFileName: "",
		AdvancedOptionsFileName: strings.TrimSpace(`
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
	if !hasStringValue(testCase.Stage1Input.AdvancedOptions.Include, "(?i)$HK") {
		t.Fatalf("AdvancedOptions.Include = %v, want literal placeholder", testCase.Stage1Input.AdvancedOptions.Include)
	}
	if !hasStringValue(testCase.Stage1Input.AdvancedOptions.Exclude, "^${BLOCKED}$") {
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
		LandingFileName:       "landing-node",
		TransitFileName:       "transit-node",
		ForwardRelaysFileName: "",
		AdvancedOptionsFileName: strings.TrimSpace(`
emoji: true
udp: true
skipCertVerify:
config: ""
include: ""
exclude: ""
enablePortForward: false
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
		filepath.Join(stage1InputDir, LandingFileName):         "landing-node",
		filepath.Join(stage1InputDir, TransitFileName):         "transit-node",
		filepath.Join(stage1InputDir, ForwardRelaysFileName):   "",
		filepath.Join(stage1InputDir, AdvancedOptionsFileName): "emoji: true\nudp: true\nenablePortForward: false\n",
		filepath.Join(stage2InputDir, legacyStage2SnapshotFileName): strings.TrimSpace(`
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

func hasBoolValue(value *bool, want bool) bool {
	return value != nil && *value == want
}

func hasStringValue(value *string, want string) bool {
	return value != nil && *value == want
}
