package main

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/slackworker/chain-subconverter/internal/config"
	"github.com/slackworker/chain-subconverter/internal/review"
	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

func TestActionOutputDir_UsesStageScopedOutputFolder(t *testing.T) {
	if got := actionOutputDir("/tmp/review-case", "stage1"); got != "/tmp/review-case/stage1/output" {
		t.Fatalf("actionOutputDir(stage1) = %q", got)
	}
	if got := actionOutputDir("/tmp/review-case", "stage2"); got != "/tmp/review-case/stage2/output" {
		t.Fatalf("actionOutputDir(stage2) = %q", got)
	}
}

func TestParseArgs_DefaultCaseDir(t *testing.T) {
	action, caseDir, publicBaseURL, maxLongURLLength, err := parseArgs([]string{"stage1"})
	if err != nil {
		t.Fatalf("parseArgs() error = %v", err)
	}
	if action != "stage1" {
		t.Fatalf("action = %q, want %q", action, "stage1")
	}
	if caseDir != "review/cases/3pass-ss2022-test-subscription" {
		t.Fatalf("caseDir = %q", caseDir)
	}
	if publicBaseURL != "http://localhost:11200" {
		t.Fatalf("publicBaseURL = %q", publicBaseURL)
	}
	if maxLongURLLength != 2048 {
		t.Fatalf("maxLongURLLength = %d", maxLongURLLength)
	}
}

func TestNewReviewConversionSource_UsesManagedTemplateConfig(t *testing.T) {
	templateConfig := "custom_proxy_group=🇩🇪 德国节点`fallback`(DE|德国)`https://cp.cloudflare.com/generate_204`300,,50\n"
	templateServer := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, _ *http.Request) {
		_, _ = writer.Write([]byte(templateConfig))
	}))
	defer templateServer.Close()

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

	source, cleanup, err := newReviewConversionSource(client, time.Second)
	if err != nil {
		t.Fatalf("newReviewConversionSource() error = %v", err)
	}
	defer cleanup()

	bundle, err := review.BuildStage1Artifacts(context.Background(), source, review.Case{
		Name: "custom-template",
		Stage1Input: service.Stage1Input{
			LandingRawText: "https://landing.example/sub",
			TransitRawText: "https://transit.example/sub",
			AdvancedOptions: service.AdvancedOptions{
				Config: stringPtr(templateServer.URL),
			},
		},
	})
	if err != nil {
		t.Fatalf("BuildStage1Artifacts() error = %v", err)
	}

	if len(bundle.Rows) != 1 || bundle.Rows[0].TargetName == nil || *bundle.Rows[0].TargetName != "🇩🇪 德国节点" {
		t.Fatalf("bundle.Rows = %#v, want default chain target 🇩🇪 德国节点", bundle.Rows)
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

func stringPtr(value string) *string {
	return &value
}
