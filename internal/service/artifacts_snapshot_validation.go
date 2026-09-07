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
	collected := snapshotValidationErrors{}

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
		instancesBySource[sourceID] = append(instancesBySource[sourceID], ref)
		if _, exists := proxyNames[proxyName]; exists {
			cause := fmt.Errorf("duplicate proxy name %q", proxyName)
			if err := collected.add(newStage2InstanceValidationError("DUPLICATE_PROXY_NAME", "duplicate proxy name", errorRef, "proxyName", cause)); err != nil {
				return nil, err
			}
			continue
		}
		proxyNames[proxyName] = struct{}{}
		instancesByProxyName[proxyName] = ref
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
			if err := collected.add(newGlobalValidationErrorContext(
				"STAGE2_ROWSET_MISMATCH",
				"stage2 instance set mismatch",
				map[string]any{"sourceId": landing.Name},
				cause,
			)); err != nil {
				return nil, err
			}
			continue
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
					if err := collected.add(err); err != nil {
						return nil, err
					}
					continue
				}
				target, exists := chainTargetsByName[targetName]
				if !exists {
					cause := fmt.Errorf("unknown chain target %q for proxy %q", targetName, proxyName)
					if err := collected.add(newStage2InstanceValidationError("TARGET_NOT_FOUND", "target not found", errorRef, "targetName", cause)); err != nil {
						return nil, err
					}
					continue
				}
				if target.Kind == "proxy-groups" {
					isEmpty := target.IsEmpty
					if fullBaseTarget, ok := fullBaseProxyGroupTargets[targetName]; ok {
						isEmpty = fullBaseTarget.IsEmpty
					}
					if isEmpty {
						cause := fmt.Errorf("chain target %q for proxy %q is empty", targetName, proxyName)
						if err := collected.add(newStage2InstanceValidationError("EMPTY_CHAIN_TARGET", "chain target is empty", errorRef, "targetName", cause)); err != nil {
							return nil, err
						}
					}
				}
			case "port_forward":
				targetName, err := requireInstanceTargetName(ref)
				if err != nil {
					if err := collected.add(err); err != nil {
						return nil, err
					}
					continue
				}
				if _, exists := forwardRelayNames[targetName]; !exists {
					cause := fmt.Errorf("unknown forward relay %q for proxy %q", targetName, proxyName)
					if err := collected.add(newStage2InstanceValidationError("TARGET_NOT_FOUND", "target not found", errorRef, "targetName", cause)); err != nil {
						return nil, err
					}
					continue
				}
				if usedBy, exists := forwardRelayUsers[targetName]; exists {
					cause := fmt.Errorf("forward relay %q for proxy %q is already used by proxy %q", targetName, proxyName, usedBy)
					if err := collected.add(newStage2InstanceValidationError("DUPLICATE_FORWARD_RELAY_TARGET", "forward relay target is already used", errorRef, "targetName", cause)); err != nil {
						return nil, err
					}
					continue
				}
				forwardRelayUsers[targetName] = proxyName
			default:
				cause := fmt.Errorf("unsupported mode %q for proxy %q", ref.Instance.Mode, proxyName)
				return nil, newStage2InstanceInvalidRequestError("unsupported mode", errorRef, "mode", cause)
			}
		}
	}

	for sourceID, refs := range instancesBySource {
		if _, exists := landingByName[sourceID]; exists {
			continue
		}
		for _, ref := range refs {
			errorRef := stage2InstanceValidationErrorRef(ref)
			errorRef.SourceID = sourceID
			cause := fmt.Errorf("unknown sourceId %q in stage2 snapshot", sourceID)
			if err := collected.add(newStage2InstanceValidationError("LANDING_NODE_NOT_FOUND", "landing node not found", errorRef, "", cause)); err != nil {
				return nil, err
			}
		}
	}

	if err := collected.add(validateServerAggregations(stage2Snapshot, instancesByProxyName, landingByName)); err != nil {
		return nil, err
	}
	if err := collected.result(); err != nil {
		return nil, err
	}

	return resolvedLandingProxies, nil
}

type snapshotValidationErrors struct {
	items []error
}

func (collected *snapshotValidationErrors) add(err error) error {
	if err == nil {
		return nil
	}
	responseErr, ok := AsResponseError(err)
	if !ok || responseErr.StatusCode() == http.StatusBadRequest || responseErr.StatusCode() >= http.StatusInternalServerError {
		return err
	}
	collected.items = append(collected.items, err)
	return nil
}

func (collected *snapshotValidationErrors) result() error {
	return joinResponseErrors(collected.items)
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
	}}, RestoreConflictsFromError(err), nil
}

