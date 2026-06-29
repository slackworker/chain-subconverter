package service

import (
	"strings"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestAppendServerAggregationGroupsToCompleteConfigYAML_ProxyGroupsAtEnd(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
		"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: Existing Group",
		"    type: fallback",
		"    proxies:",
		"      - HK Landing",
		"      - HK Landing Copy",
		"",
	}, "\n")

	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:           "hk-1",
				ProxyName:       "HK Landing",
				LandingNodeName: "HK Landing",
			},
			{
				RowID:           "hk-2",
				ProxyName:       "HK Landing Copy",
				LandingNodeName: "HK Landing Copy",
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1", "hk-2"},
			},
		},
	}

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	var parsed yaml.Node
	if err := yaml.Unmarshal([]byte(rendered), &parsed); err != nil {
		t.Fatalf("rendered YAML is invalid: %v\n%s", err, rendered)
	}

	existingGroupBlock := strings.Join([]string{
		"  - name: Existing Group",
		"    type: fallback",
		"    proxies:",
		"      - HK Landing",
		"      - HK Landing Copy",
	}, "\n")
	if !strings.Contains(rendered, existingGroupBlock) {
		t.Fatalf("existing proxy-group block should stay intact:\n%s", rendered)
	}
	if !strings.Contains(rendered, "  - name: landing.example.com\n    type: fallback") {
		t.Fatalf("rendered config is missing managed server aggregation group:\n%s", rendered)
	}
	if strings.Index(rendered, "  - name: landing.example.com") < strings.Index(rendered, "  - name: Existing Group") {
		t.Fatalf("managed group should be appended after existing proxy-groups:\n%s", rendered)
	}
}

func TestAppendServerAggregationGroupsToCompleteConfigYAML_DeduplicatesMembersByRowID(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
		"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: Existing Group",
		"    type: fallback",
		"    proxies:",
		"      - HK Landing",
		"      - HK Landing Copy",
		"",
	}, "\n")

	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:           "hk-1",
				ProxyName:       "HK Landing",
				LandingNodeName: "HK Landing",
			},
			{
				RowID:           "hk-2",
				ProxyName:       "HK Landing Copy",
				LandingNodeName: "HK Landing Copy",
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1", "hk-2", "hk-1"},
			},
		},
	}

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	expectedManagedGroupMembers := strings.Join([]string{
		"  - name: landing.example.com",
		"    type: fallback",
		"    url: https://cp.cloudflare.com/generate_204",
		"    interval: 60",
		"    timeout: 500",
		"    lazy: false",
		"    max-failed-times: 1",
		"    proxies:",
		"      - HK Landing",
		"      - HK Landing Copy",
	}, "\n")
	if !strings.Contains(rendered, expectedManagedGroupMembers) {
		t.Fatalf("managed group members should be deduplicated while preserving first-seen order:\n%s", rendered)
	}
	if strings.Count(rendered, "      - HK Landing\n") != 2 {
		t.Fatalf("expected HK Landing to appear once in existing group and once in managed group:\n%s", rendered)
	}
}

func TestAppendServerAggregationGroupsToCompleteConfigYAML_PrefersFrontEndEditedServerGroupName(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK 按延迟分组, type: ss, server: landing.example.com, port: 443}",
		"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: Existing Group",
		"    type: fallback",
		"    proxies:",
		"      - HK 按延迟分组",
		"      - HK Landing Copy",
		"",
	}, "\n")

	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK 按延迟分组",
				LandingNodeName:       "HK 按延迟分组",
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing Copy",
				LandingNodeName:       "HK Landing Copy",
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "landing.example.com",
				GroupName:    "HK 按延迟分组",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1", "hk-2"},
			},
		},
	}

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	if !strings.Contains(rendered, "  - name: HK 按延迟分组\n    type: fallback") {
		t.Fatalf("rendered config should prefer front-end edited group name:\n%s", rendered)
	}
}

func TestAppendServerAggregationGroupsToCompleteConfigYAML_UsesEmojiServerDefaultName(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: 🇭🇰 HK Landing, type: ss, server: landing.example.com, port: 443}",
		"- {name: 🇭🇰 HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: Existing Group",
		"    type: fallback",
		"    proxies:",
		"      - 🇭🇰 HK Landing",
		"      - 🇭🇰 HK Landing Copy",
		"",
	}, "\n")

	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "🇭🇰 HK Landing",
				SourceLandingNodeName: "🇭🇰 HK Landing",
				ProxyName:             "🇭🇰 HK Landing",
				LandingNodeName:       "🇭🇰 HK Landing",
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "🇭🇰 HK Landing",
				ProxyName:             "🇭🇰 HK Landing Copy",
				LandingNodeName:       "🇭🇰 HK Landing Copy",
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"🇭🇰 HK Landing", "hk-2"},
			},
		},
	}

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	if !strings.Contains(rendered, "  - name: 🇭🇰 landing.example.com\n    type: fallback") {
		t.Fatalf("rendered config should use emoji+server as default name:\n%s", rendered)
	}
}

func TestAppendServerAggregationGroupsToCompleteConfigYAML_DefaultNameIgnoresAnchorProxyName(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK Landing Renamed, type: ss, server: landing.example.com, port: 443}",
		"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: Existing Group",
		"    type: fallback",
		"    proxies:",
		"      - HK Landing Renamed",
		"      - HK Landing Copy",
		"",
	}, "\n")

	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing Renamed",
				LandingNodeName:       "HK Landing Renamed",
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing Copy",
				LandingNodeName:       "HK Landing Copy",
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1", "hk-2"},
			},
		},
	}

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	if !strings.Contains(rendered, "  - name: landing.example.com\n    type: fallback") {
		t.Fatalf("rendered config should ignore anchor proxyName when groupName is empty:\n%s", rendered)
	}
}

func TestAppendServerAggregationGroupsToCompleteConfigYAML_RendersExtendedStrategyTypes(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
		"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: Existing Group",
		"    type: fallback",
		"    proxies:",
		"      - HK Landing",
		"      - HK Landing Copy",
		"",
	}, "\n")

	strategies := []string{"select", "load-balance"}
	for _, strategy := range strategies {
		t.Run(strategy, func(t *testing.T) {
			snapshot := Stage2Snapshot{
				Rows: []Stage2Row{
					{
						RowID:                 "hk-1",
						SourceLandingNodeName: "HK Landing",
						ProxyName:             "HK Landing",
						LandingNodeName:       "HK Landing",
					},
					{
						RowID:                 "hk-2",
						SourceLandingNodeName: "HK Landing",
						ProxyName:             "HK Landing Copy",
						LandingNodeName:       "HK Landing Copy",
					},
				},
				ServerAggregationGroups: []ServerAggregationGroup{
					{
						Server:       "landing.example.com",
						Enabled:      true,
						Strategy:     strategy,
						MemberRowIDs: []string{"hk-1", "hk-2"},
					},
				},
			}

			rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
			if err != nil {
				t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
			}
			if !strings.Contains(rendered, "  - name: landing.example.com\n    type: "+strategy) {
				t.Fatalf("rendered config should include managed group strategy %q:\n%s", strategy, rendered)
			}
		})
	}
}
