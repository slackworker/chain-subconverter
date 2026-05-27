package service

import (
	"fmt"
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
	fullBaseProxies, err := parseInlineProxyList(fixtures.FullBaseYAML)
	if err != nil {
		return nil, fmt.Errorf("parse full-base fixture proxies: %w", err)
	}
	resolvedLandingProxies, err := resolveLandingDiscoveryProxies(landingProxies, fullBaseProxies)
	if err != nil {
		return nil, err
	}

	landingByName := make(map[string]resolvedLandingProxy, len(resolvedLandingProxies))
	for _, landing := range resolvedLandingProxies {
		landingByName[landing.Name] = landing
	}

	rowsBySourceLanding := make(map[string][]Stage2Row, len(stage2Snapshot.Rows))
	rowsByProxyName := make(map[string]Stage2Row, len(stage2Snapshot.Rows))
	for _, row := range stage2Snapshot.Rows {
		rowErrorRef := stage2RowValidationErrorRef(row)
		sourceLandingName := row.sourceLandingNodeNameOrFallback()
		if sourceLandingName == "" {
			cause := fmt.Errorf("sourceLandingNodeName must not be empty")
			return nil, newStage2RowInvalidRequestError("sourceLandingNodeName must not be empty", rowErrorRef, "sourceLandingNodeName", cause)
		}
		proxyName := row.proxyNameOrFallback()
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
			rowProxyName := row.proxyNameOrFallback()
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
				if target.Kind == "proxy-groups" && target.IsEmpty {
					cause := fmt.Errorf("chain target %q for proxy %q is empty", targetName, rowProxyName)
					return nil, newStage2RowValidationError("EMPTY_CHAIN_TARGET", "chain target is empty", rowErrorRef, "targetName", cause)
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
				SourceLandingNodeName: sourceLandingName,
				LegacyLandingNodeName: sourceLandingName,
			}
			if len(rows) > 0 {
				rowErrorRef = stage2RowValidationErrorRef(rows[0])
				rowErrorRef.SourceLandingNodeName = sourceLandingName
				rowErrorRef.LegacyLandingNodeName = sourceLandingName
			}
			return nil, newStage2RowValidationError("LANDING_NODE_NOT_FOUND", "landing node not found", rowErrorRef, "", cause)
		}
	}

	return resolvedLandingProxies, nil
}

func requireTargetName(row Stage2Row) (string, error) {
	if row.TargetName == nil || strings.TrimSpace(*row.TargetName) == "" {
		cause := fmt.Errorf("missing targetName for proxy %q", row.proxyNameOrFallback())
		return "", newStage2RowValidationError("MISSING_TARGET", "missing targetName", stage2RowValidationErrorRef(row), "targetName", cause)
	}
	return *row.TargetName, nil
}

func stage2RowValidationErrorRef(row Stage2Row) stage2RowErrorRef {
	proxyName := row.proxyNameOrFallback()
	return stage2RowErrorRef{
		RowID:                 row.rowIDOrFallback(),
		SourceLandingNodeName: row.sourceLandingNodeNameOrFallback(),
		ProxyName:             proxyName,
		LegacyLandingNodeName: proxyName,
	}
}

func splitForwardRelayTarget(targetName string) (string, string, error) {
	relay, err := parseForwardRelayLine(targetName)
	if err != nil {
		return "", "", fmt.Errorf("invalid forward relay target %q", targetName)
	}
	return relay.Server, relay.Port, nil
}
