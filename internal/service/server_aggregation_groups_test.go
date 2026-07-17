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
				SourceLandingNodeName: "HK Landing",
				ProxyName:       "HK Landing",
				Server:          "landing.example.com",
			},
			{
				RowID:           "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:       "HK Landing Copy",
				Server:          "landing.example.com",
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
				SourceLandingNodeName: "HK Landing",
				ProxyName:       "HK Landing",
				Server:          "landing.example.com",
			},
			{
				RowID:           "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:       "HK Landing Copy",
				Server:          "landing.example.com",
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
		"    interval: 300",
		"    timeout: 1000",
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
				SourceLandingNodeName: "HK 按延迟分组",
				ProxyName:             "HK 按延迟分组",
				Server:                "landing.example.com",
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing Copy",
				Server:                "landing.example.com",
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
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "🇭🇰 HK Landing",
				ProxyName:             "🇭🇰 HK Landing Copy",
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
				SourceLandingNodeName: "HK Landing Renamed",
				ProxyName:             "HK Landing Renamed",
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing Copy",
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
					},
					{
						RowID:                 "hk-2",
						SourceLandingNodeName: "HK Landing",
						ProxyName:             "HK Landing Copy",
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

func TestAppendServerAggregationGroupsToCompleteConfigYAML_InjectsAggregationIntoSelectGroups(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
		"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: 💬 即时通讯",
		"    type: select",
		"    proxies:",
		"      - HK Landing",
		"      - HK Landing Copy",
		"  - name: Existing Fallback",
		"    type: fallback",
		"    proxies:",
		"      - HK Landing",
		"      - HK Landing Copy",
		"",
	}, "\n")

	snapshot := aggregationInjectionTestSnapshot("landing.example.com", "hk-1", "hk-2")

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	expectedSelectBlock := strings.Join([]string{
		"  - name: 💬 即时通讯",
		"    type: select",
		"    proxies:",
		"      - landing.example.com",
		"      - HK Landing",
		"      - HK Landing Copy",
	}, "\n")
	if !strings.Contains(rendered, expectedSelectBlock) {
		t.Fatalf("select group should have aggregation prepended:\n%s", rendered)
	}

	expectedFallbackBlock := strings.Join([]string{
		"  - name: Existing Fallback",
		"    type: fallback",
		"    proxies:",
		"      - HK Landing",
		"      - HK Landing Copy",
	}, "\n")
	if !strings.Contains(rendered, expectedFallbackBlock) {
		t.Fatalf("fallback group should remain unchanged:\n%s", rendered)
	}
}

func TestAppendServerAggregationGroupsToCompleteConfigYAML_ExcludesDirectSelectGroups(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
		"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: 🎯 全球直连",
		"    type: select",
		"    proxies:",
		"      - DIRECT",
		"  - name: Direct Route",
		"    type: select",
		"    proxies:",
		"      - DIRECT",
		"  - name: 💬 即时通讯",
		"    type: select",
		"    proxies:",
		"      - HK Landing",
		"",
	}, "\n")

	snapshot := aggregationInjectionTestSnapshot("landing.example.com", "hk-1", "hk-2")

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	expectedDirectBlocks := []string{
		strings.Join([]string{
			"  - name: 🎯 全球直连",
			"    type: select",
			"    proxies:",
			"      - DIRECT",
		}, "\n"),
		strings.Join([]string{
			"  - name: Direct Route",
			"    type: select",
			"    proxies:",
			"      - DIRECT",
		}, "\n"),
	}
	for _, block := range expectedDirectBlocks {
		if !strings.Contains(rendered, block) {
			t.Fatalf("direct-excluded select group should remain unchanged:\n%s", rendered)
		}
	}

	if !strings.Contains(rendered, "      - landing.example.com\n      - HK Landing") {
		t.Fatalf("non-direct select group should still receive aggregation injection:\n%s", rendered)
	}
}

