package service

import (
	"fmt"
	"net/http"
	"strings"
)

func validateGenerateSnapshot(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, fixtures ConversionFixtures) ([]resolvedLandingProxy, error) {
	bundle, err := BuildStage2Bundle(stage1Input, fixtures)
	if err != nil {
		return nil, err
	}
	catalog := bundle.Catalog

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

	stage2Snapshot = NormalizeStage2Snapshot(stage2Snapshot)
	instancesBySource := map[string][]Stage2InstanceRef{}
	instancesByProxyName := map[string]Stage2InstanceRef{}
	proxyNames := map[string]struct{}{}

	for _, ref := range FlattenStage2Instances(stage2Snapshot) {
		errorRef := stage2InstanceValidationErrorRef(ref)
		sourceID := strings.TrimSpace(ref.SourceID)
		if sourceID == "" {
			cause := fmt.Errorf("sourceId must not be empty")
			return nil, newStage2InstanceInvalidRequestError("sourceId must not be empty", errorRef, "sourceId", cause)
		}
		proxyName := strings.TrimSpace(ref.Instance.ProxyName)
		if proxyName == "" {
			cause := fmt.Errorf("proxyName must not be empty")
			return nil, newStage2InstanceInvalidRequestError("proxyName must not be empty", errorRef, "proxyName", cause)
		}
		if _, exists := proxyNames[proxyName]; exists {
			cause := fmt.Errorf("duplicate proxy name %q", proxyName)
			return nil, newStage2InstanceValidationError("DUPLICATE_PROXY_NAME", "duplicate proxy name", errorRef, "proxyName", cause)
		}
		proxyNames[proxyName] = struct{}{}
		instancesByProxyName[proxyName] = ref
		instancesBySource[sourceID] = append(instancesBySource[sourceID], ref)
	}

	chainTargetsByName := make(map[string]ChainTarget, len(catalog.ChainTargets))
	for _, target := range catalog.ChainTargets {
		chainTargetsByName[target.Name] = target
	}
	forwardRelayNames := make(map[string]struct{}, len(catalog.ForwardRelays))
	for _, relay := range catalog.ForwardRelays {
		forwardRelayNames[relay.Name] = struct{}{}
	}
	forwardRelayUsers := make(map[string]string, len(catalog.ForwardRelays))

	for _, landing := range resolvedLandingProxies {
		refs := instancesBySource[landing.Name]
		if len(refs) == 0 {
			cause := fmt.Errorf("missing stage2 instance for landing node %q", landing.Name)
			return nil, newGlobalValidationError("STAGE2_ROWSET_MISMATCH", "stage2 instance set mismatch", cause)
		}
		for _, ref := range refs {
			errorRef := stage2InstanceValidationErrorRef(ref)
			proxyName := strings.TrimSpace(ref.Instance.ProxyName)
			switch ref.Instance.Mode {
			case "none":
				if ref.Instance.TargetName != nil && strings.TrimSpace(*ref.Instance.TargetName) != "" {
					cause := fmt.Errorf("targetName must be empty for proxy %q when mode is none", proxyName)
					return nil, newStage2InstanceInvalidRequestError("targetName must be empty when mode is none", errorRef, "targetName", cause)
				}
			case "chain":
				targetName, err := requireInstanceTargetName(ref)
				if err != nil {
					return nil, err
				}
				target, exists := chainTargetsByName[targetName]
				if !exists {
					cause := fmt.Errorf("unknown chain target %q for proxy %q", targetName, proxyName)
					return nil, newStage2InstanceValidationError("TARGET_NOT_FOUND", "target not found", errorRef, "targetName", cause)
				}
				if target.Kind == "proxy-groups" {
					isEmpty := target.IsEmpty
					if fullBaseTarget, ok := fullBaseProxyGroupTargets[targetName]; ok {
						isEmpty = fullBaseTarget.IsEmpty
					}
					if isEmpty {
						cause := fmt.Errorf("chain target %q for proxy %q is empty", targetName, proxyName)
						return nil, newStage2InstanceValidationError("EMPTY_CHAIN_TARGET", "chain target is empty", errorRef, "targetName", cause)
					}
				}
			case "port_forward":
				targetName, err := requireInstanceTargetName(ref)
				if err != nil {
					return nil, err
				}
				if _, exists := forwardRelayNames[targetName]; !exists {
					cause := fmt.Errorf("unknown forward relay %q for proxy %q", targetName, proxyName)
					return nil, newStage2InstanceValidationError("TARGET_NOT_FOUND", "target not found", errorRef, "targetName", cause)
				}
				if usedBy, exists := forwardRelayUsers[targetName]; exists {
					cause := fmt.Errorf("forward relay %q for proxy %q is already used by proxy %q", targetName, proxyName, usedBy)
					return nil, newStage2InstanceValidationError("DUPLICATE_FORWARD_RELAY_TARGET", "forward relay target is already used", errorRef, "targetName", cause)
				}
				forwardRelayUsers[targetName] = proxyName
			default:
				cause := fmt.Errorf("unsupported mode %q for proxy %q", ref.Instance.Mode, proxyName)
				return nil, newStage2InstanceInvalidRequestError("unsupported mode", errorRef, "mode", cause)
			}
		}
	}

	for sourceID, refs := range instancesBySource {
		if _, exists := landingByName[sourceID]; !exists {
			errorRef := stage2InstanceErrorRef{SourceID: sourceID}
			if len(refs) > 0 {
				errorRef = stage2InstanceValidationErrorRef(refs[0])
				errorRef.SourceID = sourceID
			}
			cause := fmt.Errorf("unknown sourceId %q in stage2 snapshot", sourceID)
			return nil, newStage2InstanceValidationError("LANDING_NODE_NOT_FOUND", "landing node not found", errorRef, "", cause)
		}
	}

	if err := validateServerAggregations(stage2Snapshot, instancesByProxyName, landingByName); err != nil {
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

func validateServerAggregations(
	snapshot Stage2Snapshot,
	instancesByProxyName map[string]Stage2InstanceRef,
	landingByName map[string]resolvedLandingProxy,
) error {
	seenByServer := map[string]struct{}{}
	for _, server := range snapshot.Servers {
		serverKey := strings.TrimSpace(server.ServerKey)
		if serverKey == "" {
			cause := fmt.Errorf("servers[].serverKey must not be empty")
			return newStage2ServerValidationError("INVALID_SERVER_AGGREGATION_GROUP", "invalid server aggregation", "", cause)
		}
		if _, exists := seenByServer[serverKey]; exists {
			cause := fmt.Errorf("duplicate serverKey %q", serverKey)
			return newStage2ServerValidationError("DUPLICATE_SERVER_AGGREGATION_GROUP", "duplicate server aggregation", serverKey, cause)
		}
		seenByServer[serverKey] = struct{}{}

		agg := server.Aggregation
		if !agg.Enabled {
			if strings.TrimSpace(agg.GroupName) != "" || strings.TrimSpace(agg.Strategy) != "" || len(agg.MemberProxyNames) > 0 {
				cause := fmt.Errorf("disabled aggregation for server %q must only contain enabled=false", serverKey)
				return newStage2ServerInvalidRequestError("disabled aggregation must only contain enabled=false", serverKey, "aggregation", cause)
			}
			continue
		}

		switch strings.TrimSpace(agg.Strategy) {
		case "fallback", "url-test", "select", "load-balance":
		default:
			cause := fmt.Errorf("unsupported server aggregation strategy %q for server %q", agg.Strategy, serverKey)
			return newStage2ServerValidationError("INVALID_SERVER_AGGREGATION_GROUP", "invalid server aggregation", serverKey, cause)
		}

		memberSeen := map[string]struct{}{}
		for _, rawName := range agg.MemberProxyNames {
			proxyName := strings.TrimSpace(rawName)
			if proxyName == "" {
				cause := fmt.Errorf("server %q has empty memberProxyName", serverKey)
				return newStage2ServerValidationError("INVALID_SERVER_AGGREGATION_GROUP", "invalid server aggregation", serverKey, cause)
			}
			if _, exists := memberSeen[proxyName]; exists {
				continue
			}
			memberSeen[proxyName] = struct{}{}

			ref, exists := instancesByProxyName[proxyName]
			if !exists {
				cause := fmt.Errorf("server %q references unknown proxyName %q", serverKey, proxyName)
				return newStage2ServerValidationError("SERVER_AGGREGATION_MEMBER_NOT_FOUND", "server aggregation member not found", serverKey, cause)
			}
			if strings.TrimSpace(ref.ServerKey) != serverKey {
				cause := fmt.Errorf("server aggregation member %q crosses server boundary", proxyName)
				return newStage2ServerValidationError("SERVER_AGGREGATION_SERVER_MISMATCH", "server aggregation member server mismatch", serverKey, cause)
			}
			if _, exists := landingByName[ref.SourceID]; !exists {
				cause := fmt.Errorf("server aggregation member %q references unknown sourceId %q", proxyName, ref.SourceID)
				return newGlobalValidationError("LANDING_NODE_NOT_FOUND", "landing node not found", cause)
			}
		}
		if len(memberSeen) < 2 {
			cause := fmt.Errorf("server aggregation for %q requires at least 2 members", serverKey)
			return newStage2ServerValidationError("SERVER_AGGREGATION_GROUP_TOO_SMALL", "server aggregation group requires at least 2 members", serverKey, cause)
		}
	}
	return nil
}

func requireInstanceTargetName(ref Stage2InstanceRef) (string, error) {
	if ref.Instance.TargetName == nil || strings.TrimSpace(*ref.Instance.TargetName) == "" {
		cause := fmt.Errorf("missing targetName for proxy %q", strings.TrimSpace(ref.Instance.ProxyName))
		return "", newStage2InstanceValidationError("MISSING_TARGET", "missing targetName", stage2InstanceValidationErrorRef(ref), "targetName", cause)
	}
	return *ref.Instance.TargetName, nil
}

func stage2InstanceValidationErrorRef(ref Stage2InstanceRef) stage2InstanceErrorRef {
	return stage2InstanceErrorRef{
		SourceID:  strings.TrimSpace(ref.SourceID),
		ProxyName: strings.TrimSpace(ref.Instance.ProxyName),
	}
}

func splitForwardRelayTarget(targetName string) (string, string, error) {
	relay, err := parseForwardRelayLine(targetName)
	if err != nil {
		return "", "", fmt.Errorf("invalid forward relay target %q", targetName)
	}
	return relay.Server, relay.Port, nil
}
