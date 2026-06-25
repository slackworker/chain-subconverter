package service

import (
	"encoding/json"
	"net/url"
	"path/filepath"
	"reflect"
	"strings"
	"testing"
)

func stage1InputWithTemplate(input Stage1Input) Stage1Input {
	templateURL := "https://templates.example.com/default.ini"
	input.AdvancedOptions.Config = &templateURL
	return input
}

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

	var expectedStage1 Stage1ConvertResponse
	if err := json.Unmarshal([]byte(expectedStage1Response), &expectedStage1); err != nil {
		t.Fatalf("decode expected stage1 response: %v", err)
	}
	if !reflect.DeepEqual(normalizeStage1ConvertResponseForContract(stage1Response), normalizeStage1ConvertResponseForContract(expectedStage1)) {
		t.Fatalf("stage1-convert.response.json mismatch:\n--- got ---\n%s\n--- want ---\n%s", mustMarshalIndented(t, stage1Response), mustMarshalIndented(t, expectedStage1))
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
			stage1InputWithTemplate(Stage1Input{LandingRawText: strings.Repeat("a", 16)}),
			Stage2Snapshot{},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}
	_, err = DecodeLongURLPayload(longURL, InputLimits{
		MaxRequestURLLength: 80,
		SubconverterBaseURL: "http://subconverter:25500/sub?",
	})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "validate stage1 input limits") {
		t.Fatalf("error mismatch: got %v", err)
	}
}

func TestDecodeLongURLPayload_RejectsMissingTemplateURL(t *testing.T) {
	longURL, err := EncodeLongURL(
		"http://localhost:11200",
		BuildLongURLPayload(Stage1Input{}, Stage2Snapshot{}),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	_, err = DecodeLongURLPayload(longURL, InputLimits{})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "validate long URL payload schema: advancedOptions.config must not be empty") {
		t.Fatalf("error mismatch: got %v", err)
	}
}