func TestAppendServerAggregationGroupsToCompleteConfigYAML_InjectsMultipleAggregationsInSnapshotOrder(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK Landing, type: ss, server: landing-a.example.com, port: 443}",
		"- {name: SG Landing, type: ss, server: landing-b.example.com, port: 443}",
		"proxy-groups:",
		"  - name: 💬 即时通讯",
		"    type: select",
		"    proxies:",
		"      - HK Landing",
		"      - SG Landing",
		"",
	}, "\n")

	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
			},
			{
				RowID:                 "sg-1",
				SourceLandingNodeName: "SG Landing",
				ProxyName:             "SG Landing",
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "landing-a.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1"},
			},
			{
				Server:       "landing-b.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"sg-1"},
			},
		},
	}

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	expectedSelectBlock := strings.Join([]string{
		"  - name: 💬 即时通讯",
		"    type: select",
		"    proxies:",
		"      - landing-a.example.com",
		"      - landing-b.example.com",
		"      - HK Landing",
		"      - SG Landing",
	}, "\n")
	if !strings.Contains(rendered, expectedSelectBlock) {
		t.Fatalf("multiple aggregations should be prepended in snapshot order:\n%s", rendered)
	}
}

func TestAppendServerAggregationGroupsToCompleteConfigYAML_MovesDuplicateAggregationMemberToFront(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
		"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: 💬 即时通讯",
		"    type: select",
		"    proxies:",
		"      - HK Landing",
		"      - landing.example.com",
		"      - HK Landing Copy",
		"",
	}, "\n")

	snapshot := aggregationInjectionTestSnapshot("landing.example.com", "hk-1", "hk-2")

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	expectedSelectBlock := strings.Join([]string{
		"  - name: 💬 即时通讯",
		"    type: select",
		"    proxies:",
		"      - landing.example.com",
		"      - HK Landing",
		"      - HK Landing Copy",
	}, "\n")
	if !strings.Contains(rendered, expectedSelectBlock) {
		t.Fatalf("duplicate aggregation member should move to front without duplication:\n%s", rendered)
	}
}

func TestAppendServerAggregationGroupsToCompleteConfigYAML_NoEnabledGroupsSkipsInjection(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: 💬 即时通讯",
		"    type: select",
		"    proxies:",
		"      - HK Landing",
		"",
	}, "\n")

	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "landing.example.com",
				Enabled:      false,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1"},
			},
		},
	}

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	if rendered != fullYAML {
		t.Fatalf("disabled aggregation groups should leave YAML unchanged:\n%s", rendered)
	}
}

func TestAppendServerAggregationGroupsToCompleteConfigYAML_DoesNotInjectIntoManagedAggregationGroup(t *testing.T) {
	fullYAML := strings.Join([]string{
		"mixed-port: 7890",
		"proxies:",
		"- {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
		"- {name: HK Landing Copy, type: ss, server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: 💬 即时通讯",
		"    type: select",
		"    proxies:",
		"      - HK Landing",
		"",
	}, "\n")

	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing Copy",
			},
		},
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "select",
				MemberRowIDs: []string{"hk-1", "hk-2"},
			},
		},
	}

	rendered, err := appendServerAggregationGroupsToCompleteConfigYAML(fullYAML, snapshot)
	if err != nil {
		t.Fatalf("appendServerAggregationGroupsToCompleteConfigYAML() error = %v", err)
	}

	expectedManagedGroupBlock := strings.Join([]string{
		"  - name: landing.example.com",
		"    type: select",
		"    proxies:",
		"      - HK Landing",
		"      - HK Landing Copy",
	}, "\n")
	if !strings.Contains(rendered, expectedManagedGroupBlock) {
		t.Fatalf("managed select aggregation group should only contain node members:\n%s", rendered)
	}
}

func aggregationInjectionTestSnapshot(server string, memberRowIDs ...string) Stage2Snapshot {
	rows := make([]Stage2Row, 0, len(memberRowIDs))
	for index, memberRowID := range memberRowIDs {
		proxyName := "HK Landing"
		if index == 1 {
			proxyName = "HK Landing Copy"
		}
		rows = append(rows, Stage2Row{
			RowID:                 memberRowID,
			SourceLandingNodeName: proxyName,
			ProxyName:             proxyName,
			Server:                server,
		})
	}
	return Stage2Snapshot{
		Rows: rows,
		ServerAggregationGroups: []ServerAggregationGroup{
			{
				Server:       server,
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: memberRowIDs,
			},
		},
	}
}
