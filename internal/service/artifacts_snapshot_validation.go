package service

import (
	"fmt"
	"net/http"
	"strings"
)

func validateGenerateSnapshot(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, fixtures ConversionFixtures) ([]resolvedLandingProxy, error) {
	stage2Init, err := BuildStage2Init(stage1Input, fixtures)
	if err != nil {
		return nil, err
	}

	landingProxies, err := parseInlineProxyList(fixtures.LandingDiscoveryYAML)
	if err != nil {
		return nil, fmt.Errorf("parse landing discovery fixture: %w", err)
	}
	var resolvedLandingProxies []resolvedLandingProxy
	if strings.TrimSpace(fixtures.FullBaseYAML) != "" {
		fullBaseProxies, err := parseInlineProxyList(fixtures.FullBaseYAML)
		if err != nil {
			return nil, fmt.Errorf("parse full-base fixture proxies: %w", err)
		}
		resolvedLandingProxies, err = resolveLandingDiscoveryProxies(landingProxies, fullBaseProxies)
		if err != nil {
			return nil, err
		}
	} else {
		resolvedLandingProxies, err = resolveLandingDiscoveryProxiesWithoutFullBase(landingProxies)
		if err != nil {
			return nil, err
		}
	}

	landingByName := make(map[string]resolvedLandingProxy, len(resolvedLandingProxies))
	for _, landing := range resolvedLandingProxies {
		landingByName[landing.Name] = landing
	}
	fullBaseProxyGroupTargets, err := fullBaseProxyGroupTargetsByName(fixtures, resolvedLandingProxies)
	if err != nil {
		return nil, err
	}

	rowsBySourceLanding := make(map[string][]Stage2Row, len(stage2Snapshot.Rows))
	rowsByRowID := make(map[string]Stage2Row, len(stage2Snapshot.Rows))
	rowsByProxyName := make(map[string]Stage2Row, len(stage2Snapshot.Rows))
	for _, row := range stage2Snapshot.Rows {
		rowErrorRef := stage2RowValidationErrorRef(row)
		rowID := stage2RowID(row)
		if rowID == "" {
			cause := fmt.Errorf("rowId must not be empty")
			return nil, newStage2RowInvalidRequestError("rowId must not be empty", rowErrorRef, "rowId", cause)
		}
		if _, exists := rowsByRowID[rowID]; exists {
			cause := fmt.Errorf("duplicate rowId %q", rowID)
			return nil, newStage2RowValidationError("DUPLICATE_ROW_ID", "duplicate rowId", rowErrorRef, "rowId", cause)
		}
		rowsByRowID[rowID] = row
		sourceLandingName := stage2SourceLandingNodeName(row)
		if sourceLandingName == "" {
			cause := fmt.Errorf("sourceLandingNodeName must not be empty")
			return nil, newStage2RowInvalidRequestError("sourceLandingNodeName must not be empty", rowErrorRef, "sourceLandingNodeName", cause)
		}
		proxyName := stage2ProxyName(row)
		if proxyName == "" {
			cause := fmt.Errorf("proxyName must not be empty")
			return nil, newStage2RowInvalidRequestError("proxyName must not be empty", rowErrorRef, "proxyName", cause)
		}
		if _, exists := rowsByProxyName[proxyName]; exists {
			cause := fmt.Errorf("duplicate proxy name %q", proxyName)
			return nil, newStage2RowValidationError("DUPLICATE_PROXY_NAME", "duplicate proxy name", rowErrorRef, "proxyName", cause)
		}
		rowsByProxyName[proxyName] = row
		rowsBySourceLanding[sourceLandingName] = append(rowsBySourceLanding[sourceLandingName], row)
	}

	chainTargetsByName := make(map[string]ChainTarget, len(stage2Init.ChainTargets))
	for _, target := range stage2Init.ChainTargets {
		chainTargetsByName[target.Name] = target
	}

	forwardRelayNames := make(map[string]struct{}, len(stage2Init.ForwardRelays))
	for _, relay := range stage2Init.ForwardRelays {
		forwardRelayNames[relay.Name] = struct{}{}
	}
	forwardRelayUsers := make(map[string]string, len(stage2Init.ForwardRelays))

	for _, landing := range resolvedLandingProxies {
		rows := rowsBySourceLanding[landing.Name]
		if len(rows) == 0 {
			cause := fmt.Errorf("missing stage2 row for landing node %q", landing.Name)
			return nil, newGlobalValidationError("STAGE2_ROWSET_MISMATCH", "stage2 rowset mismatch", cause)
		}

		for _, row := range rows {
			rowErrorRef := stage2RowValidationErrorRef(row)
			rowProxyName := stage2ProxyName(row)
			switch row.Mode {
			case "none":
				if row.TargetName != nil && strings.TrimSpace(*row.TargetName) != "" {
					cause := fmt.Errorf("targetName must be empty for proxy %q when mode is none", rowProxyName)
					return nil, newStage2RowInvalidRequestError("targetName must be empty when mode is none", rowErrorRef, "targetName", cause)
				}
				continue
			case "chain":
				targetName, err := requireTargetName(row)
				if err != nil {
					return nil, err
				}
				target, exists := chainTargetsByName[targetName]
				if !exists {
					cause := fmt.Errorf("unknown chain target %q for proxy %q", targetName, rowProxyName)
					return nil, newStage2RowValidationError("TARGET_NOT_FOUND", "target not found", rowErrorRef, "targetName", cause)
				}
				if target.Kind == "proxy-groups" {
					isEmpty := target.IsEmpty
					if fullBaseTarget, ok := fullBaseProxyGroupTargets[targetName]; ok {
						isEmpty = fullBaseTarget.IsEmpty
					}
					if isEmpty {
						cause := fmt.Errorf("chain target %q for proxy %q is empty", targetName, rowProxyName)
						return nil, newStage2RowValidationError("EMPTY_CHAIN_TARGET", "chain target is empty", rowErrorRef, "targetName", cause)
					}
				}
			case "port_forward":
				targetName, err := requireTargetName(row)
				if err != nil {
					return nil, err
				}
				if _, exists := forwardRelayNames[targetName]; !exists {
					cause := fmt.Errorf("unknown forward relay %q for proxy %q", targetName, rowProxyName)
					return nil, newStage2RowValidationError("TARGET_NOT_FOUND", "target not found", rowErrorRef, "targetName", cause)
				}
				if usedBy, exists := forwardRelayUsers[targetName]; exists {
					cause := fmt.Errorf("forward relay %q for proxy %q is already used by proxy %q", targetName, rowProxyName, usedBy)
					return nil, newStage2RowValidationError("DUPLICATE_FORWARD_RELAY_TARGET", "forward relay target is already used", rowErrorRef, "targetName", cause)
				}
				forwardRelayUsers[targetName] = rowProxyName
			default:
				cause := fmt.Errorf("unsupported mode %q for proxy %q", row.Mode, rowProxyName)
				return nil, newStage2RowInvalidRequestError("unsupported mode", rowErrorRef, "mode", cause)
			}
		}
	}

	for sourceLandingName, rows := range rowsBySourceLanding {
		if _, exists := landingByName[sourceLandingName]; !exists {
			cause := fmt.Errorf("unknown source landing node %q in stage2 snapshot", sourceLandingName)
			rowErrorRef := stage2RowErrorRef{
			}
			if len(rows) > 0 {
				rowErrorRef = stage2RowValidationErrorRef(rows[0])
				rowErrorRef.SourceLandingNodeName = sourceLandingName
			}
			return nil, newStage2RowValidationError("LANDING_NODE_NOT_FOUND", "landing node not found", rowErrorRef, "", cause)
		}
	}
	if err := validateServerAggregationGroups(stage2Snapshot.ServerAggregationGroups, rowsByRowID, landingByName); err != nil {
		return nil, err
	}

	return resolvedLandingProxies, nil
}

