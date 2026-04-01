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
	readJSONFixture(t, filepath.Join(fixtureDir, "stage1-convert.request.json"), &stage1Request)

	var generateRequest GenerateRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "generate.request.json"), &generateRequest)

	var expectedPayload LongURLPayload
	readJSONFixture(t, filepath.Join(fixtureDir, "long-url.payload.json"), &expectedPayload)

	expectedStage1Response := readTextFixture(t, filepath.Join(fixtureDir, "stage1-convert.response.json"))
	expectedGenerateResponse := readTextFixture(t, filepath.Join(fixtureDir, "generate.response.json"))
	expectedCompleteConfig := readTextFixture(t, filepath.Join(fixtureDir, "complete-config.chain.yaml"))

	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: readTextFixture(t, filepath.Join(fixtureDir, "landing-discovery.yaml")),
		TransitDiscoveryYAML: readTextFixture(t, filepath.Join(fixtureDir, "transit-discovery.yaml")),
		FullBaseYAML:         readTextFixture(t, filepath.Join(fixtureDir, "full-base.yaml")),
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

func mustMarshalIndented(t *testing.T, value any) string {
	t.Helper()

	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		t.Fatalf("json.MarshalIndent() error = %v", err)
	}

	return string(data)
}
