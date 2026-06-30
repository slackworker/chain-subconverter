package service

import "strings"

type stage2RowIdentity struct {
	RowID                 string
	SourceLandingNodeName string
	ProxyName             string
	LegacyLandingNodeName string
}

func stage2RowIdentityFromRow(row Stage2Row) stage2RowIdentity {
	rowID := strings.TrimSpace(row.RowID)
	sourceLandingNodeName := strings.TrimSpace(row.SourceLandingNodeName)
	proxyName := strings.TrimSpace(row.ProxyName)
	legacyLandingNodeName := strings.TrimSpace(row.LandingNodeName)

	if sourceLandingNodeName == "" {
		sourceLandingNodeName = legacyLandingNodeName
	}
	if proxyName == "" {
		proxyName = legacyLandingNodeName
	}
	if rowID == "" {
		// Keep backward-compatibility for legacy snapshots while centralizing
		// row identity derivation in a single place.
		switch {
		case proxyName != "":
			rowID = proxyName
		case legacyLandingNodeName != "":
			rowID = legacyLandingNodeName
		default:
			rowID = sourceLandingNodeName
		}
	}
	if legacyLandingNodeName == "" {
		switch {
		case proxyName != "":
			legacyLandingNodeName = proxyName
		default:
			legacyLandingNodeName = sourceLandingNodeName
		}
	}
	if sourceLandingNodeName == "" {
		sourceLandingNodeName = legacyLandingNodeName
	}
	if proxyName == "" {
		proxyName = legacyLandingNodeName
	}

	return stage2RowIdentity{
		RowID:                 rowID,
		SourceLandingNodeName: sourceLandingNodeName,
		ProxyName:             proxyName,
		LegacyLandingNodeName: legacyLandingNodeName,
	}
}

func normalizeStage2RowIdentity(row Stage2Row) Stage2Row {
	identity := stage2RowIdentityFromRow(row)
	normalized := row
	normalized.RowID = identity.RowID
	normalized.SourceLandingNodeName = identity.SourceLandingNodeName
	normalized.ProxyName = identity.ProxyName
	normalized.LandingNodeName = identity.ProxyName
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
