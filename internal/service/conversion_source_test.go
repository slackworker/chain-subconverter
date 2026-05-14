package service

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"path/filepath"
	"reflect"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	"github.com/slackworker/chain-subconverter/internal/config"
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

func TestConversionFixturesFromResult_AcceptsStructuredLandingDiscoveryNames(t *testing.T) {
	_, err := ConversionFixturesFromResult(subconverter.ThreePassResult{
		LandingDiscovery: subconverter.PassResult{YAML: "proxies:\n- {name: landing-a, type: ss}\n"},
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
	})
	if err != nil {
		t.Fatalf("ConversionFixturesFromResult() error = %v", err)
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

	response, err := BuildStage1ConvertResponseFromSource(context.Background(), source, request.Stage1Input, InputLimits{})
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

	response, err := BuildGenerateResponseFromSource(context.Background(), "http://localhost:11200", source, request, 0, InputLimits{})
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

	renderedConfig, err := RenderCompleteConfigFromSource(context.Background(), source, request.Stage1Input, request.Stage2Snapshot, InputLimits{})
	if err != nil {
		t.Fatalf("RenderCompleteConfigFromSource() error = %v", err)
	}

	expectedConfig := readTextFixture(t, filepath.Join(fixtureDir, "stage2", "output", "complete-config.chain.yaml"))
	if strings.TrimSpace(renderedConfig) != strings.TrimSpace(expectedConfig) {
		t.Fatalf("complete config mismatch:\n--- got ---\n%s\n--- want ---\n%s", renderedConfig, expectedConfig)
	}
}

func TestManagedConversionSource_FetchesTemplateAndInjectsManagedConfigURL(t *testing.T) {
	templateConfig := "custom_proxy_group=🇩🇪 德国节点`fallback`(DE|德国)`https://cp.cloudflare.com/generate_204`300,,50\n"
	templateServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		_, _ = writer.Write([]byte(templateConfig))
	}))
	defer templateServer.Close()
	templateStore := NewInMemoryTemplateContentStore()

	internalTemplateServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		id := strings.TrimPrefix(request.URL.Path, "/internal/templates/")
		id = strings.TrimSuffix(id, ".ini")
		content, ok := templateStore.Load(id)
		if !ok {
			http.NotFound(writer, request)
			return
		}
		_, _ = writer.Write([]byte(content))
	}))
	defer internalTemplateServer.Close()

	seenConfig := make(chan string, 3)
	subconverterServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		configURL := request.URL.Query().Get("config")
		resp, err := http.Get(configURL)
		if err != nil {
			t.Fatalf("fetch managed config URL: %v", err)
		}
		defer resp.Body.Close()
		body, err := io.ReadAll(resp.Body)
		if err != nil {
			t.Fatalf("read managed config body: %v", err)
		}
		seenConfig <- string(body)

		if request.URL.Query().Get("list") == "true" {
			if strings.Contains(request.URL.Query().Get("url"), "landing") {
				_, _ = writer.Write([]byte("proxies:\n- {name: DE Landing, type: ss}\n"))
				return
			}
			_, _ = writer.Write([]byte("proxies:\n- {name: transit-de, type: ss}\n"))
			return
		}

		_, _ = writer.Write([]byte(strings.Join([]string{
			"proxies:",
			"- {name: DE Landing, type: ss, server: landing.example.com, port: 443}",
			"- {name: transit-de, type: ss, server: transit.example.com, port: 443}",
			"proxy-groups:",
			"  - name: 🇩🇪 德国节点",
			"    type: fallback",
			"    proxies:",
			"      - transit-de",
			"",
		}, "\n")))
	}))
	defer subconverterServer.Close()

	client, err := subconverter.NewClient(config.Subconverter{
		BaseURL:     subconverterServer.URL + "/sub?",
		Timeout:     time.Second,
		MaxInFlight: 1,
	})
	if err != nil {
		t.Fatalf("NewClient() error = %v", err)
	}

	source, err := NewManagedConversionSource(client, templateStore, internalTemplateServer.URL, time.Second, ManagedConversionSourceOptions{
		AllowPrivateNetworks: true,
	})
	if err != nil {
		t.Fatalf("NewManagedConversionSource() error = %v", err)
	}

	response, err := BuildStage1ConvertResponseFromSource(context.Background(), source, Stage1Input{
		LandingRawText: "https://landing.example/sub",
		TransitRawText: "https://transit.example/sub",
		AdvancedOptions: AdvancedOptions{
			Config: stringPtr(templateServer.URL),
		},
	}, InputLimits{})
	if err != nil {
		t.Fatalf("BuildStage1ConvertResponseFromSource() error = %v", err)
	}
	row := response.Stage2Init.Rows[0]
	if row.LandingNodeType != "SS" {
		t.Fatalf("row landingNodeType mismatch: got %q want %q", row.LandingNodeType, "SS")
	}
	if row.Mode != "chain" {
		t.Fatalf("row mode mismatch: got %q want %q", row.Mode, "chain")
	}
	if row.TargetName == nil || *row.TargetName != "🇩🇪 德国节点" {
		t.Fatalf("row targetName mismatch: got %v", row.TargetName)
	}

	for i := 0; i < 3; i++ {
		select {
		case got := <-seenConfig:
			if got != strings.TrimSpace(templateConfig) {
				t.Fatalf("managed template mismatch: got %q want %q", got, strings.TrimSpace(templateConfig))
			}
		case <-time.After(2 * time.Second):
			t.Fatalf("timed out waiting for managed template fetch %d", i)
		}
	}
}

