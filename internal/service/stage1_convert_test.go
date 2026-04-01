package service

import (
	"encoding/json"
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
	readJSONFixture(t, filepath.Join(fixtureDir, "stage1-convert.request.json"), &request)

	var expectedSnapshot Stage2SnapshotFixture
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2-snapshot.default.json"), &expectedSnapshot)

	stage2Init, err := BuildStage2Init(request.Stage1Input, ConversionFixtures{
		LandingDiscoveryYAML: readTextFixture(t, filepath.Join(fixtureDir, "landing-discovery.yaml")),
		TransitDiscoveryYAML: readTextFixture(t, filepath.Join(fixtureDir, "transit-discovery.yaml")),
		FullBaseYAML:         readTextFixture(t, filepath.Join(fixtureDir, "full-base.yaml")),
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

	if !reflect.DeepEqual(stage2Init.Rows, expectedSnapshot.Stage2Snapshot.Rows) {
		t.Fatalf("Rows mismatch: got %#v want %#v", stage2Init.Rows, expectedSnapshot.Stage2Snapshot.Rows)
	}

	if !hasChainTarget(stage2Init.ChainTargets, "🇺🇸 美国节点", "proxy-groups") {
		t.Fatalf("expected chain target %q with kind %q, got %v", "🇺🇸 美国节点", "proxy-groups", stage2Init.ChainTargets)
	}
}

func TestBuildStage2Init_DoesNotFallbackToPortForwardWhenChainAutoDetectFails(t *testing.T) {
	stage2Init, err := BuildStage2Init(
		Stage1Input{
			AdvancedOptions: AdvancedOptions{
				EnablePortForward: true,
			},
			ForwardRelayRawText: "relay.example.com:443",
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
			ForwardRelayRawText: "relay.example.com:443",
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
		"testdata",
		"subconverter",
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
	return normalizeFixtureNewlines(string(data))
}

func hasChainTarget(targets []ChainTarget, name string, kind string) bool {
	for _, target := range targets {
		if target.Name == name && target.Kind == kind {
			return true
		}
	}
	return false
}

func normalizeFixtureNewlines(value string) string {
	return strings.ReplaceAll(value, "\r\n", "\n")
}
