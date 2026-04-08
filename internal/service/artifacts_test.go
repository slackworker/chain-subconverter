package service

import (
	"encoding/json"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func TestHappyPathArtifacts_LogOutputs(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var stage1Request Stage1ConvertRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.request.json"), &stage1Request)

	var generateRequest GenerateRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.request.json"), &generateRequest)

	var expectedPayload LongURLPayload
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "long-url.payload.json"), &expectedPayload)

	expectedStage1Response := readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.response.json"))
	expectedGenerateResponse := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.response.json"))
	expectedCompleteConfig := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "complete-config.chain.yaml"))

	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "landing-discovery.yaml")),
		TransitDiscoveryYAML: readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "transit-discovery.yaml")),
		FullBaseYAML:         readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "full-base.yaml")),
	}

	stage1Response, err := BuildStage1ConvertResponse(stage1Request.Stage1Input, fixtures)
	if err != nil {
		t.Fatalf("BuildStage1ConvertResponse() error = %v", err)
	}

	generateResponse, err := BuildGenerateResponse("http://localhost:11200", generateRequest, fixtures, 0)
	if err != nil {
		t.Fatalf("BuildGenerateResponse() error = %v", err)
	}

	payload, err := DecodeLongURLPayload(generateResponse.LongURL)
	if err != nil {
		t.Fatalf("DecodeLongURLPayload() error = %v", err)
	}
	if !reflect.DeepEqual(payload, expectedPayload) {
		t.Fatalf("decoded payload mismatch: got %#v want %#v", payload, expectedPayload)
	}

	renderedConfig, err := RenderCompleteConfig(generateRequest.Stage1Input, generateRequest.Stage2Snapshot, fixtures)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	if !strings.Contains(renderedConfig, "dialer-proxy: 🇺🇸 美国节点") {
		t.Fatalf("rendered config is missing dialer-proxy:\n%s", renderedConfig)
	}
	if strings.Contains(renderedConfig, "  - name: 🇺🇸 美国节点\n    type: url-test\n    url: https://cp.cloudflare.com/generate_204\n    interval: 300\n    tolerance: 50\n    proxies:\n      - 🇺🇸 SS2022-Test-256-US\n") {
		t.Fatalf("rendered config still contains landing node in the default US proxy-group")
	}

	if got := mustMarshalIndented(t, stage1Response); strings.TrimSpace(got) != strings.TrimSpace(expectedStage1Response) {
		t.Fatalf("stage1-convert.response.json mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, expectedStage1Response)
	}
	if got := mustMarshalIndented(t, generateResponse); strings.TrimSpace(got) != strings.TrimSpace(expectedGenerateResponse) {
		t.Fatalf("generate.response.json mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, expectedGenerateResponse)
	}
	if strings.TrimSpace(renderedConfig) != strings.TrimSpace(expectedCompleteConfig) {
		t.Fatalf("complete-config.chain.yaml mismatch:\n--- got ---\n%s\n--- want ---\n%s", renderedConfig, expectedCompleteConfig)
	}
}

func TestValidateGenerateSnapshot_RejectsRowsetMismatch(t *testing.T) {
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(Stage1Input{}, Stage2Snapshot{
		Rows: []Stage2Row{},
	}, fixtures)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want rowset mismatch")
	}
	if !strings.Contains(err.Error(), "stage2 rowset size mismatch") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_RejectsTargetForNoneMode(t *testing.T) {
	targetName := "relay.example.com:80"
	fixtures := singleLandingFixture("HK Landing", "ss", "")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "HK Landing",
					Mode:            "none",
					TargetName:      &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want targetName validation")
	}
	if !strings.Contains(err.Error(), "targetName must be empty") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_RejectsChainForVLESSReality(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Reality", "vless-reality", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "HK Reality",
					Mode:            "chain",
					TargetName:      &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want chain restriction")
	}
	if !strings.Contains(err.Error(), "does not allow chain mode") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestRenderCompleteConfig_PortForwardRewritesServerAndPort(t *testing.T) {
	targetName := "relay.example.com:80"
	fixtures := singleLandingFixture("HK Landing", "ss", "")

	rendered, err := RenderCompleteConfig(
		Stage1Input{
			AdvancedOptions: AdvancedOptions{
				EnablePortForward: true,
			},
			ForwardRelayRawText: targetName,
		},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "HK Landing",
					Mode:            "port_forward",
					TargetName:      &targetName,
				},
			},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	if !strings.Contains(rendered, "server: relay.example.com, port: 80") {
		t.Fatalf("rendered config mismatch:\n%s", rendered)
	}
}

func TestRenderCompleteConfig_NoneModeRemovesDialerProxy(t *testing.T) {
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: HK Landing, type: ss}\n",
		TransitDiscoveryYAML: "proxies:\n",
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: HK Landing, type: ss, server: landing.example.com, port: 443, dialer-proxy: transit-a}",
			"proxy-groups:",
			"  - name: 🇭🇰 香港节点",
			"    type: url-test",
			"    proxies:",
			"      - HK Landing",
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
	}

	rendered, err := RenderCompleteConfig(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "HK Landing",
					Mode:            "none",
				},
			},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	if strings.Contains(rendered, "dialer-proxy") {
		t.Fatalf("rendered config should not contain dialer-proxy:\n%s", rendered)
	}
	if strings.Contains(rendered, "- HK Landing") {
		t.Fatalf("rendered config should remove landing node from default region groups:\n%s", rendered)
	}
	if !strings.Contains(rendered, "server: landing.example.com") {
		t.Fatalf("rendered config should preserve existing server field:\n%s", rendered)
	}
}

func mustMarshalIndented(t *testing.T, value any) string {
	t.Helper()

	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("json.MarshalIndent() error = %v", err)
	}

	return string(data)
}