func TestManagedConversionSource_TemplateFetchCache(t *testing.T) {
	templateConfig := "custom_proxy_group=🇩🇪 德国节点`fallback`(DE|德国)`https://cp.cloudflare.com/generate_204`300,,50\n"

	newSource := func(t *testing.T, defaultURL string, defaultTTL time.Duration, ttl time.Duration) *ManagedConversionSource {
		t.Helper()

		dummySubconverter := httptest.NewServer(http.NotFoundHandler())
		defer dummySubconverter.Close()

		client, err := subconverter.NewClient(config.Subconverter{
			BaseURL:     dummySubconverter.URL + "/sub?",
			Timeout:     time.Second,
			MaxInFlight: 1,
		})
		if err != nil {
			t.Fatalf("NewClient() error = %v", err)
		}

		source, err := NewManagedConversionSource(client, NewInMemoryTemplateContentStore(), "http://internal.example.com", time.Second, ManagedConversionSourceOptions{
			DefaultTemplateURL:           defaultURL,
			DefaultTemplateFetchCacheTTL: defaultTTL,
			TemplateFetchCacheTTL:        ttl,
			AllowPrivateNetworks:         true,
		})
		if err != nil {
			t.Fatalf("NewManagedConversionSource() error = %v", err)
		}

		return source
	}

	t.Run("disabled by default", func(t *testing.T) {
		var hits atomic.Int32
		templateServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			hits.Add(1)
			_, _ = writer.Write([]byte(templateConfig))
		}))
		defer templateServer.Close()

		source := newSource(t, "", 0, 0)
		stage1Input := Stage1Input{AdvancedOptions: AdvancedOptions{Config: stringPtr(templateServer.URL)}}

		first, err := source.PrepareConversion(context.Background(), stage1Input)
		if err != nil {
			t.Fatalf("PrepareConversion() first error = %v", err)
		}
		defer first.Cleanup()

		second, err := source.PrepareConversion(context.Background(), stage1Input)
		if err != nil {
			t.Fatalf("PrepareConversion() second error = %v", err)
		}
		defer second.Cleanup()

		if got := hits.Load(); got != 2 {
			t.Fatalf("template fetch count = %d, want 2 when cache is disabled", got)
		}
	})

	t.Run("requires explicit template URL", func(t *testing.T) {
		source := newSource(t, "", 0, 0)
		for _, input := range []Stage1Input{
			{},
			{AdvancedOptions: AdvancedOptions{Config: stringPtr("   ")}},
		} {
			if _, err := source.PrepareConversion(context.Background(), input); err == nil {
				t.Fatalf("PrepareConversion() error = nil, want invalid request for missing template URL")
			} else {
				responseErr, ok := AsResponseError(err)
				if !ok {
					t.Fatalf("PrepareConversion() error = %T, want ResponseError", err)
				}
				if responseErr.StatusCode() != http.StatusBadRequest {
					t.Fatalf("status code = %d, want %d", responseErr.StatusCode(), http.StatusBadRequest)
				}
				blockingError := responseErr.BlockingError()
				if blockingError.Code != "INVALID_REQUEST" || blockingError.Scope != "stage1_field" || blockingError.Context["field"] != "config" {
					t.Fatalf("blocking error = %+v, want INVALID_REQUEST stage1_field config", blockingError)
				}
			}
		}
	})

	t.Run("rejects private template URL by default", func(t *testing.T) {
		dummySubconverter := httptest.NewServer(http.NotFoundHandler())
		defer dummySubconverter.Close()

		client, err := subconverter.NewClient(config.Subconverter{
			BaseURL:     dummySubconverter.URL + "/sub?",
			Timeout:     time.Second,
			MaxInFlight: 1,
		})
		if err != nil {
			t.Fatalf("NewClient() error = %v", err)
		}

		source, err := NewManagedConversionSource(client, NewInMemoryTemplateContentStore(), "http://internal.example.com", time.Second, ManagedConversionSourceOptions{})
		if err != nil {
			t.Fatalf("NewManagedConversionSource() error = %v", err)
		}

		_, err = source.PrepareConversion(context.Background(), Stage1Input{
			AdvancedOptions: AdvancedOptions{Config: stringPtr("http://127.0.0.1/private.ini")},
		})
		if err == nil {
			t.Fatal("PrepareConversion() error = nil, want invalid request for private template URL")
		}

		responseErr, ok := AsResponseError(err)
		if !ok {
			t.Fatalf("PrepareConversion() error = %T, want ResponseError", err)
		}
		if responseErr.StatusCode() != http.StatusBadRequest {
			t.Fatalf("status code = %d, want %d", responseErr.StatusCode(), http.StatusBadRequest)
		}
		blockingError := responseErr.BlockingError()
		if blockingError.Code != "INVALID_REQUEST" || blockingError.Scope != "stage1_field" || blockingError.Context["field"] != "config" {
			t.Fatalf("blocking error = %+v, want INVALID_REQUEST stage1_field config", blockingError)
		}
		if !strings.Contains(blockingError.Message, "private or loopback") {
			t.Fatalf("blocking error message = %q, want private-or-loopback hint", blockingError.Message)
		}
	})

	t.Run("reuses cached custom template until ttl expires", func(t *testing.T) {
		var hits atomic.Int32
		templateServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			hits.Add(1)
			_, _ = writer.Write([]byte(templateConfig))
		}))
		defer templateServer.Close()

		source := newSource(t, "", 0, time.Minute)
		currentTime := time.Unix(1700000000, 0)
		source.templateFetchCache.now = func() time.Time {
			return currentTime
		}
		stage1Input := Stage1Input{AdvancedOptions: AdvancedOptions{Config: stringPtr(templateServer.URL)}}

		first, err := source.PrepareConversion(context.Background(), stage1Input)
		if err != nil {
			t.Fatalf("PrepareConversion() first error = %v", err)
		}
		defer first.Cleanup()

		second, err := source.PrepareConversion(context.Background(), stage1Input)
		if err != nil {
			t.Fatalf("PrepareConversion() second error = %v", err)
		}
		defer second.Cleanup()

		if got := hits.Load(); got != 1 {
			t.Fatalf("template fetch count after cache hit = %d, want 1", got)
		}

		currentTime = currentTime.Add(2 * time.Minute)
		third, err := source.PrepareConversion(context.Background(), stage1Input)
		if err != nil {
			t.Fatalf("PrepareConversion() third error = %v", err)
		}
		defer third.Cleanup()

		if got := hits.Load(); got != 2 {
			t.Fatalf("template fetch count after ttl expiry = %d, want 2", got)
		}
	})

	t.Run("reuses default template with dedicated ttl while custom template stays uncached", func(t *testing.T) {
		var defaultHits atomic.Int32
		defaultTemplateServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			defaultHits.Add(1)
			_, _ = writer.Write([]byte(templateConfig))
		}))
		defer defaultTemplateServer.Close()
		var customHits atomic.Int32
		customTemplateServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			customHits.Add(1)
			_, _ = writer.Write([]byte(templateConfig))
		}))
		defer customTemplateServer.Close()

		source := newSource(t, defaultTemplateServer.URL, 10*time.Minute, 0)
		currentTime := time.Unix(1700000000, 0)
		source.defaultTemplateFetchCache.now = func() time.Time {
			return currentTime
		}

		defaultInput := Stage1Input{AdvancedOptions: AdvancedOptions{Config: stringPtr(defaultTemplateServer.URL)}}
		firstDefault, err := source.PrepareConversion(context.Background(), defaultInput)
		if err != nil {
			t.Fatalf("PrepareConversion() first default error = %v", err)
		}
		defer firstDefault.Cleanup()

		secondDefault, err := source.PrepareConversion(context.Background(), defaultInput)
		if err != nil {
			t.Fatalf("PrepareConversion() second default error = %v", err)
		}
		defer secondDefault.Cleanup()

		if cache := source.templateFetchCacheForURL(true); cache != source.defaultTemplateFetchCache {
			t.Fatalf("default template cache mismatch")
		}

		if got := defaultHits.Load(); got != 1 {
			t.Fatalf("default template fetch count = %d, want 1", got)
		}

		customInput := Stage1Input{AdvancedOptions: AdvancedOptions{Config: stringPtr(customTemplateServer.URL)}}
		firstCustom, err := source.PrepareConversion(context.Background(), customInput)
		if err != nil {
			t.Fatalf("PrepareConversion() first custom error = %v", err)
		}
		defer firstCustom.Cleanup()

		secondCustom, err := source.PrepareConversion(context.Background(), customInput)
		if err != nil {
			t.Fatalf("PrepareConversion() second custom error = %v", err)
		}
		defer secondCustom.Cleanup()

		if got := customHits.Load(); got != 2 {
			t.Fatalf("custom template fetch count = %d, want 2 when only default cache is enabled", got)
		}
	})

	t.Run("uses stale default template when refresh fails", func(t *testing.T) {
		var fail atomic.Bool
		var hits atomic.Int32
		templateServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			hits.Add(1)
			if fail.Load() {
				http.Error(writer, "upstream unavailable", http.StatusBadGateway)
				return
			}
			_, _ = writer.Write([]byte(templateConfig))
		}))
		defer templateServer.Close()

		source := newSource(t, templateServer.URL, time.Minute, 0)
		currentTime := time.Unix(1700000000, 0)
		source.defaultTemplateFetchCache.now = func() time.Time {
			return currentTime
		}

		defaultInput := Stage1Input{AdvancedOptions: AdvancedOptions{Config: stringPtr(templateServer.URL)}}
		first, err := source.PrepareConversion(context.Background(), defaultInput)
		if err != nil {
			t.Fatalf("PrepareConversion() first error = %v", err)
		}
		defer first.Cleanup()
		if len(first.Messages) != 0 {
			t.Fatalf("first conversion messages = %v, want none", first.Messages)
		}

		fail.Store(true)
		currentTime = currentTime.Add(2 * time.Minute)
		second, err := source.PrepareConversion(context.Background(), defaultInput)
		if err != nil {
			t.Fatalf("PrepareConversion() stale fallback error = %v", err)
		}
		defer second.Cleanup()
		if second.TemplateConfig != strings.TrimSpace(templateConfig) {
			t.Fatalf("stale template mismatch: got %q", second.TemplateConfig)
		}
		if len(second.Messages) != 1 || second.Messages[0].Code != "DEFAULT_TEMPLATE_CACHE_USED" {
			t.Fatalf("stale fallback messages = %v, want DEFAULT_TEMPLATE_CACHE_USED", second.Messages)
		}
		if got := hits.Load(); got != 2 {
			t.Fatalf("template fetch count = %d, want 2", got)
		}
	})

	t.Run("does not cache invalid template content", func(t *testing.T) {
		var hits atomic.Int32
		templateServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
			hits.Add(1)
			_, _ = writer.Write([]byte("custom_proxy_group=🇺🇸 美国节点`url-test`(\n"))
		}))
		defer templateServer.Close()

		source := newSource(t, "", 0, time.Minute)
		stage1Input := Stage1Input{AdvancedOptions: AdvancedOptions{Config: stringPtr(templateServer.URL)}}

		if _, err := source.PrepareConversion(context.Background(), stage1Input); err == nil {
			t.Fatalf("PrepareConversion() first error = nil, want invalid template")
		}
		if _, err := source.PrepareConversion(context.Background(), stage1Input); err == nil {
			t.Fatalf("PrepareConversion() second error = nil, want invalid template")
		}
		if got := hits.Load(); got != 2 {
			t.Fatalf("invalid template fetch count = %d, want 2", got)
		}
	})
}

func TestBuildTemplateConfigUnavailableMessage(t *testing.T) {
	t.Run("surfaces timeout for default template", func(t *testing.T) {
		message := buildTemplateConfigUnavailableMessage(
			"https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini",
			true,
			timeoutErr{},
		)

		for _, want := range []string{"默认模板 URL 当前不可用", "raw.githubusercontent.com", "超时", "连通性可能存在波动"} {
			if !strings.Contains(message, want) {
				t.Fatalf("message = %q, want substring %q", message, want)
			}
		}
	})

	t.Run("surfaces generic timeout for custom template", func(t *testing.T) {
		message := buildTemplateConfigUnavailableMessage(
			"https://example.com/template.ini",
			false,
			timeoutErr{},
		)

		for _, want := range []string{"模板 URL 当前不可用", "example.com", "超时", "连通性可能存在波动"} {
			if !strings.Contains(message, want) {
				t.Fatalf("message = %q, want substring %q", message, want)
			}
		}
	})
}

type timeoutErr struct{}

func (timeoutErr) Error() string   { return "timeout" }
func (timeoutErr) Timeout() bool   { return true }
func (timeoutErr) Temporary() bool { return true }

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
