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

func TestRenderCompleteConfig_AppendsAggressiveChainGroup(t *testing.T) {
	chainTarget := "🇭🇰 香港节点"
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: HK Landing, type: ss}\n",
		TransitDiscoveryYAML: "proxies:\n",
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: HK Landing, type: ss, server: landing.example.com, port: 443, dialer-proxy: transit-a}",
			"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
			"proxy-groups:",
			"  - name: 🇭🇰 香港节点",
			"    type: url-test",
			"    proxies:",
			"      - HK Landing",
			"      - HK Landing Copy",
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
		TemplateConfig: defaultRegionConfig,
	}

	rendered, err := RenderCompleteConfig(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					LandingNodeName:       "HK Landing",
					Mode:                  "chain",
					TargetName:            &chainTarget,
				},
				{
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing Copy",
					LandingNodeName:       "HK Landing Copy",
					Mode:                  "none",
				},
			},
			AggressiveChainGroups: []AggressiveChainGroup{{
				SourceLandingNodeName: "HK Landing",
				Strategy:              "fallback",
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	if !strings.Contains(rendered, "  - name: HK Landing Aggressive\n    type: fallback") {
		t.Fatalf("rendered config is missing aggressive chain group:\n%s", rendered)
	}
	if !strings.Contains(rendered, "      - HK Landing\n      - HK Landing Copy") {
		t.Fatalf("rendered config is missing aggressive chain group members:\n%s", rendered)
	}
	if !strings.Contains(rendered, "    lazy: false\n    max-failed-times: 1") {
		t.Fatalf("rendered config is missing aggressive chain profile:\n%s", rendered)
	}
}
