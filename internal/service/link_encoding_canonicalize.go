package service

import "strings"

// CanonicalizeStage2SnapshotForLinkEncoding maps session rowIds to deterministic
// encoded rowIds derived from proxyName before long URL / short link state encoding.
// Presentation order and fallback member order are preserved; validation must use
// the original snapshot before this transform.
func CanonicalizeStage2SnapshotForLinkEncoding(snapshot Stage2Snapshot) Stage2Snapshot {
	snapshot = NormalizeStage2Snapshot(snapshot)

	rowIDToEncoded := make(map[string]string, len(snapshot.Rows))
	rows := make([]Stage2Row, len(snapshot.Rows))
	for index, row := range snapshot.Rows {
		encodedRowID := stage2ProxyName(row)
		oldRowID := stage2RowID(row)
		rowIDToEncoded[oldRowID] = encodedRowID

		canonicalRow := row
		canonicalRow.RowID = encodedRowID
		canonicalRow.ProxyName = encodedRowID
		canonicalRow.SourceLandingNodeName = stage2SourceLandingNodeName(row)
		rows[index] = canonicalRow
	}

	groups := make([]ServerAggregationGroup, len(snapshot.ServerAggregationGroups))
	for index, group := range snapshot.ServerAggregationGroups {
		memberRowIDs := make([]string, 0, len(group.MemberRowIDs))
		for _, memberRowID := range group.MemberRowIDs {
			memberRowID = strings.TrimSpace(memberRowID)
			if memberRowID == "" {
				continue
			}
			if encodedRowID, ok := rowIDToEncoded[memberRowID]; ok {
				memberRowIDs = append(memberRowIDs, encodedRowID)
				continue
			}
			memberRowIDs = append(memberRowIDs, memberRowID)
		}
		groups[index] = ServerAggregationGroup{
			Server:       group.Server,
			GroupName:    group.GroupName,
			Enabled:      group.Enabled,
			Strategy:     group.Strategy,
			MemberRowIDs: memberRowIDs,
		}
	}

	return Stage2Snapshot{
		Rows: rows,
		ChainProxyTargetGroupSwitchOptimizationEnabled: snapshot.ChainProxyTargetGroupSwitchOptimizationEnabled,
		ServerAggregationGroups:                        groups,
	}
}
