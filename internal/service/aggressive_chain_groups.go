package service

import (
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

const (
	aggressiveChainGroupURL            = "https://cp.cloudflare.com/generate_204"
	aggressiveChainGroupInterval       = "60"
	aggressiveChainGroupTimeout        = "1000"
	aggressiveChainGroupMaxFailedTimes = "1"
)

type managedServerAggregationGroup struct {
	Name    string
	Type    string
	Members []string
}

func appendAggressiveChainGroupsToCompleteConfigYAML(fullYAML string, snapshot Stage2Snapshot) (string, error) {
	managedGroups, err := buildManagedServerAggregationGroups(fullYAML, snapshot)
	if err != nil {
		return "", err
	}
	if len(managedGroups) == 0 {
		return fullYAML, nil
	}

	var document yaml.Node
	if err := yaml.Unmarshal([]byte(fullYAML), &document); err != nil {
		return "", fmt.Errorf("parse complete config YAML: %w", err)
	}
	root, err := yamlDocumentRootMapping(&document)
	if err != nil {
		return "", err
	}

	insertIndex, err := proxyGroupsInsertionLine(root)
	if err != nil {
		return "", err
	}

	lines, preserveTrailingNewline := splitConfigLines(fullYAML)
	groupLines := renderManagedServerAggregationGroupLines(managedGroups)
	if insertIndex < 0 || insertIndex > len(lines) {
		return "", fmt.Errorf("proxy-groups insertion line %d is out of range", insertIndex)
	}

	resultLines := make([]string, 0, len(lines)+len(groupLines))
	resultLines = append(resultLines, lines[:insertIndex]...)
	resultLines = append(resultLines, groupLines...)
	resultLines = append(resultLines, lines[insertIndex:]...)

	result := strings.Join(resultLines, "\n")
	if preserveTrailingNewline {
		result += "\n"
	}
	return result, nil
}

func buildManagedServerAggregationGroups(fullYAML string, snapshot Stage2Snapshot) ([]managedServerAggregationGroup, error) {
	if len(snapshot.ServerAggregationGroups) == 0 {
		return nil, nil
	}

	inlineProxies, err := parseInlineProxyList(fullYAML)
	if err != nil {
		return nil, fmt.Errorf("parse complete config proxies: %w", err)
	}
	proxyNames := make(map[string]struct{}, len(inlineProxies))
	for _, proxy := range inlineProxies {
		proxyNames[proxy.Name] = struct{}{}
	}

	proxyGroups, err := parseProxyGroups(fullYAML)
	if err != nil {
		return nil, fmt.Errorf("parse complete config proxy-groups: %w", err)
	}
	usedNames := make(map[string]struct{}, len(proxyNames)+len(proxyGroups)+len(snapshot.ServerAggregationGroups))
	for name := range proxyNames {
		usedNames[name] = struct{}{}
	}
	for name := range proxyGroups {
		usedNames[name] = struct{}{}
	}

	rowsByID := make(map[string]Stage2Row, len(snapshot.Rows))
	for _, row := range snapshot.Rows {
		rowsByID[row.rowIDOrFallback()] = row
	}

	managedGroups := make([]managedServerAggregationGroup, 0, len(snapshot.ServerAggregationGroups))
	for _, group := range snapshot.ServerAggregationGroups {
		if !group.Enabled {
			continue
		}
		members := make([]string, 0, len(group.MemberRowIDs))
		for _, memberRowID := range group.MemberRowIDs {
			row, exists := rowsByID[strings.TrimSpace(memberRowID)]
			if !exists {
				return nil, fmt.Errorf("server aggregation group member rowId %q is missing from stage2Snapshot.rows", memberRowID)
			}
			memberName := row.proxyNameOrFallback()
			if _, exists := proxyNames[memberName]; !exists {
				return nil, fmt.Errorf("server aggregation group member proxy %q is missing from complete config", memberName)
			}
			members = append(members, memberName)
		}
		managedName := nextManagedServerAggregationGroupName(group.Server, usedNames)
		usedNames[managedName] = struct{}{}
		managedGroups = append(managedGroups, managedServerAggregationGroup{
			Name:    managedName,
			Type:    group.Strategy,
			Members: members,
		})
	}

	return managedGroups, nil
}

func nextManagedServerAggregationGroupName(server string, usedNames map[string]struct{}) string {
	baseName := strings.TrimSpace(server)
	if baseName == "" {
		baseName = "server"
	}
	baseName = "srv:" + baseName
	if _, exists := usedNames[baseName]; !exists {
		return baseName
	}

	for index := 2; ; index += 1 {
		candidate := fmt.Sprintf("%s %d", baseName, index)
		if _, exists := usedNames[candidate]; !exists {
			return candidate
		}
	}
}

func renderManagedServerAggregationGroupLines(groups []managedServerAggregationGroup) []string {
	lines := make([]string, 0, len(groups)*8)
	for _, group := range groups {
		lines = append(lines,
			"  - name: "+group.Name,
			"    type: "+group.Type,
			"    url: "+aggressiveChainGroupURL,
			"    interval: "+aggressiveChainGroupInterval,
			"    timeout: "+aggressiveChainGroupTimeout,
			"    lazy: false",
			"    max-failed-times: "+aggressiveChainGroupMaxFailedTimes,
			"    proxies:",
		)
		for _, member := range group.Members {
			lines = append(lines, "      - "+member)
		}
	}
	return lines
}

func proxyGroupsInsertionLine(root *yaml.Node) (int, error) {
	if root == nil || root.Kind != yaml.MappingNode {
		return 0, fmt.Errorf("complete config root must be a mapping")
	}

	for index := 0; index+1 < len(root.Content); index += 2 {
		keyNode := root.Content[index]
		if keyNode.Value != "proxy-groups" {
			continue
		}
		nextKeyIndex := index + 2
		if nextKeyIndex >= len(root.Content) {
			return len(root.Content), nil
		}
		nextKeyLine := root.Content[nextKeyIndex].Line - 1
		if nextKeyLine < 0 {
			return 0, fmt.Errorf("proxy-groups next key line %d is invalid", root.Content[nextKeyIndex].Line)
		}
		return nextKeyLine, nil
	}

	return 0, fmt.Errorf("complete config YAML is missing proxy-groups")
}
