package service

import (
	"bufio"
	"context"
	"fmt"
	"strings"
)

type SnapshotPass3RenderingSource interface {
	RenderManagedPass3(ctx context.Context, prepared PreparedConversion, managedLandingYAML string, managedTransitProxiesYAML string) (string, error)
}

func buildManagedLandingConfigYAML(landingDiscoveryYAML string, snapshot Stage2Snapshot) (string, error) {
	linesByName, err := indexInlineProxyLinesByName(landingDiscoveryYAML)
	if err != nil {
		return "", err
	}

	var builder strings.Builder
	builder.WriteString("proxies:\n")
	for _, ref := range FlattenStage2Instances(snapshot) {
		sourceID := strings.TrimSpace(ref.SourceID)
		line, ok := linesByName[sourceID]
		if !ok {
			return "", fmt.Errorf("landing discovery proxy %q not found", sourceID)
		}
		renderedLine, err := applyInstanceToManagedLandingProxyLine(line, ref.Instance)
		if err != nil {
			return "", fmt.Errorf("apply stage2 instance for sourceId %q: %w", sourceID, err)
		}
		builder.WriteString(renderedLine)
		builder.WriteString("\n")
	}

	return builder.String(), nil
}

func indexInlineProxyLinesByName(raw string) (map[string]string, error) {
	scanner := bufio.NewScanner(strings.NewReader(raw))
	linesByName := make(map[string]string)
	inProxies := false
	foundSection := false

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		switch {
		case !strings.HasPrefix(line, " ") && trimmed == "proxies:":
			foundSection = true
			inProxies = true
		case !inProxies:
			continue
		case trimmed == "" || strings.HasPrefix(trimmed, "#"):
			continue
		case strings.HasPrefix(trimmed, "- {"):
			name, err := extractInlineField(trimmed, "name")
			if err != nil {
				return nil, err
			}
			if _, exists := linesByName[name]; exists {
				return nil, fmt.Errorf("landing discovery proxy %q is duplicated", name)
			}
			linesByName[name] = line
		case !strings.HasPrefix(line, " ") && strings.HasSuffix(trimmed, ":") && trimmed != "proxies:" && !strings.HasPrefix(trimmed, "-"):
			inProxies = false
		case inProxies:
			return nil, fmt.Errorf("unexpected proxies entry %q", line)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if !foundSection {
		return nil, fmt.Errorf("missing proxies section")
	}

	return linesByName, nil
}

func applyInstanceToManagedLandingProxyLine(line string, row Stage2Instance) (string, error) {
	prefix, fields, err := parseInlineProxyLine(line)
	if err != nil {
		return "", err
	}

	fields = upsertInlineProxyField(fields, "name", strings.TrimSpace(row.ProxyName))

	switch row.Mode {
	case "none":
		fields = deleteInlineProxyField(fields, "dialer-proxy")
		return renderInlineProxyLine(prefix, fields), nil
	case "chain":
		targetName, err := requireTargetName(row)
		if err != nil {
			return "", err
		}
		fields = upsertInlineProxyField(fields, "dialer-proxy", targetName)
		return renderInlineProxyLine(prefix, fields), nil
	case "port_forward":
		targetName, err := requireTargetName(row)
		if err != nil {
			return "", err
		}
		server, port, err := splitForwardRelayTarget(targetName)
		if err != nil {
			return "", err
		}
		if !hasInlineProxyField(fields, "server") {
			return "", fmt.Errorf("proxy is missing server field")
		}
		if !hasInlineProxyField(fields, "port") {
			return "", fmt.Errorf("proxy is missing port field")
		}
		fields = deleteInlineProxyField(fields, "dialer-proxy")
		fields = upsertInlineProxyField(fields, "server", server)
		fields = upsertInlineProxyField(fields, "port", port)
		return renderInlineProxyLine(prefix, fields), nil
	default:
		return "", fmt.Errorf("unsupported mode %q", row.Mode)
	}
}

func recognizedRegionGroupSet(fixtures ConversionFixtures) (map[string]struct{}, error) {
	names := append([]string(nil), fixtures.RecognizedRegionGroupNames...)
	if len(names) == 0 {
		regionMatchers, err := loadRegionMatchers(fixtures.TemplateConfig)
		if err != nil {
			return nil, newInternalResponseError("failed to load region matchers", fmt.Errorf("load region matchers: %w", err))
		}
		names = make([]string, 0, len(regionMatchers))
		for _, matcher := range regionMatchers {
			names = append(names, matcher.TargetName)
		}
	}

	result := make(map[string]struct{}, len(names))
	for _, name := range names {
		result[name] = struct{}{}
	}
	return result, nil
}

func stage2StripLandingNames(landingProxies []resolvedLandingProxy, snapshot Stage2Snapshot) map[string]struct{} {
	refs := FlattenStage2Instances(snapshot)
	stripNames := make(map[string]struct{}, len(landingProxies)+len(refs)*2)
	for _, landing := range landingProxies {
		stripNames[landing.Name] = struct{}{}
	}
	for _, ref := range refs {
		if sourceID := strings.TrimSpace(ref.SourceID); sourceID != "" {
			stripNames[sourceID] = struct{}{}
		}
		if proxyName := strings.TrimSpace(ref.Instance.ProxyName); proxyName != "" {
			stripNames[proxyName] = struct{}{}
		}
	}
	return stripNames
}