func validationFullBaseYAML(fixtures ConversionFixtures) string {
	if strings.TrimSpace(fixtures.ValidationFullBaseYAML) != "" {
		return fixtures.ValidationFullBaseYAML
	}
	return fixtures.FullBaseYAML
}

// DetermineRestoreStatus validates the restored snapshot against current fixtures
// and returns replayable or conflicted per spec 04-business-rules §3.2.1.
func DetermineRestoreStatus(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, fixtures ConversionFixtures) (string, []Message, []RestoreConflict, error) {
	_, err := validateGenerateSnapshot(stage1Input, stage2Snapshot, fixtures)
	if err == nil {
		return "replayable", []Message{}, nil, nil
	}

	if !IsRestoreConflictError(err) {
		if responseErr, ok := AsResponseError(err); ok && responseErr.StatusCode() < http.StatusInternalServerError {
			return "", nil, nil, newStage3FieldValidationError("INVALID_LONG_URL", "long URL payload is invalid", "currentLinkInput", err)
		}
		return "", nil, nil, err
	}
	return "conflicted", []Message{{
		Level:   "warning",
		Code:    "RESTORE_CONFLICT",
		Message: restoreConflictMessage(err),
	}}, []RestoreConflict{RestoreConflictFromError(err)}, nil
}

