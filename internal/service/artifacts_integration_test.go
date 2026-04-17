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

	payload, err := DecodeLongURLPayload(generateResponse.LongURL, InputLimits{})
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

func TestDecodeLongURLPayload_RejectsDecodedStage1InputOverLimit(t *testing.T) {
	longURL, err := EncodeLongURL(
		"http://localhost:11200",
		BuildLongURLPayload(
			Stage1Input{LandingRawText: strings.Repeat("a", 16)},
			Stage2Snapshot{},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	_, err = DecodeLongURLPayload(longURL, InputLimits{MaxInputSize: 8})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "validate stage1 input limits") {
		t.Fatalf("error mismatch: got %v", err)
	}
}

func TestDecodeLongURLPayload_RejectsUnsupportedMode(t *testing.T) {
	longURL, err := EncodeLongURL(
		"http://localhost:11200",
		BuildLongURLPayload(
			Stage1Input{},
			Stage2Snapshot{
				Rows: []Stage2Row{{
					LandingNodeName: "HK 01",
					Mode:            "unsupported",
				}},
			},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	_, err = DecodeLongURLPayload(longURL, InputLimits{})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "validate long URL payload schema: unsupported mode") {
		t.Fatalf("error mismatch: got %v", err)
	}
}

func TestDecodeLongURLPayload_RejectsTargetNameForNoneMode(t *testing.T) {
	targetName := "HK Relay"
	longURL, err := EncodeLongURL(
		"http://localhost:11200",
		BuildLongURLPayload(
			Stage1Input{},
			Stage2Snapshot{
				Rows: []Stage2Row{{
					LandingNodeName: "HK 01",
					Mode:            "none",
					TargetName:      &targetName,
				}},
			},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	_, err = DecodeLongURLPayload(longURL, InputLimits{})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "validate long URL payload schema: targetName must be empty") {
		t.Fatalf("error mismatch: got %v", err)
	}
}

func TestMarshalCanonicalLongURLPayload_UsesSchemaFieldOrder(t *testing.T) {
	emoji := true
	udp := false
	skipCertVerify := true
	config := "  mixed-port: 7890  "
	include := []string{"HK"}
	exclude := []string{"US"}
	targetName := "HK Relay"

	payload := LongURLPayload{
		V: 1,
		Stage1Input: Stage1Input{
			LandingRawText:    "landing",
			TransitRawText:    "transit",
			ForwardRelayItems: []string{"forward"},
			AdvancedOptions: AdvancedOptions{
				Emoji:             &emoji,
				UDP:               &udp,
				SkipCertVerify:    &skipCertVerify,
				Config:            &config,
				Include:           include,
				Exclude:           exclude,
				EnablePortForward: true,
			},
		},
		Stage2Snapshot: Stage2Snapshot{
			Rows: []Stage2Row{{
				LandingNodeName: "HK 01",
				Mode:            "chain",
				TargetName:      &targetName,
			}},
		},
	}

	got, err := marshalCanonicalLongURLPayload(payload)
	if err != nil {
		t.Fatalf("marshalCanonicalLongURLPayload() error = %v", err)
	}

	want := `{"stage1Input":{"advancedOptions":{"config":"  mixed-port: 7890  ","emoji":true,"enablePortForward":true,"exclude":["US"],"include":["HK"],"skipCertVerify":true,"udp":false},"forwardRelayItems":["forward"],"landingRawText":"landing","transitRawText":"transit"},"stage2Snapshot":{"rows":[{"landingNodeName":"HK 01","mode":"chain","targetName":"HK Relay"}]},"v":1}`
	if string(got) != want {
		t.Fatalf("canonical payload mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, want)
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