func IsRestoreConflictError(err error) bool {
	responseErr, ok := AsResponseError(err)
	if !ok {
		return false
	}

	for _, blockingError := range responseErr.BlockingErrors() {
		if isRestoreConflictCode(blockingError.Code) {
			return true
		}
	}
	return false
}

func isRestoreConflictCode(code string) bool {
	switch code {
	case "STAGE2_ROWSET_MISMATCH", "TARGET_NOT_FOUND", "EMPTY_CHAIN_TARGET", "LANDING_NODE_NOT_FOUND", "DUPLICATE_PROXY_NAME", "SERVER_AGGREGATION_MEMBER_NOT_FOUND", "SERVER_AGGREGATION_GROUP_TOO_SMALL", "SERVER_AGGREGATION_SERVER_MISMATCH":
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
	collected := snapshotValidationErrors{}
	seenByServer := map[string]struct{}{}
	for _, server := range snapshot.Servers {
		serverKey := strings.TrimSpace(server.ServerKey)
		if serverKey == "" {
			cause := fmt.Errorf("servers[].serverKey must not be empty")
			if err := collected.add(newStage2ServerValidationError("INVALID_SERVER_AGGREGATION_GROUP", "invalid server aggregation", "", cause)); err != nil {
				return err
			}
			continue
		}
		if _, exists := seenByServer[serverKey]; exists {
			cause := fmt.Errorf("duplicate serverKey %q", serverKey)
			if err := collected.add(newStage2ServerValidationError("DUPLICATE_SERVER_AGGREGATION_GROUP", "duplicate server aggregation", serverKey, cause)); err != nil {
				return err
			}
			continue
		}
		seenByServer[serverKey] = struct{}{}

		agg := server.Aggregation
		if !agg.Enabled {
			if strings.TrimSpace(agg.GroupName) != "" || strings.TrimSpace(agg.Strategy) != "" || len(agg.MemberProxyNames) > 0 {
				cause := fmt.Errorf("disabled aggregation for server %q must only contain enabled=false", serverKey)
				if err := collected.add(newStage2ServerInvalidRequestError("disabled aggregation must only contain enabled=false", serverKey, "aggregation", cause)); err != nil {
					return err
				}
			}
			continue
		}

		switch strings.TrimSpace(agg.Strategy) {
		case "fallback", "url-test", "select", "load-balance":
		default:
			cause := fmt.Errorf("unsupported server aggregation strategy %q for server %q", agg.Strategy, serverKey)
			if err := collected.add(newStage2ServerValidationError("INVALID_SERVER_AGGREGATION_GROUP", "invalid server aggregation", serverKey, cause)); err != nil {
				return err
			}
			continue
		}

		memberSeen := map[string]struct{}{}
		for _, rawName := range agg.MemberProxyNames {
			proxyName := strings.TrimSpace(rawName)
			if proxyName == "" {
				cause := fmt.Errorf("server %q has empty memberProxyName", serverKey)
				if err := collected.add(newStage2ServerValidationError("INVALID_SERVER_AGGREGATION_GROUP", "invalid server aggregation", serverKey, cause)); err != nil {
					return err
				}
				continue
			}
			if _, exists := memberSeen[proxyName]; exists {
				continue
			}
			memberSeen[proxyName] = struct{}{}

			ref, exists := instancesByProxyName[proxyName]
			if !exists {
				cause := fmt.Errorf("server %q references unknown proxyName %q", serverKey, proxyName)
				if err := collected.add(newStage2ServerValidationErrorContext(
					"SERVER_AGGREGATION_MEMBER_NOT_FOUND",
					"server aggregation member not found",
					serverKey,
					map[string]any{"proxyName": proxyName},
					cause,
				)); err != nil {
					return err
				}
				continue
			}
			if strings.TrimSpace(ref.ServerKey) != serverKey {
				cause := fmt.Errorf("server aggregation member %q crosses server boundary", proxyName)
				if err := collected.add(newStage2ServerValidationErrorContext(
					"SERVER_AGGREGATION_SERVER_MISMATCH",
					"server aggregation member server mismatch",
					serverKey,
					map[string]any{"sourceId": ref.SourceID, "proxyName": proxyName},
					cause,
				)); err != nil {
					return err
				}
				continue
			}
			if _, exists := landingByName[ref.SourceID]; !exists {
				continue
			}
		}
		if len(memberSeen) < 2 {
			cause := fmt.Errorf("server aggregation for %q requires at least 2 members", serverKey)
			if err := collected.add(newStage2ServerValidationError("SERVER_AGGREGATION_GROUP_TOO_SMALL", "server aggregation group requires at least 2 members", serverKey, cause)); err != nil {
				return err
			}
		}
	}
	return collected.result()
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
