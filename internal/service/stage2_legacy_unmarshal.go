package service

import (
	"encoding/json"
	"fmt"
	"strings"
)

type legacyStage2SnapshotJSON struct {
	Rows                                           []legacyStage2RowJSON              `json:"rows"`
	Servers                                        []Stage2SnapshotServer             `json:"servers"`
	ChainProxyTargetGroupSwitchOptimizationEnabled bool                               `json:"chainProxyTargetGroupSwitchOptimizationEnabled"`
	ServerAggregationGroups                        []legacyServerAggregationGroupJSON `json:"serverAggregationGroups"`
}

type legacyStage2RowJSON struct {
	RowID                 string  `json:"rowId"`
	SourceLandingNodeName string  `json:"sourceLandingNodeName"`
	ProxyName             string  `json:"proxyName"`
	Mode                  string  `json:"mode"`
	TargetName            *string `json:"targetName"`
	Server                string  `json:"server"`
}

type legacyServerAggregationGroupJSON struct {
	Server       string   `json:"server"`
	GroupName    string   `json:"groupName"`
	Enabled      bool     `json:"enabled"`
	Strategy     string   `json:"strategy"`
	MemberRowIDs []string `json:"memberRowIds"`
}

// UnmarshalJSON accepts nested v5 trees and legacy flat rows+groups fixtures.
func (snapshot *Stage2Snapshot) UnmarshalJSON(data []byte) error {
	var legacy legacyStage2SnapshotJSON
	if err := json.Unmarshal(data, &legacy); err != nil {
		return err
	}
	if len(legacy.Servers) > 0 {
		*snapshot = Stage2Snapshot{
			ChainProxyTargetGroupSwitchOptimizationEnabled: legacy.ChainProxyTargetGroupSwitchOptimizationEnabled,
			Servers: legacy.Servers,
		}
		*snapshot = NormalizeStage2Snapshot(*snapshot)
		return nil
	}
	if len(legacy.Rows) == 0 {
		*snapshot = Stage2Snapshot{
			ChainProxyTargetGroupSwitchOptimizationEnabled: legacy.ChainProxyTargetGroupSwitchOptimizationEnabled,
			Servers: []Stage2SnapshotServer{},
		}
		return nil
	}

	converted, err := convertLegacyFlatSnapshot(legacy)
	if err != nil {
		return err
	}
	*snapshot = converted
	return nil
}

func convertLegacyFlatSnapshot(legacy legacyStage2SnapshotJSON) (Stage2Snapshot, error) {
	// If aggregation groups declare a server, apply it to member rows that omit Server.
	rowServerOverride := map[string]string{}
	for _, group := range legacy.ServerAggregationGroups {
		serverKey := strings.TrimSpace(group.Server)
		if serverKey == "" {
			continue
		}
		for _, rowID := range group.MemberRowIDs {
			rowID = strings.TrimSpace(rowID)
			if rowID != "" {
				rowServerOverride[rowID] = serverKey
			}
		}
	}

	type sourceBucket struct {
		serverKey string
		sourceID  string
		instances []Stage2Instance
	}
	order := make([]string, 0)
	index := map[string]int{}
	buckets := make([]sourceBucket, 0)
	rowIDToProxyName := map[string]string{}
	rowIDToServerKey := map[string]string{}

	for _, row := range legacy.Rows {
		sourceID := strings.TrimSpace(row.SourceLandingNodeName)
		if sourceID == "" {
			sourceID = strings.TrimSpace(row.RowID)
		}
		proxyName := strings.TrimSpace(row.ProxyName)
		if proxyName == "" {
			proxyName = strings.TrimSpace(row.RowID)
		}
		rowID := strings.TrimSpace(row.RowID)
		if rowID == "" {
			rowID = proxyName
		}
		serverKey := strings.TrimSpace(row.Server)
		if serverKey == "" {
			if override, ok := rowServerOverride[rowID]; ok {
				serverKey = override
			} else {
				serverKey = stage2ServerKey("", sourceID)
			}
		}
		rowIDToProxyName[rowID] = proxyName
		rowIDToServerKey[rowID] = serverKey

		key := serverKey + "\x00" + sourceID
		idx, ok := index[key]
		if !ok {
			index[key] = len(buckets)
			order = append(order, key)
			buckets = append(buckets, sourceBucket{serverKey: serverKey, sourceID: sourceID})
			idx = len(buckets) - 1
		}
		buckets[idx].instances = append(buckets[idx].instances, Stage2Instance{
			ProxyName:  proxyName,
			Mode:       row.Mode,
			TargetName: row.TargetName,
		})
	}

	serverOrder := make([]string, 0)
	serverIndex := map[string]int{}
	servers := make([]Stage2SnapshotServer, 0)
	for _, key := range order {
		bucket := buckets[index[key]]
		si, ok := serverIndex[bucket.serverKey]
		if !ok {
			serverIndex[bucket.serverKey] = len(servers)
			serverOrder = append(serverOrder, bucket.serverKey)
			servers = append(servers, Stage2SnapshotServer{
				ServerKey:   bucket.serverKey,
				Aggregation: Stage2Aggregation{Enabled: false},
				Sources:     nil,
			})
			si = len(servers) - 1
		}
		servers[si].Sources = append(servers[si].Sources, Stage2SnapshotSource{
			SourceID:  bucket.sourceID,
			Instances: bucket.instances,
		})
	}
	_ = serverOrder

	for _, group := range legacy.ServerAggregationGroups {
		serverKey := strings.TrimSpace(group.Server)
		si, ok := serverIndex[serverKey]
		if !ok {
			if len(servers) == 1 {
				si = 0
			} else {
				return Stage2Snapshot{}, fmt.Errorf("legacy aggregation server %q not found in rows", serverKey)
			}
		}
		if !group.Enabled {
			servers[si].Aggregation = Stage2Aggregation{Enabled: false}
			continue
		}
		allowed := map[string]struct{}{}
		for _, source := range servers[si].Sources {
			for _, inst := range source.Instances {
				allowed[strings.TrimSpace(inst.ProxyName)] = struct{}{}
			}
		}
		members := make([]string, 0, len(group.MemberRowIDs))
		for _, rowID := range group.MemberRowIDs {
			rowID = strings.TrimSpace(rowID)
			proxyName, ok := rowIDToProxyName[rowID]
			if !ok {
				continue
			}
			proxyName = strings.TrimSpace(proxyName)
			if _, ok := allowed[proxyName]; !ok {
				return Stage2Snapshot{}, fmt.Errorf("legacy aggregation member %q crosses server", rowID)
			}
			members = append(members, proxyName)
		}
		servers[si].Aggregation = Stage2Aggregation{
			Enabled:          true,
			GroupName:        group.GroupName,
			Strategy:         group.Strategy,
			MemberProxyNames: members,
		}
	}

	return NormalizeStage2Snapshot(Stage2Snapshot{
		ChainProxyTargetGroupSwitchOptimizationEnabled: legacy.ChainProxyTargetGroupSwitchOptimizationEnabled,
		Servers: servers,
	}), nil
}
