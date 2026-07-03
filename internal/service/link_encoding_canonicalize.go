package service

import (
	"sort"
	"strings"
)

// CanonicalizeStage2SnapshotForLinkEncoding maps session rowIds to deterministic
// encoded rowIds derived from proxyName before long URL / short link state encoding.
// Presentation order is preserved; aggregation member order is preserved only when
// enabled=true and strategy=fallback. Validation must use the original snapshot
// before this transform.
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
		memberRowIDs = canonicalizeServerAggregationMemberRowIDs(group, memberRowIDs)
		groups[index] = ServerAggregationGroup{
			Server:       group.Server,
			GroupName:    strings.TrimSpace(group.GroupName),
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

func shouldPreserveServerAggregationMemberOrder(group ServerAggregationGroup) bool {
	return group.Enabled && strings.TrimSpace(group.Strategy) == "fallback"
}

func canonicalizeServerAggregationMemberRowIDs(group ServerAggregationGroup, memberRowIDs []string) []string {
	canonical := make([]string, 0, len(memberRowIDs))
	seen := make(map[string]struct{}, len(memberRowIDs))
	for _, memberRowID := range memberRowIDs {
		memberRowID = strings.TrimSpace(memberRowID)
		if memberRowID == "" {
			continue
		}
		if _, exists := seen[memberRowID]; exists {
			continue
		}
		seen[memberRowID] = struct{}{}
		canonical = append(canonical, memberRowID)
	}
	if !shouldPreserveServerAggregationMemberOrder(group) {
		sort.Strings(canonical)
	}
	return canonical
}