func TestDecodeLongURLPayload_RejectsUnsupportedMode(t *testing.T) {
	longURL, err := EncodeLongURL(
		"http://localhost:11200",
		BuildLongURLPayload(
			stage1InputWithTemplate(Stage1Input{}),
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
			stage1InputWithTemplate(Stage1Input{}),
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

func TestDecodeLongURLPayload_RejectsServerAggregationGroupWithDuplicateMembers(t *testing.T) {
	longURL, err := EncodeLongURL(
		"http://localhost:11200",
		BuildLongURLPayload(
			stage1InputWithTemplate(Stage1Input{}),
			Stage2Snapshot{
				Rows: []Stage2Row{{
					RowID:                 "HK 01",
					SourceLandingNodeName: "HK 01",
					ProxyName:             "HK 01",
					LandingNodeName:       "HK 01",
					Mode:                  "none",
				}},
				ServerAggregationGroups: []ServerAggregationGroup{{
					Server:       "landing.example.com",
					Enabled:      true,
					Strategy:     "fallback",
					MemberRowIDs: []string{"HK 01", "HK 01"},
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
	if !strings.Contains(err.Error(), "validate long URL payload schema: server aggregation group for server") ||
		!strings.Contains(err.Error(), "must include at least 2 memberRowIds") {
		t.Fatalf("error mismatch: got %v", err)
	}
}

func TestDecodeLongURLPayload_RejectsLegacyEnablePortForwardField(t *testing.T) {
	payloadJSON := []byte(`{"stage1Input":{"advancedOptions":{"config":"https://templates.example.com/default.ini","emoji":true,"udp":true,"skipCertVerify":null,"include":null,"exclude":null,"enablePortForward":true},"forwardRelayItems":[],"landingRawText":"","transitRawText":""},"stage2Snapshot":{"rows":[]},"v":1}`)
	encodedData, err := encodeCompressedData(payloadJSON)
	if err != nil {
		t.Fatalf("encodeCompressedData() error = %v", err)
	}
	longURL, err := joinSubURL("http://localhost:11200", encodedData)
	if err != nil {
		t.Fatalf("joinSubURL() error = %v", err)
	}

	_, err = DecodeLongURLPayload(longURL, InputLimits{})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "unmarshal long URL payload: json: unknown field \"enablePortForward\"") {
		t.Fatalf("error mismatch: got %v", err)
	}
}

func TestDecodeLongURLPayload_AcceptsCompatiblePayloadVersionAndCanonicalizes(t *testing.T) {
	longURL, err := EncodeLongURL(
		"http://localhost:11200",
		BuildLongURLPayload(
			stage1InputWithTemplate(Stage1Input{}),
			Stage2Snapshot{},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	parsedURL, err := url.Parse(longURL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}
	payloadJSON, err := decodeCompressedData(parsedURL.Query().Get(longURLParamData))
	if err != nil {
		t.Fatalf("decodeCompressedData() error = %v", err)
	}

	var schema longURLPayloadSchema
	if err := json.Unmarshal(payloadJSON, &schema); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	schema.V = 2

	mutatedPayloadJSON, err := json.Marshal(schema)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	mutatedData, err := encodeCompressedData(mutatedPayloadJSON)
	if err != nil {
		t.Fatalf("encodeCompressedData() error = %v", err)
	}
	mutatedLongURL, err := joinSubURL("http://localhost:11200", mutatedData)
	if err != nil {
		t.Fatalf("joinSubURL() error = %v", err)
	}

	payload, err := DecodeLongURLPayload(mutatedLongURL, InputLimits{})
	if err != nil {
		t.Fatalf("DecodeLongURLPayload() error = %v", err)
	}
	if payload.V != longURLSchemaVersion {
		t.Fatalf("expected payload version to be canonicalized to %d, got %d", longURLSchemaVersion, payload.V)
	}
}

func TestDecodeLongURLPayload_RejectsUnsupportedPayloadVersion(t *testing.T) {
	longURL, err := EncodeLongURL(
		"http://localhost:11200",
		BuildLongURLPayload(
			stage1InputWithTemplate(Stage1Input{}),
			Stage2Snapshot{},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	parsedURL, err := url.Parse(longURL)
	if err != nil {
		t.Fatalf("url.Parse() error = %v", err)
	}
	payloadJSON, err := decodeCompressedData(parsedURL.Query().Get(longURLParamData))
	if err != nil {
		t.Fatalf("decodeCompressedData() error = %v", err)
	}

	var schema longURLPayloadSchema
	if err := json.Unmarshal(payloadJSON, &schema); err != nil {
		t.Fatalf("json.Unmarshal() error = %v", err)
	}
	schema.V = longURLSchemaVersion + 1

	mutatedPayloadJSON, err := json.Marshal(schema)
	if err != nil {
		t.Fatalf("json.Marshal() error = %v", err)
	}
	mutatedData, err := encodeCompressedData(mutatedPayloadJSON)
	if err != nil {
		t.Fatalf("encodeCompressedData() error = %v", err)
	}
	mutatedLongURL, err := joinSubURL("http://localhost:11200", mutatedData)
	if err != nil {
		t.Fatalf("joinSubURL() error = %v", err)
	}

	_, err = DecodeLongURLPayload(mutatedLongURL, InputLimits{})
	if err == nil {
		t.Fatal("expected error, got nil")
	}
	if !strings.Contains(err.Error(), "validate long URL payload schema: unsupported long URL payload version 4") {
		t.Fatalf("error mismatch: got %v", err)
	}
}

func TestDecodeLongURLPayload_AppliesCompatibleOuterQueryOverride(t *testing.T) {
	emoji := true
	longURL, err := EncodeLongURL(
		"http://localhost:11200",
		BuildLongURLPayload(
			stage1InputWithTemplate(Stage1Input{AdvancedOptions: AdvancedOptions{Emoji: &emoji}}),
			Stage2Snapshot{},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	payload, err := DecodeLongURLPayload(longURL+"&emoji=false", InputLimits{})
	if err != nil {
		t.Fatalf("DecodeLongURLPayload() error = %v", err)
	}
	if payload.Stage1Input.AdvancedOptions.Emoji == nil || *payload.Stage1Input.AdvancedOptions.Emoji {
		t.Fatalf("expected outer emoji=false to override payload, got %+v", payload.Stage1Input.AdvancedOptions.Emoji)
	}
}

func TestExtractSubscriptionPassthroughQuery_StripsReservedNames(t *testing.T) {
	query := mustParseQuery(t, "data=payload&emoji=false&download=1&tfo=true&foo=bar&classic=false")
	passthrough := ExtractSubscriptionPassthroughQuery(query)

	if got := passthrough.Get("tfo"); got != "true" {
		t.Fatalf("tfo mismatch: got %q", got)
	}
	if got := passthrough.Get("foo"); got != "bar" {
		t.Fatalf("foo mismatch: got %q", got)
	}
	if passthrough.Get("emoji") != "" || passthrough.Get("data") != "" || passthrough.Get("download") != "" || passthrough.Get("classic") != "" {
		t.Fatalf("reserved params leaked into passthrough: %+v", passthrough)
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
		V: longURLSchemaVersion,
		Stage1Input: Stage1Input{
			LandingRawText:    "landing",
			TransitRawText:    "transit",
			ForwardRelayItems: []string{"forward"},
			AdvancedOptions: AdvancedOptions{
				Emoji:          &emoji,
				UDP:            &udp,
				SkipCertVerify: &skipCertVerify,
				Config:         &config,
				Include:        include,
				Exclude:        exclude,
			},
		},
		Stage2Snapshot: Stage2Snapshot{
			Rows: []Stage2Row{{
				RowID:                 "HK 01",
				SourceLandingNodeName: "HK 01",
				ProxyName:             "HK 01",
				LandingNodeName:       "HK 01",
				Mode:                  "chain",
				TargetName:            &targetName,
			}},
			ServerAggregationGroups: []ServerAggregationGroup{{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"HK 01"},
			}},
		},
	}

	got, err := marshalCanonicalLongURLPayload(payload)
	if err != nil {
		t.Fatalf("marshalCanonicalLongURLPayload() error = %v", err)
	}

	want := `{"stage1Input":{"advancedOptions":{"config":"  mixed-port: 7890  ","emoji":true,"exclude":["US"],"include":["HK"],"skipCertVerify":true,"udp":false},"forwardRelayItems":["forward"],"landingRawText":"landing","transitRawText":"transit"},"stage2Snapshot":{"rows":[{"rowId":"HK 01","sourceLandingNodeName":"HK 01","proxyName":"HK 01","mode":"chain","targetName":"HK Relay"}],"serverAggregationGroups":[{"server":"landing.example.com","enabled":true,"strategy":"fallback","memberRowIds":["HK 01"]}]},"v":3}`
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

func mustParseQuery(t *testing.T, rawQuery string) url.Values {
	t.Helper()

	values, err := url.ParseQuery(rawQuery)
	if err != nil {
		t.Fatalf("url.ParseQuery() error = %v", err)
	}
	return values
}
