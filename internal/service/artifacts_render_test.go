package service

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
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
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "port_forward",
					TargetName:            &targetName,
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
		TransitDiscoveryYAML: buildTransitDiscoveryFixture(nil, nil),
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
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "none",
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
				Mode:                  "chain",
				TargetName:            &chainTarget,
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing Copy",
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

func TestRenderCompleteConfig_AppendsServerAggregationGroup(t *testing.T) {
	chainTarget := "🇭🇰 香港节点"
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: HK Landing, type: ss}\n",
		TransitDiscoveryYAML: buildTransitDiscoveryFixture([]string{"- {name: transit-a, type: ss}"}, map[string]string{
			"🇭🇰 香港节点": "transit-a",
		}),
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: HK Landing, type: ss, server: landing.example.com, port: 443, dialer-proxy: transit-a}",
			"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
			"- {name: transit-a, type: ss, server: transit.example.com, port: 443}",
			"proxy-groups:",
			"  - name: 🇭🇰 香港节点",
			"    type: url-test",
			"    proxies:",
			"      - HK Landing",
			"      - HK Landing Copy",
			"      - transit-a",
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
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "chain",
					TargetName:            &chainTarget,
				},
				{
					RowID:                 "hk-2",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing Copy",
					Mode:                  "none",
				},
			},
			ServerAggregationGroups: []ServerAggregationGroup{{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1", "hk-2"},
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	if !strings.Contains(rendered, "  - name: landing.example.com\n    type: fallback") {
		t.Fatalf("rendered config is missing server aggregation group:\n%s", rendered)
	}
	if !strings.Contains(rendered, "      - HK Landing\n      - HK Landing Copy") {
		t.Fatalf("rendered config is missing server aggregation group members:\n%s", rendered)
	}
	if !strings.Contains(rendered, "    timeout: 500\n    max-failed-times: 1") {
		t.Fatalf("rendered config is missing server aggregation fast-fail profile:\n%s", rendered)
	}
}

func TestRenderCompleteConfig_AppliesSwitchOptimizationOverrides(t *testing.T) {
	chainTarget := "🇭🇰 香港节点"
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: HK Landing, type: ss}\n",
		TransitDiscoveryYAML: buildTransitDiscoveryFixture([]string{"- {name: transit-a, type: ss}"}, map[string]string{
			"🇭🇰 香港节点": "transit-a",
		}),
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
			"- {name: transit-a, type: ss, server: transit.example.com, port: 443}",
			"proxy-groups:",
			"  - name: 🇭🇰 香港节点",
			"    type: url-test",
			"    url: https://example.com/original",
			"    interval: 300",
			"    tolerance: 50",
			"    proxies:",
			"      - HK Landing",
			"      - transit-a",
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
			ChainProxyTargetGroupSwitchOptimizationEnabled: true,
			Rows: []Stage2Row{{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "chain",
				TargetName:            &chainTarget,
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	for _, want := range []string{
		"    interval: 300",
		"    timeout: 500",
		"    max-failed-times: 1",
		"    tolerance: 50",
	} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered config is missing switch optimization override %q:\n%s", want, rendered)
		}
	}
	for _, absent := range []string{
		"    interval: 60",
		"    lazy: false",
	} {
		if strings.Contains(rendered, absent) {
			t.Fatalf("rendered config should not include switch optimization field %q:\n%s", absent, rendered)
		}
	}
	if !strings.Contains(rendered, "    url: https://example.com/original") {
		t.Fatalf("rendered config should preserve template health check url:\n%s", rendered)
	}
}

