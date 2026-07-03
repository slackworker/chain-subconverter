package service

import "strings"

func stage2RowID(row Stage2Row) string {
	return strings.TrimSpace(row.RowID)
}

func stage2SourceLandingNodeName(row Stage2Row) string {
	return strings.TrimSpace(row.SourceLandingNodeName)
}

func stage2ProxyName(row Stage2Row) string {
	return strings.TrimSpace(row.ProxyName)
}

func normalizeStage2RowIdentity(row Stage2Row) Stage2Row {
	normalized := row
	normalized.RowID = stage2RowID(row)
	normalized.SourceLandingNodeName = stage2SourceLandingNodeName(row)
	normalized.ProxyName = stage2ProxyName(row)
	if normalized.TargetName != nil {
		trimmedTargetName := strings.TrimSpace(*normalized.TargetName)
		if trimmedTargetName == "" {
			normalized.TargetName = nil
		} else {
			normalized.TargetName = &trimmedTargetName
		}
	}
	return normalized
}

func normalizeStage2Rows(rows []Stage2Row) []Stage2Row {
	normalizedRows := make([]Stage2Row, 0, len(rows))
	for _, row := range rows {
		normalizedRows = append(normalizedRows, normalizeStage2RowIdentity(row))
	}
	return normalizedRows
}