// IsRestoreConflictError reports whether an error represents a soft restore conflict.
func IsRestoreConflictError(err error) bool {
	responseErr, ok := AsResponseError(err)
	if !ok {
		return false
	}

	switch responseErr.BlockingError().Code {
	case "STAGE2_ROWSET_MISMATCH", "TARGET_NOT_FOUND", "EMPTY_CHAIN_TARGET", "LANDING_NODE_NOT_FOUND", "SERVER_AGGREGATION_MEMBER_NOT_FOUND", "SERVER_AGGREGATION_GROUP_TOO_SMALL", "SERVER_AGGREGATION_SERVER_MISMATCH":
		return true
	default:
		return false
	}
}

func fullBaseProxyGroupTargetsByName(fixtures ConversionFixtures, resolvedLandingProxies []resolvedLandingProxy) (map[string]ChainTarget, error) {
	fullBaseYAML := validationFullBaseYAML(fixtures)
	if strings.TrimSpace(fullBaseYAML) == "" {
		return nil, nil
	}
	transitProxies, err := parseInlineProxyList(fixtures.TransitDiscoveryYAML)
	if err != nil {
		return nil, fmt.Errorf("parse transit discovery fixture: %w", err)
	}
	fullBaseGroups, err := parseProxyGroups(fullBaseYAML)
	if err != nil {
		return nil, fmt.Errorf("parse full-base fixture: %w", err)
	}
	regionMatchers, err := loadRegionMatchers(fixtures.TemplateConfig)
	if err != nil {
		return nil, newInternalResponseError("failed to load region matchers", fmt.Errorf("load region matchers: %w", err))
	}
	landingNames := make(map[string]struct{}, len(resolvedLandingProxies))
	for _, proxy := range resolvedLandingProxies {
		landingNames[proxy.Name] = struct{}{}
	}
	chainTargets, err := buildChainTargets(regionMatchers, landingNames, transitProxies, fullBaseGroups)
	if err != nil {
		return nil, err
	}
	targetsByName := make(map[string]ChainTarget, len(chainTargets))
	for _, target := range chainTargets {
		if target.Kind != "proxy-groups" {
			continue
		}
		targetsByName[target.Name] = target
	}
	return targetsByName, nil
}

