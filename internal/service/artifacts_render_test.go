package service

import (
	"strings"
	"testing"
)

func TestRenderCompleteConfig_PortForwardRewritesServerAndPort(t *testing.T) {
	targetName := "relay.example.com:80"
	fixtures := singleLandingFixture("HK Landing", "ss", "")

	rendered, err := RenderCompleteConfig(
		Stage1Input{
			ForwardRelayItems: []string{targetName},
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

func TestBuildManagedLandingConfigYAML_DerivesClonedRows(t *testing.T) {
	chainTarget := "🇭🇰 香港节点"
	relayTarget := "relay.example.com:7443"

	rendered, err := buildManagedLandingConfigYAML(
		strings.Join([]string{
			"proxies:",
			"  - {name: HK Landing, type: ss, server: landing.example.com, port: 443, dialer-proxy: transit-a}",
			"",
		}, "\n"),
		[]Stage2Row{
			{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				LandingNodeName:       "HK Landing",
				Mode:                  "chain",
				TargetName:            &chainTarget,
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing Copy",
				LandingNodeName:       "HK Landing Copy",
				Mode:                  "port_forward",
				TargetName:            &relayTarget,
			},
		},
	)
	if err != nil {
		t.Fatalf("buildManagedLandingConfigYAML() error = %v", err)
	}

	if !strings.Contains(rendered, "  - {name: HK Landing, type: ss, server: landing.example.com, port: 443, dialer-proxy: 🇭🇰 香港节点}") {
		t.Fatalf("managed landing is missing chain row:\n%s", rendered)
	}
	if !strings.Contains(rendered, "  - {name: HK Landing Copy, type: ss, server: relay.example.com, port: 7443}") {
		t.Fatalf("managed landing is missing port-forward clone:\n%s", rendered)
	}
}

func TestRenderCompleteConfig_OverridesChainProxyGroupForAggressiveFallback(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: HK Landing, type: ss}\n",
		TransitDiscoveryYAML: "proxies:\n- {name: transit-hk, type: ss}\n",
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
			"- {name: transit-hk, type: ss, server: transit.example.com, port: 443}",
			"proxy-groups:",
			"  - name: 🇭🇰 香港节点",
			"    type: url-test",
			"    url: https://example.com/original",
			"    interval: 300",
			"    tolerance: 50",
			"    proxies:",
			"      - HK Landing",
			"      - transit-hk",
			"",
		}, "\n"),
		TemplateConfig: "custom_proxy_group=🇭🇰 香港节点`url-test`HK\n",
	}

	rendered, err := RenderCompleteConfig(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{{
				LandingNodeName:        "HK Landing",
				Mode:                   "chain",
				TargetName:             &targetName,
				ChainProxyGroupProfile: ChainProxyGroupProfileAggressiveFallback,
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	if !strings.Contains(rendered, "    type: fallback") {
		t.Fatalf("rendered config should override proxy-group type:\n%s", rendered)
	}
	if !strings.Contains(rendered, "    lazy: false") || !strings.Contains(rendered, "    timeout: 2000") || !strings.Contains(rendered, "    max-failed-times: 1") {
		t.Fatalf("rendered config should include aggressive fallback fields:\n%s", rendered)
	}
	if strings.Contains(rendered, "    tolerance: 50") {
		t.Fatalf("rendered config should remove tolerance for fallback profile:\n%s", rendered)
	}
	if !strings.Contains(rendered, "    url: https://cp.cloudflare.com/generate_204") {
		t.Fatalf("rendered config should pin the managed health check URL:\n%s", rendered)
	}
	if strings.Contains(rendered, `\U0001F1EF`) || strings.Contains(rendered, `\U0001F1F0`) {
		t.Fatalf("rendered config should preserve literal emoji in proxy-group name:\n%s", rendered)
	}
	if !strings.Contains(rendered, "  - name: 🇭🇰 香港节点") {
		t.Fatalf("rendered config should preserve original proxy-group name line:\n%s", rendered)
	}
}

func TestRenderCompleteConfig_OverridesChainProxyGroupForAggressiveURLTest(t *testing.T) {
	targetName := "🇯🇵 日本节点"
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: JP Landing, type: ss}\n",
		TransitDiscoveryYAML: "proxies:\n- {name: transit-jp, type: ss}\n",
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: JP Landing, type: ss, server: landing.example.com, port: 443}",
			"- {name: transit-jp, type: ss, server: transit.example.com, port: 443}",
			"proxy-groups:",
			"  - name: 🇯🇵 日本节点",
			"    type: url-test",
			"    url: https://example.com/original",
			"    interval: 300",
			"    tolerance: 50",
			"    proxies:",
			"      - JP Landing",
			"      - transit-jp",
			"",
		}, "\n"),
		TemplateConfig: "custom_proxy_group=🇯🇵 日本节点`url-test`JP\n",
	}

	rendered, err := RenderCompleteConfig(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{{
				LandingNodeName:        "JP Landing",
				Mode:                   "chain",
				TargetName:             &targetName,
				ChainProxyGroupProfile: ChainProxyGroupProfileAggressiveURLTest,
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	if !strings.Contains(rendered, "    type: url-test") {
		t.Fatalf("rendered config should keep url-test type:\n%s", rendered)
	}
	if !strings.Contains(rendered, "    tolerance: 1") {
		t.Fatalf("rendered config should override tolerance:\n%s", rendered)
	}
	if strings.Contains(rendered, "    tolerance: 50") {
		t.Fatalf("rendered config should replace old tolerance:\n%s", rendered)
	}
	if !strings.Contains(rendered, "  - name: 🇯🇵 日本节点") {
		t.Fatalf("rendered config should preserve original proxy-group name line:\n%s", rendered)
	}
	if strings.Contains(rendered, `\U0001F1EF`) {
		t.Fatalf("rendered config should preserve literal emoji in proxy-group name:\n%s", rendered)
	}
}