func TestRenderCompleteConfig_UnescapesYAMLUnicodeEscapesInRenderedOutput(t *testing.T) {
	fixtures := singleLandingFixture("US Landing", "ss", "🇺🇸 美国节点")
	fixtures.FullBaseYAML = strings.Replace(
		fixtures.FullBaseYAML,
		"      - transit-a",
		"      - \\U0001F1FA\\U0001F1F8 US Relay",
		1,
	)

	rendered, err := RenderCompleteConfig(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{{
				RowID:                 "us-1",
				SourceLandingNodeName: "US Landing",
				ProxyName:             "US Landing",
				Mode:                  "none",
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	if !strings.Contains(rendered, "🇺🇸 US Relay") {
		t.Fatalf("rendered config should include unescaped emoji member:\n%s", rendered)
	}
	if strings.Contains(rendered, `\U0001F1FA`) || strings.Contains(rendered, `\U0001F1F8`) {
		t.Fatalf("rendered config should not contain uppercase unicode escapes:\n%s", rendered)
	}
}

func TestRenderCompleteConfig_AppliesSwitchOptimizationAndServerAggregation(t *testing.T) {
	chainTarget := "🇭🇰 香港节点"
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: HK Landing, type: ss}\n",
		TransitDiscoveryYAML: buildTransitDiscoveryFixture([]string{"- {name: transit-a, type: ss}"}, map[string]string{
			"🇭🇰 香港节点": "transit-a",
		}),
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: HK Landing, type: ss, server: landing.example.com, port: 443, dialer-proxy: transit-a}",
			"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
			"- {name: transit-a, type: ss, server: transit.example.com, port: 443}",
			"proxy-groups:",
			"  - name: 🇭🇰 香港节点",
			"    type: url-test",
			"    url: https://example.com/original",
			"    interval: 300",
			"    tolerance: 50",
			"    proxies:",
			"      - HK Landing",
			"      - HK Landing Copy",
			"      - transit-a",
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
			ChainProxyTargetGroupSwitchOptimizationEnabled: true,
			Rows: []Stage2Row{
				{
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "chain",
					TargetName:            &chainTarget,
				},
				{
					RowID:                 "hk-2",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing Copy",
					Mode:                  "none",
				},
			},
			ServerAggregationGroups: []ServerAggregationGroup{{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1", "hk-2"},
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	for _, want := range []string{
		"  - name: 🇭🇰 香港节点",
		"    interval: 300",
		"    timeout: 500",
		"    max-failed-times: 1",
		"    tolerance: 50",
		"  - name: landing.example.com",
		"    type: fallback",
		"    interval: 300",
		"    timeout: 500",
		"    max-failed-times: 1",
		"      - HK Landing",
		"      - HK Landing Copy",
	} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered config is missing expected content %q:\n%s", want, rendered)
		}
	}
	for _, absent := range []string{
		"    interval: 60",
		"    lazy: false",
	} {
		if strings.Contains(rendered, absent) {
			t.Fatalf("rendered config should not include removed managed field %q:\n%s", absent, rendered)
		}
	}

	regionTailIndex := strings.Index(rendered, "  - name: 🇰🇷 韩国节点")
	aggregationIndex := strings.Index(rendered, "  - name: landing.example.com")
	if regionTailIndex < 0 || aggregationIndex < 0 || regionTailIndex > aggregationIndex {
		t.Fatalf("server aggregation group should be appended after existing region groups:\n%s", rendered)
	}
}

func TestRenderCompleteConfig_ExplicitRenameOverridesRegionEmojiRules(t *testing.T) {
	enabled := true
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: Alpha-SS-sdgfa, type: ss}\n",
		TransitDiscoveryYAML: buildTransitDiscoveryFixture([]string{"- {name: transit-sg, type: ss}"}, map[string]string{
			"🇸🇬 新加坡节点": "transit-sg",
		}),
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: Alpha-SS-sdgfa, type: ss, server: landing.example.com, port: 443}",
			"- {name: transit-sg, type: ss, server: transit.example.com, port: 443}",
			"proxy-groups:",
			"  - name: 🇸🇬 新加坡节点",
			"    type: fallback",
			"    proxies:",
			"      - transit-sg",
			"",
		}, "\n"),
		TemplateConfig: "custom_proxy_group=🇸🇬 新加坡节点`fallback`(SG|Singapore|Alpha)\n",
	}

	stage2Init, err := BuildStage2Init(Stage1Input{
		AdvancedOptions: AdvancedOptions{Emoji: &enabled},
	}, fixtures)
	if err != nil {
		t.Fatalf("BuildStage2Init() error = %v", err)
	}
	if len(stage2Init.Rows) != 1 {
		t.Fatalf("expected 1 row, got %d", len(stage2Init.Rows))
	}

	customName := "🇸🇬 Alpha-SS-sdgfa-手工"
	chainTarget := "🇸🇬 新加坡节点"
	rendered, err := RenderCompleteConfig(
		Stage1Input{
			AdvancedOptions: AdvancedOptions{Emoji: &enabled},
		},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 stage2Init.Rows[0].RowID,
					SourceLandingNodeName: stage2Init.Rows[0].SourceLandingNodeName,
					ProxyName:             customName,
					Mode:                  "chain",
					TargetName:            &chainTarget,
				},
			},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	if !strings.Contains(rendered, "name: "+customName) {
		t.Fatalf("rendered config should keep explicit stage2 rename:\n%s", rendered)
	}
}

