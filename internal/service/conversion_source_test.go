package service

import (
	"context"
	"path/filepath"
	"reflect"
	"strings"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

type fakeConversionSource struct {
	gotRequest subconverter.Request
	result     subconverter.ThreePassResult
	err        error
}

func (source *fakeConversionSource) Convert(_ context.Context, request subconverter.Request) (subconverter.ThreePassResult, error) {
	source.gotRequest = request
	return source.result, source.err
}

func TestConversionFixturesFromResult_RejectsUnresolvableDiscoveryNames(t *testing.T) {
	_, err := ConversionFixturesFromResult(subconverter.ThreePassResult{
		LandingDiscovery: subconverter.PassResult{YAML: "proxies:\n- {name: landing-a, type: ss}\n"},
		TransitDiscovery: subconverter.PassResult{YAML: "proxies:\n- {name: transit-a, type: ss}\n"},
		FullBase:         subconverter.PassResult{YAML: "proxies:\n- {name: landing-a, type: ss}\nproxy-groups:\n  - name: 🇭🇰 香港节点\n    type: url-test\n    proxies:\n      - DIRECT\n"},
	})
	if !subconverter.IsUnavailable(err) {
		t.Fatalf("ConversionFixturesFromResult() error mismatch: got %v", err)
	}
}

func TestConversionFixturesFromResult_RejectsInvalidDiscoveryPasses(t *testing.T) {
	testCases := []struct {
		name   string
		result subconverter.ThreePassResult
	}{
		{
			name: "landing discovery HTML body",
			result: subconverter.ThreePassResult{
				LandingDiscovery: subconverter.PassResult{YAML: "<html>upstream error</html>"},
				TransitDiscovery: subconverter.PassResult{YAML: "proxies:\n- {name: transit-a, type: ss}\n"},
				FullBase: subconverter.PassResult{YAML: strings.Join([]string{
					"proxies:",
					"- {name: landing-a, type: ss}",
					"- {name: transit-a, type: ss}",
					"proxy-groups:",
					"  - name: 🇭🇰 香港节点",
					"    type: url-test",
					"    proxies:",
					"      - transit-a",
					"",
				}, "\n")},
			},
		},
		{
			name: "transit discovery malformed YAML",
			result: subconverter.ThreePassResult{
				LandingDiscovery: subconverter.PassResult{YAML: "proxies:\n- {name: landing-a, type: ss}\n"},
				TransitDiscovery: subconverter.PassResult{YAML: "proxies:\n- name: transit-a\n"},
				FullBase: subconverter.PassResult{YAML: strings.Join([]string{
					"proxies:",
					"- {name: landing-a, type: ss}",
					"- {name: transit-a, type: ss}",
					"proxy-groups:",
					"  - name: 🇭🇰 香港节点",
					"    type: url-test",
					"    proxies:",
					"      - transit-a",
					"",
				}, "\n")},
			},
		},
	}

	for _, testCase := range testCases {
		t.Run(testCase.name, func(t *testing.T) {
			_, err := ConversionFixturesFromResult(testCase.result)
			if !subconverter.IsUnavailable(err) {
				t.Fatalf("ConversionFixturesFromResult() error mismatch: got %v", err)
			}
		})
	}
}

func TestConversionFixturesFromResult_RejectsInvalidFullBasePass(t *testing.T) {
	_, err := ConversionFixturesFromResult(subconverter.ThreePassResult{
		LandingDiscovery: subconverter.PassResult{YAML: "proxies:\n- {name: landing-a, type: ss}\n"},
		TransitDiscovery: subconverter.PassResult{YAML: "proxies:\n- {name: transit-a, type: ss}\n"},
		FullBase:         subconverter.PassResult{YAML: "proxies:\n- {name: landing-a, type: ss}\n"},
	})
	if !subconverter.IsUnavailable(err) {
		t.Fatalf("ConversionFixturesFromResult() error mismatch: got %v", err)
	}
}

func TestBuildStage1ConvertResponseFromSource_HappyPath(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var request Stage1ConvertRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.request.json"), &request)

	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}

	response, err := BuildStage1ConvertResponseFromSource(context.Background(), source, request.Stage1Input)
	if err != nil {
		t.Fatalf("BuildStage1ConvertResponseFromSource() error = %v", err)
	}

	expectedResponse := readTextFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.response.json"))
	if got := mustMarshalIndented(t, response); strings.TrimSpace(got) != strings.TrimSpace(expectedResponse) {
		t.Fatalf("stage1 response mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, expectedResponse)
	}

	if !reflect.DeepEqual(source.gotRequest, toExpectedSubconverterRequest(request.Stage1Input)) {
		t.Fatalf("source request mismatch: got %#v want %#v", source.gotRequest, toExpectedSubconverterRequest(request.Stage1Input))
	}
}

func TestBuildGenerateResponseFromSource_HappyPath(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var request GenerateRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.request.json"), &request)

	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}

	response, err := BuildGenerateResponseFromSource(context.Background(), "http://localhost:11200", source, request, 0)
	if err != nil {
		t.Fatalf("BuildGenerateResponseFromSource() error = %v", err)
	}

	expectedResponse := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.response.json"))
	if got := mustMarshalIndented(t, response); strings.TrimSpace(got) != strings.TrimSpace(expectedResponse) {
		t.Fatalf("generate response mismatch:\n--- got ---\n%s\n--- want ---\n%s", got, expectedResponse)
	}
}

func TestRenderCompleteConfigFromSource_HappyPath(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var request GenerateRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.request.json"), &request)

	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}

	renderedConfig, err := RenderCompleteConfigFromSource(context.Background(), source, request.Stage1Input, request.Stage2Snapshot)
	if err != nil {
		t.Fatalf("RenderCompleteConfigFromSource() error = %v", err)
	}

	expectedConfig := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "complete-config.chain.yaml"))
	if strings.TrimSpace(renderedConfig) != strings.TrimSpace(expectedConfig) {
		t.Fatalf("complete config mismatch:\n--- got ---\n%s\n--- want ---\n%s", renderedConfig, expectedConfig)
	}
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

func toExpectedSubconverterRequest(stage1Input Stage1Input) subconverter.Request {
	return subconverter.Request{
		LandingRawText: stage1Input.LandingRawText,
		TransitRawText: stage1Input.TransitRawText,
		Options: subconverter.AdvancedOptions{
			Emoji:          stage1Input.AdvancedOptions.Emoji,
			UDP:            stage1Input.AdvancedOptions.UDP,
			SkipCertVerify: stage1Input.AdvancedOptions.SkipCertVerify,
			Config:         stage1Input.AdvancedOptions.Config,
			Include:        stage1Input.AdvancedOptions.Include,
			Exclude:        stage1Input.AdvancedOptions.Exclude,
		},
	}
}
