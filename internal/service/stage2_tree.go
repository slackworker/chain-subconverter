package service

import "strings"

// Stage2InstanceRef is a flattened view of one nested instance for validation/render.
type Stage2InstanceRef struct {
	ServerKey   string
	SourceID    string
	Instance    Stage2Instance
	ServerIdx   int
	SourceIdx   int
	InstanceIdx int
}

func NormalizeStage2Snapshot(snapshot Stage2Snapshot) Stage2Snapshot {
	if len(snapshot.Servers) == 0 && len(snapshot.Rows) > 0 {
		snapshot = SnapshotFromLegacyRows(snapshot.Rows, snapshot.ServerAggregationGroups, snapshot.ChainProxyTargetGroupSwitchOptimizationEnabled)
	}
	if snapshot.Servers == nil {
		snapshot.Servers = []Stage2SnapshotServer{}
	}
	snapshot.Rows = nil
	snapshot.ServerAggregationGroups = nil
	return trimStage2Snapshot(snapshot)
}

func trimStage2Snapshot(snapshot Stage2Snapshot) Stage2Snapshot {
	for si := range snapshot.Servers {
		server := &snapshot.Servers[si]
		server.ServerKey = strings.TrimSpace(server.ServerKey)
		for so := range server.Sources {
			source := &server.Sources[so]
			source.SourceID = strings.TrimSpace(source.SourceID)
			for ii := range source.Instances {
				inst := &source.Instances[ii]
				inst.ProxyName = strings.TrimSpace(inst.ProxyName)
				inst.InstanceID = ""
				if inst.TargetName != nil {
					trimmed := strings.TrimSpace(*inst.TargetName)
					if trimmed == "" {
						inst.TargetName = nil
					} else {
						inst.TargetName = &trimmed
					}
				}
			}
		}
		agg := &server.Aggregation
		if !agg.Enabled {
			server.Aggregation = Stage2Aggregation{Enabled: false}
			continue
		}
		agg.GroupName = strings.TrimSpace(agg.GroupName)
		agg.Strategy = strings.TrimSpace(agg.Strategy)
		agg.MemberProxyNames = dedupeTrimmedStrings(agg.MemberProxyNames)
	}
	return snapshot
}

func dedupeTrimmedStrings(values []string) []string {
	out := make([]string, 0, len(values))
	seen := map[string]struct{}{}
	for _, value := range values {
		value = strings.TrimSpace(value)
		if value == "" {
			continue
		}
		if _, ok := seen[value]; ok {
			continue
		}
		seen[value] = struct{}{}
		out = append(out, value)
	}
	return out
}

func FlattenStage2Instances(snapshot Stage2Snapshot) []Stage2InstanceRef {
	out := make([]Stage2InstanceRef, 0)
	for si, server := range snapshot.Servers {
		for so, source := range server.Sources {
			for ii, inst := range source.Instances {
				out = append(out, Stage2InstanceRef{
					ServerKey:   server.ServerKey,
					SourceID:    source.SourceID,
					Instance:    inst,
					ServerIdx:   si,
					SourceIdx:   so,
					InstanceIdx: ii,
				})
			}
		}
	}
	return out
}

func CollectStage2ProxyNames(snapshot Stage2Snapshot) []string {
	refs := FlattenStage2Instances(snapshot)
	names := make([]string, 0, len(refs))
	for _, ref := range refs {
		names = append(names, strings.TrimSpace(ref.Instance.ProxyName))
	}
	return names
}

func CollectStage2SourceIDs(snapshot Stage2Snapshot) []string {
	seen := map[string]struct{}{}
	out := make([]string, 0)
	for _, server := range snapshot.Servers {
		for _, source := range server.Sources {
			id := strings.TrimSpace(source.SourceID)
			if id == "" {
				continue
			}
			if _, ok := seen[id]; ok {
				continue
			}
			seen[id] = struct{}{}
			out = append(out, id)
		}
	}
	return out
}

func FindCatalogSource(catalog Stage2Catalog, sourceID string) (Stage2CatalogSource, string, bool) {
	sourceID = strings.TrimSpace(sourceID)
	for _, server := range catalog.Servers {
		for _, source := range server.Sources {
			if strings.TrimSpace(source.SourceID) == sourceID {
				return source, server.ServerKey, true
			}
		}
	}
	return Stage2CatalogSource{}, "", false
}

func DefaultSnapshotFromCatalog(catalog Stage2Catalog) Stage2Snapshot {
	servers := make([]Stage2SnapshotServer, 0, len(catalog.Servers))
	for _, catServer := range catalog.Servers {
		sources := make([]Stage2SnapshotSource, 0, len(catServer.Sources))
		for _, catSource := range catServer.Sources {
			proxyName := strings.TrimSpace(catSource.DefaultProxyName)
			sourceID := strings.TrimSpace(catSource.SourceID)
			sources = append(sources, Stage2SnapshotSource{
				SourceID: sourceID,
				Instances: []Stage2Instance{{
					ProxyName:  proxyName,
					Mode:       catSource.DefaultMode,
					TargetName: catSource.DefaultTargetName,
				}},
			})
		}
		servers = append(servers, Stage2SnapshotServer{
			ServerKey:   catServer.ServerKey,
			Aggregation: Stage2Aggregation{Enabled: false},
			Sources:     sources,
		})
	}
	return Stage2Snapshot{
		ChainProxyTargetGroupSwitchOptimizationEnabled: false,
		Servers: servers,
	}
}

func DFSMemberProxyNames(server Stage2SnapshotServer, memberProxyNames []string) []string {
	wanted := map[string]struct{}{}
	for _, name := range memberProxyNames {
		name = strings.TrimSpace(name)
		if name != "" {
			wanted[name] = struct{}{}
		}
	}
	out := make([]string, 0, len(wanted))
	seen := map[string]struct{}{}
	for _, source := range server.Sources {
		for _, inst := range source.Instances {
			name := strings.TrimSpace(inst.ProxyName)
			if _, ok := wanted[name]; !ok {
				continue
			}
			if _, dup := seen[name]; dup {
				continue
			}
			seen[name] = struct{}{}
			out = append(out, name)
		}
	}
	return out
}
