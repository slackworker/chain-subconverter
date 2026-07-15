package main

import (
	"testing"

	"github.com/slackworker/chain-subconverter/internal/service"
)

func TestNormalizeStage2SnapshotSourceLandingNames(t *testing.T) {
	catalog := []service.Stage2CatalogSource{
		{SourceID: "Alpha-SS-SG", DefaultProxyName: "🇸🇬 Alpha-SS-SG"},
	}

	snapshot := service.Stage2Snapshot{
		Servers: []service.Stage2SnapshotServer{
			{
				ServerKey: "198.51.100.10",
				Aggregation: service.Stage2Aggregation{
					Enabled:  true,
					Strategy: "fallback",
					MemberProxyNames: []string{
						"🇸🇬 Alpha-SS-SG",
						"🇸🇬 Alpha-SS-SG 2",
					},
				},
				Sources: []service.Stage2SnapshotSource{
					{
						SourceID: "🇸🇬 Alpha-SS-SG",
						Instances: []service.Stage2Instance{
							{
								ProxyName: "🇸🇬 Alpha-SS-SG",
								Mode:      "chain",
							},
							{
								ProxyName: "🇸🇬 Alpha-SS-SG 2",
								Mode:      "chain",
							},
						},
					},
				},
			},
		},
	}

	if !normalizeStage2SnapshotSourceLandingNames(&snapshot, catalog) {
		t.Fatal("normalizeStage2SnapshotSourceLandingNames() = false, want true")
	}

	source := snapshot.Servers[0].Sources[0]
	if source.SourceID != "Alpha-SS-SG" {
		t.Fatalf("source.SourceID = %q, want Alpha-SS-SG", source.SourceID)
	}
	if source.Instances[0].ProxyName != "🇸🇬 Alpha-SS-SG" {
		t.Fatalf("instances[0].ProxyName = %q, want 🇸🇬 Alpha-SS-SG", source.Instances[0].ProxyName)
	}

	members := snapshot.Servers[0].Aggregation.MemberProxyNames
	wantMembers := []string{
		"🇸🇬 Alpha-SS-SG",
		"🇸🇬 Alpha-SS-SG 2",
	}
	for i, want := range wantMembers {
		if members[i] != want {
			t.Fatalf("memberProxyNames[%d] = %q, want %q", i, members[i], want)
		}
	}
}

func TestNormalizeStage2SnapshotSourceLandingNamesNoOpWhenAligned(t *testing.T) {
	catalog := []service.Stage2CatalogSource{
		{SourceID: "Alpha-SS-SG", DefaultProxyName: "🇸🇬 Alpha-SS-SG"},
	}
	snapshot := service.Stage2Snapshot{
		Servers: []service.Stage2SnapshotServer{
			{
				Sources: []service.Stage2SnapshotSource{
					{
						SourceID: "Alpha-SS-SG",
						Instances: []service.Stage2Instance{{
							ProxyName: "🇸🇬 Alpha-SS-SG",
							Mode:      "chain",
						}},
					},
				},
			},
		},
	}
	if normalizeStage2SnapshotSourceLandingNames(&snapshot, catalog) {
		t.Fatal("normalizeStage2SnapshotSourceLandingNames() = true, want false")
	}
}
