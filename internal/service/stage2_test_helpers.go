package service

// Test/legacy construction helpers. Prefer nested Stage2Snapshot literals in new code.

type Stage2Row struct {
	RowID                 string
	SourceLandingNodeName string
	ProxyName             string
	Mode                  string
	TargetName            *string
	Server                string
}

type Stage2InitRow struct {
	RowID                 string
	SourceLandingNodeName string
	ProxyName             string
	LandingNodeType       string
	Server                string
	Mode                  string
	TargetName            *string
	RestrictedModes       map[string]ModeRestriction
	ModeWarnings          map[string]ModeRestriction
}

type Stage2Init struct {
	AvailableModes []string
	ChainTargets   []ChainTarget
	ForwardRelays  []ForwardRelay
	Rows           []Stage2InitRow
}

type ServerAggregationGroup struct {
	Server       string
	GroupName    string
	Enabled      bool
	Strategy     string
	MemberRowIDs []string
}

func SnapshotFromLegacyRows(rows []Stage2Row, groups []ServerAggregationGroup, switchOpt bool) Stage2Snapshot {
	legacy := legacyStage2SnapshotJSON{
		ChainProxyTargetGroupSwitchOptimizationEnabled: switchOpt,
		ServerAggregationGroups:                        make([]legacyServerAggregationGroupJSON, 0, len(groups)),
		Rows: make([]legacyStage2RowJSON, 0, len(rows)),
	}
	for _, row := range rows {
		legacy.Rows = append(legacy.Rows, legacyStage2RowJSON{
			RowID:                 row.RowID,
			SourceLandingNodeName: row.SourceLandingNodeName,
			ProxyName:             row.ProxyName,
			Mode:                  row.Mode,
			TargetName:            row.TargetName,
			Server:                row.Server,
		})
	}
	for _, group := range groups {
		legacy.ServerAggregationGroups = append(legacy.ServerAggregationGroups, legacyServerAggregationGroupJSON{
			Server:       group.Server,
			GroupName:    group.GroupName,
			Enabled:      group.Enabled,
			Strategy:     group.Strategy,
			MemberRowIDs: group.MemberRowIDs,
		})
	}
	converted, err := convertLegacyFlatSnapshot(legacy)
	if err != nil {
		panic(err)
	}
	return converted
}

func FlattenCatalogSources(catalog Stage2Catalog) []Stage2InitRow {
	rows := make([]Stage2InitRow, 0)
	for _, server := range catalog.Servers {
		for _, source := range server.Sources {
			rows = append(rows, Stage2InitRow{
				RowID:                 source.SourceID,
				SourceLandingNodeName: source.SourceID,
				ProxyName:             source.DefaultProxyName,
				LandingNodeType:       source.LandingNodeType,
				Server:                server.ServerKey,
				Mode:                  source.DefaultMode,
				TargetName:            source.DefaultTargetName,
				RestrictedModes:       source.RestrictedModes,
				ModeWarnings:          source.ModeWarnings,
			})
		}
	}
	return rows
}

func LegacyInitFromCatalog(catalog Stage2Catalog) Stage2Init {
	return Stage2Init{
		AvailableModes: catalog.AvailableModes,
		ChainTargets:   catalog.ChainTargets,
		ForwardRelays:  catalog.ForwardRelays,
		Rows:           FlattenCatalogSources(catalog),
	}
}

// FlatStage2Rows projects a nested snapshot to legacy Stage2Row slices for tests.
func FlatStage2Rows(snapshot Stage2Snapshot) []Stage2Row {
	snapshot = NormalizeStage2Snapshot(snapshot)
	refs := FlattenStage2Instances(snapshot)
	rows := make([]Stage2Row, 0, len(refs))
	for _, ref := range refs {
		rows = append(rows, Stage2Row{
			RowID:                 ref.Instance.ProxyName,
			SourceLandingNodeName: ref.SourceID,
			ProxyName:             ref.Instance.ProxyName,
			Mode:                  ref.Instance.Mode,
			TargetName:            ref.Instance.TargetName,
			Server:                ref.ServerKey,
		})
	}
	return rows
}

// FlatAggregationGroups projects enabled aggregations to legacy group slices for tests.
func FlatAggregationGroups(snapshot Stage2Snapshot) []ServerAggregationGroup {
	snapshot = NormalizeStage2Snapshot(snapshot)
	groups := make([]ServerAggregationGroup, 0)
	for _, server := range snapshot.Servers {
		if !server.Aggregation.Enabled {
			continue
		}
		memberRowIDs := make([]string, 0, len(server.Aggregation.MemberProxyNames))
		memberRowIDs = append(memberRowIDs, server.Aggregation.MemberProxyNames...)
		groups = append(groups, ServerAggregationGroup{
			Server:       server.ServerKey,
			GroupName:    server.Aggregation.GroupName,
			Enabled:      true,
			Strategy:     server.Aggregation.Strategy,
			MemberRowIDs: memberRowIDs,
		})
	}
	return groups
}

func CatalogFromLegacyInit(init Stage2Init) Stage2Catalog {
	serverOrder := make([]string, 0)
	serverIndex := map[string]int{}
	servers := make([]Stage2CatalogServer, 0)
	for _, row := range init.Rows {
		serverKey := stage2ServerKey(row.Server, row.SourceLandingNodeName)
		source := Stage2CatalogSource{
			SourceID:          row.SourceLandingNodeName,
			LandingNodeType:   row.LandingNodeType,
			RestrictedModes:   row.RestrictedModes,
			ModeWarnings:      row.ModeWarnings,
			DefaultProxyName:  row.ProxyName,
			DefaultMode:       row.Mode,
			DefaultTargetName: row.TargetName,
		}
		idx, ok := serverIndex[serverKey]
		if !ok {
			serverIndex[serverKey] = len(servers)
			serverOrder = append(serverOrder, serverKey)
			servers = append(servers, Stage2CatalogServer{ServerKey: serverKey, Sources: []Stage2CatalogSource{source}})
			continue
		}
		servers[idx].Sources = append(servers[idx].Sources, source)
	}
	_ = serverOrder
	return Stage2Catalog{
		AvailableModes: init.AvailableModes,
		ChainTargets:   init.ChainTargets,
		ForwardRelays:  init.ForwardRelays,
		Servers:        servers,
	}
}
