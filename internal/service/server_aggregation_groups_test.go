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
	if !strings.Contains(rendered, "  - name: srv:landing.example.com\n    type: fallback") {
		t.Fatalf("rendered config is missing managed server aggregation group:\n%s", rendered)
	}
	if strings.Index(rendered, "  - name: srv:landing.example.com") < strings.Index(rendered, "  - name: Existing Group") {
		t.Fatalf("managed group should be appended after existing proxy-groups:\n%s", rendered)
	}
}