func validateServerAggregationGroups(
	serverAggregationGroups []ServerAggregationGroup,
	rowsByID map[string]Stage2Row,
	landingByName map[string]resolvedLandingProxy,
) error {
	seenByServer := make(map[string]struct{}, len(serverAggregationGroups))
	for _, group := range serverAggregationGroups {
		server := strings.TrimSpace(group.Server)
		if server == "" {
			cause := fmt.Errorf("serverAggregationGroups.server must not be empty")
			return newGlobalValidationError("INVALID_SERVER_AGGREGATION_GROUP", "invalid server aggregation group", cause)
		}
		if _, exists := seenByServer[server]; exists {
			cause := fmt.Errorf("duplicate server aggregation group for server %q", server)
			return newGlobalValidationError("DUPLICATE_SERVER_AGGREGATION_GROUP", "duplicate server aggregation group", cause)
		}
		seenByServer[server] = struct{}{}

		if !group.Enabled {
			continue
		}

		switch strings.TrimSpace(group.Strategy) {
		case "fallback", "url-test", "select", "load-balance":
		default:
			cause := fmt.Errorf("unsupported server aggregation strategy %q for server %q", group.Strategy, server)
			return newGlobalValidationError("INVALID_SERVER_AGGREGATION_GROUP", "invalid server aggregation group", cause)
		}

		memberSeen := make(map[string]struct{}, len(group.MemberRowIDs))
		for _, rawRowID := range group.MemberRowIDs {
			rowID := strings.TrimSpace(rawRowID)
			if rowID == "" {
				cause := fmt.Errorf("server aggregation group for server %q has empty member rowId", server)
				return newGlobalValidationError("INVALID_SERVER_AGGREGATION_GROUP", "invalid server aggregation group", cause)
			}
			if _, exists := memberSeen[rowID]; exists {
				continue
			}
			memberSeen[rowID] = struct{}{}

			memberRow, exists := rowsByID[rowID]
			if !exists {
				cause := fmt.Errorf("server aggregation group for server %q references unknown rowId %q", server, rowID)
				return newGlobalValidationError("SERVER_AGGREGATION_MEMBER_NOT_FOUND", "server aggregation member not found", cause)
			}
			sourceLandingName := stage2SourceLandingNodeName(memberRow)
			landing, exists := landingByName[sourceLandingName]
			if !exists {
				cause := fmt.Errorf("server aggregation member rowId %q references unknown source landing node %q", rowID, sourceLandingName)
				return newGlobalValidationError("LANDING_NODE_NOT_FOUND", "landing node not found", cause)
			}
			if strings.TrimSpace(landing.Server) != server {
				cause := fmt.Errorf(
					"server aggregation member rowId %q server mismatch: group=%q row=%q",
					rowID,
					server,
					strings.TrimSpace(landing.Server),
				)
				return newGlobalValidationError("SERVER_AGGREGATION_SERVER_MISMATCH", "server aggregation member server mismatch", cause)
			}
		}
		if len(memberSeen) < 2 {
			cause := fmt.Errorf("server aggregation group for server %q requires at least 2 members", server)
			return newGlobalValidationError("SERVER_AGGREGATION_GROUP_TOO_SMALL", "server aggregation group requires at least 2 members", cause)
		}
	}

	return nil
}

func requireTargetName(row Stage2Row) (string, error) {
	if row.TargetName == nil || strings.TrimSpace(*row.TargetName) == "" {
		cause := fmt.Errorf("missing targetName for proxy %q", stage2ProxyName(row))
		return "", newStage2RowValidationError("MISSING_TARGET", "missing targetName", stage2RowValidationErrorRef(row), "targetName", cause)
	}
	return *row.TargetName, nil
}

func stage2RowValidationErrorRef(row Stage2Row) stage2RowErrorRef {
	proxyName := stage2ProxyName(row)
	return stage2RowErrorRef{
		RowID:                 stage2RowID(row),
		SourceLandingNodeName: stage2SourceLandingNodeName(row),
		ProxyName:             proxyName,
	}
}

func splitForwardRelayTarget(targetName string) (string, string, error) {
	relay, err := parseForwardRelayLine(targetName)
	if err != nil {
		return "", "", fmt.Errorf("invalid forward relay target %q", targetName)
	}
	return relay.Server, relay.Port, nil
}
