package service

import "strings"

// CanonicalizeStage2SnapshotForLinkEncoding produces the v5 encoding-form tree:
// - strip instanceId (never serialized on wire)
// - enabled=false aggregation -> {enabled:false} only
// - enabled=true fallback: memberProxyNames panel order
// - enabled=true non-fallback: memberProxyNames from DFS presentation order
func CanonicalizeStage2SnapshotForLinkEncoding(snapshot Stage2Snapshot) Stage2Snapshot {
	snapshot = NormalizeStage2Snapshot(snapshot)
	out := Stage2Snapshot{
		ChainProxyTargetGroupSwitchOptimizationEnabled: snapshot.ChainProxyTargetGroupSwitchOptimizationEnabled,
		Servers: make([]Stage2SnapshotServer, 0, len(snapshot.Servers)),
	}
	for _, server := range snapshot.Servers {
		encodedServer := Stage2SnapshotServer{
			ServerKey: strings.TrimSpace(server.ServerKey),
			Sources:   make([]Stage2SnapshotSource, 0, len(server.Sources)),
		}
		if !server.Aggregation.Enabled {
			encodedServer.Aggregation = Stage2Aggregation{Enabled: false}
		} else {
			agg := Stage2Aggregation{
				Enabled:   true,
				GroupName: strings.TrimSpace(server.Aggregation.GroupName),
				Strategy:  strings.TrimSpace(server.Aggregation.Strategy),
			}
			memberProxyNames := append([]string(nil), server.Aggregation.MemberProxyNames...)
			if agg.Strategy != "fallback" {
				memberProxyNames = DFSMemberProxyNames(server, memberProxyNames)
			}
			agg.MemberProxyNames = memberProxyNames
			encodedServer.Aggregation = agg
		}
		for _, source := range server.Sources {
			encodedSource := Stage2SnapshotSource{
				SourceID:  strings.TrimSpace(source.SourceID),
				Instances: make([]Stage2Instance, 0, len(source.Instances)),
			}
			for _, inst := range source.Instances {
				encodedInst := Stage2Instance{
					ProxyName:  strings.TrimSpace(inst.ProxyName),
					Mode:       strings.TrimSpace(inst.Mode),
					TargetName: inst.TargetName,
				}
				if encodedInst.TargetName != nil {
					trimmed := strings.TrimSpace(*encodedInst.TargetName)
					if trimmed == "" {
						encodedInst.TargetName = nil
					} else {
						encodedInst.TargetName = &trimmed
					}
				}
				encodedSource.Instances = append(encodedSource.Instances, encodedInst)
			}
			encodedServer.Sources = append(encodedServer.Sources, encodedSource)
		}
		out.Servers = append(out.Servers, encodedServer)
	}
	return out
}

func RestoreStage2SnapshotFromEncoding(snapshot Stage2Snapshot) Stage2Snapshot {
	snapshot = NormalizeStage2Snapshot(snapshot)
	for si := range snapshot.Servers {
		server := &snapshot.Servers[si]
		if !server.Aggregation.Enabled {
			server.Aggregation = Stage2Aggregation{Enabled: false}
		}
	}
	return snapshot
}