func TestRenderCompleteConfig_StripsLandingFromNonRegionURLTestAndSmartGroups(t *testing.T) {
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: HK Landing, type: ss}\n",
		TransitDiscoveryYAML: buildTransitDiscoveryFixture(nil, nil),
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
			"- {name: transit-a, type: ss, server: transit.example.com, port: 443}",
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
			"  - name: ♻️ 自动选择",
			"    type: url-test",
			"    proxies:",
			"      - HK Landing",
			"      - transit-a",
			"  - name: 🧠 Smart Group",
			"    type: smart",
			"    proxies:",
			"      - HK Landing",
			"      - transit-a",
			"  - name: 💬 即时通讯",
			"    type: select",
			"    proxies:",
			"      - HK Landing",
			"      - transit-a",
			"  - name: 🛟 Fallback Pool",
			"    type: fallback",
			"    proxies:",
			"      - HK Landing",
			"      - transit-a",
			"",
		}, "\n"),
		TemplateConfig: defaultRegionConfig,
	}

	rendered, err := RenderCompleteConfig(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "none",
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	for _, want := range []string{
		strings.Join([]string{
			"  - name: ♻️ 自动选择",
			"    type: url-test",
			"    proxies:",
			"      - transit-a",
		}, "\n"),
		strings.Join([]string{
			"  - name: 🧠 Smart Group",
			"    type: smart",
			"    proxies:",
			"      - transit-a",
		}, "\n"),
		strings.Join([]string{
			"  - name: 💬 即时通讯",
			"    type: select",
			"    proxies:",
			"      - HK Landing",
			"      - transit-a",
		}, "\n"),
		strings.Join([]string{
			"  - name: 🛟 Fallback Pool",
			"    type: fallback",
			"    proxies:",
			"      - HK Landing",
			"      - transit-a",
		}, "\n"),
	} {
		if !strings.Contains(rendered, want) {
			t.Fatalf("rendered config mismatch for strip targets:\nwant block:\n%s\ngot:\n%s", want, rendered)
		}
	}
}

func TestRenderCompleteConfig_KeepsLandingMembersInManagedURLTestAggregation(t *testing.T) {
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: "proxies:\n- {name: HK Landing, type: ss}\n",
		TransitDiscoveryYAML: buildTransitDiscoveryFixture(nil, nil),
		FullBaseYAML: strings.Join([]string{
			"proxies:",
			"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
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
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "none",
				},
				{
					RowID:                 "hk-2",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing Copy",
					Mode:                  "none",
				},
			},
			ServerAggregationGroups: []ServerAggregationGroup{{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "url-test",
				MemberRowIDs: []string{"hk-1", "hk-2"},
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("RenderCompleteConfig() error = %v", err)
	}

	if strings.Contains(rendered, "  - name: 🇭🇰 香港节点\n    type: url-test\n    proxies:\n      - HK Landing") ||
		strings.Contains(rendered, "  - name: 🇭🇰 香港节点\n    type: url-test\n    proxies:\n      - HK Landing Copy") {
		t.Fatalf("region url-test group should strip all landing members:\n%s", rendered)
	}
	if !strings.Contains(rendered, "  - name: landing.example.com\n    type: url-test\n    url: https://cp.cloudflare.com/generate_204\n    interval: 300\n    timeout: 500\n    max-failed-times: 1\n    proxies:\n      - HK Landing\n      - HK Landing Copy") {
		t.Fatalf("managed url-test aggregation must keep landing members:\n%s", rendered)
	}
}

func TestStripLandingNodesFromProxyGroups_ExcludesManagedAggregationNames(t *testing.T) {
	fullYAML := strings.Join([]string{
		"proxies:",
		"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: landing.example.com",
		"    type: url-test",
		"    proxies:",
		"      - HK Landing",
		"  - name: ♻️ 自动选择",
		"    type: url-test",
		"    proxies:",
		"      - HK Landing",
		"",
	}, "\n")

	landingNames := map[string]struct{}{"HK Landing": {}}
	excluded := map[string]struct{}{"landing.example.com": {}}

	rendered, err := rewriteCompleteConfigYAML(fullYAML, func(root *yaml.Node, lines []string, deletedLines map[int]struct{}, replacedLines map[int]string) error {
		return stripLandingNodesFromProxyGroups(root, landingNames, nil, excluded, deletedLines)
	})
	if err != nil {
		t.Fatalf("rewriteCompleteConfigYAML() error = %v", err)
	}

	if !strings.Contains(rendered, "  - name: landing.example.com\n    type: url-test\n    proxies:\n      - HK Landing") {
		t.Fatalf("excluded aggregation group should keep landing member:\n%s", rendered)
	}
	if !strings.Contains(rendered, "  - name: ♻️ 自动选择\n    type: url-test\n    proxies:") {
		t.Fatalf("non-excluded url-test group should remain:\n%s", rendered)
	}
	if strings.Contains(rendered, "  - name: ♻️ 自动选择\n    type: url-test\n    proxies:\n      - HK Landing") {
		t.Fatalf("non-excluded url-test group should strip landing member:\n%s", rendered)
	}
}
