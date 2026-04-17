package service

import (
	"fmt"
	"strings"
)

func validateGenerateSnapshot(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, fixtures ConversionFixtures) ([]inlineProxy, error) {
	stage2Init, err := BuildStage2Init(stage1Input, fixtures)
	if err != nil {
		return nil, err
	}

	landingProxies, err := parseInlineProxyList(fixtures.LandingDiscoveryYAML)
	if err != nil {
		return nil, fmt.Errorf("parse landing discovery fixture: %w", err)
	}

	landingByName := make(map[string]inlineProxy, len(landingProxies))
	for _, landing := range landingProxies {
		landingByName[landing.Name] = landing
	}

	rowsByLanding := make(map[string]Stage2Row, len(stage2Snapshot.Rows))
	for _, row := range stage2Snapshot.Rows {
		if _, exists := rowsByLanding[row.LandingNodeName]; exists {
			cause := fmt.Errorf("duplicate stage2 row for landing node %q", row.LandingNodeName)
			return nil, newGlobalValidationError("STAGE2_ROWSET_MISMATCH", "stage2 rowset mismatch", cause)
		}
		rowsByLanding[row.LandingNodeName] = row
	}

	if len(rowsByLanding) != len(landingProxies) {
		cause := fmt.Errorf("stage2 rowset size mismatch: got %d rows want %d", len(rowsByLanding), len(landingProxies))
		return nil, newGlobalValidationError("STAGE2_ROWSET_MISMATCH", "stage2 rowset mismatch", cause)
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

	for _, landing := range landingProxies {
		row, exists := rowsByLanding[landing.Name]
		if !exists {
			cause := fmt.Errorf("missing stage2 row for landing node %q", landing.Name)
			return nil, newGlobalValidationError("STAGE2_ROWSET_MISMATCH", "stage2 rowset mismatch", cause)
		}

		switch row.Mode {
		case "none":
			if row.TargetName != nil && strings.TrimSpace(*row.TargetName) != "" {
				cause := fmt.Errorf("targetName must be empty for landing node %q when mode is none", landing.Name)
				return nil, newStage2RowInvalidRequestError("targetName must be empty when mode is none", landing.Name, "targetName", cause)
			}
			continue
		case "chain":
			targetName, err := requireTargetName(row)
			if err != nil {
				return nil, err
			}
			if landing.Type == "vless-reality" {
				cause := fmt.Errorf("landing node %q does not allow chain mode", landing.Name)
				return nil, newStage2RowValidationError("CHAIN_MODE_NOT_ALLOWED", "chain mode is not allowed for this landing node", landing.Name, "mode", cause)
			}
			target, exists := chainTargetsByName[targetName]
			if !exists {
				cause := fmt.Errorf("unknown chain target %q for landing node %q", targetName, landing.Name)
				return nil, newStage2RowValidationError("TARGET_NOT_FOUND", "target not found", landing.Name, "targetName", cause)
			}
			if target.Kind == "proxy-groups" && target.IsEmpty {
				cause := fmt.Errorf("chain target %q for landing node %q is empty", targetName, landing.Name)
				return nil, newStage2RowValidationError("EMPTY_CHAIN_TARGET", "chain target is empty", landing.Name, "targetName", cause)
			}
		case "port_forward":
			targetName, err := requireTargetName(row)
			if err != nil {
				return nil, err
			}
			if _, exists := forwardRelayNames[targetName]; !exists {
				cause := fmt.Errorf("unknown forward relay %q for landing node %q", targetName, landing.Name)
				return nil, newStage2RowValidationError("TARGET_NOT_FOUND", "target not found", landing.Name, "targetName", cause)
			}
			if usedBy, exists := forwardRelayUsers[targetName]; exists {
				cause := fmt.Errorf("forward relay %q for landing node %q is already used by landing node %q", targetName, landing.Name, usedBy)
				return nil, newStage2RowValidationError("DUPLICATE_FORWARD_RELAY_TARGET", "forward relay target is already used", landing.Name, "targetName", cause)
			}
			forwardRelayUsers[targetName] = landing.Name
		default:
			cause := fmt.Errorf("unsupported mode %q for landing node %q", row.Mode, landing.Name)
			return nil, newStage2RowInvalidRequestError("unsupported mode", landing.Name, "mode", cause)
		}
	}

	for rowName := range rowsByLanding {
		if _, exists := landingByName[rowName]; !exists {
			cause := fmt.Errorf("unknown landing node %q in stage2 snapshot", rowName)
			return nil, newStage2RowValidationError("LANDING_NODE_NOT_FOUND", "landing node not found", rowName, "", cause)
		}
	}

	return landingProxies, nil
}

func requireTargetName(row Stage2Row) (string, error) {
	if row.TargetName == nil || strings.TrimSpace(*row.TargetName) == "" {
		cause := fmt.Errorf("missing targetName for landing node %q", row.LandingNodeName)
		return "", newStage2RowValidationError("MISSING_TARGET", "missing targetName", row.LandingNodeName, "targetName", cause)
	}
	return *row.TargetName, nil
}

func splitForwardRelayTarget(targetName string) (string, string, error) {
	relay, err := parseForwardRelayLine(targetName)
	if err != nil {
		return "", "", fmt.Errorf("invalid forward relay target %q", targetName)
	}
	return relay.Server, relay.Port, nil
}
