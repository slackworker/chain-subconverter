package service

import (
	"fmt"
	"strings"
	"unicode"

	"gopkg.in/yaml.v3"
)

const (
	serverAggregationGroupURL            = "https://cp.cloudflare.com/generate_204"
	serverAggregationGroupInterval       = "300"
	serverAggregationGroupTimeout        = "500"
	serverAggregationGroupMaxFailedTimes = "1"
)

type managedServerAggregationGroup struct {
	Name    string
	Type    string
	Members []string
}

func appendServerAggregationGroupsToCompleteConfigYAML(fullYAML string, snapshot Stage2Snapshot) (string, error) {
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

	lines, preserveTrailingNewline := splitConfigLines(fullYAML)
	insertIndex, err := proxyGroupsInsertionLine(root, len(lines))
	if err != nil {
		return "", err
	}
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
	usedNames := make(map[string]struct{}, len(proxyGroups)+len(snapshot.ServerAggregationGroups))
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
		memberSeen := make(map[string]struct{}, len(group.MemberRowIDs))
		members := make([]string, 0, len(group.MemberRowIDs))
		memberRows := make([]Stage2Row, 0, len(group.MemberRowIDs))
		for _, memberRowID := range group.MemberRowIDs {
			trimmedMemberRowID := strings.TrimSpace(memberRowID)
			if _, exists := memberSeen[trimmedMemberRowID]; exists {
				continue
			}
			memberSeen[trimmedMemberRowID] = struct{}{}

			row, exists := rowsByID[trimmedMemberRowID]
			if !exists {
				return nil, fmt.Errorf("server aggregation group member rowId %q is missing from stage2Snapshot.rows", memberRowID)
			}
			memberName := row.proxyNameOrFallback()
			if _, exists := proxyNames[memberName]; !exists {
				return nil, fmt.Errorf("server aggregation group member proxy %q is missing from complete config", memberName)
			}
			memberRows = append(memberRows, row)
			members = append(members, memberName)
		}
		managedName := nextManagedServerAggregationGroupName(
			deriveManagedServerAggregationGroupBaseName(group.Server, group.GroupName, memberRows),
			usedNames,
		)
		usedNames[managedName] = struct{}{}
		managedGroups = append(managedGroups, managedServerAggregationGroup{
			Name:    managedName,
			Type:    group.Strategy,
			Members: members,
		})
	}

	return managedGroups, nil
}

func deriveManagedServerAggregationGroupBaseName(server string, groupName string, memberRows []Stage2Row) string {
	if trimmedGroupName := strings.TrimSpace(groupName); trimmedGroupName != "" {
		return trimmedGroupName
	}
	baseName := strings.TrimSpace(server)
	if baseName == "" {
		baseName = "server"
	}
	defaultDisplayName := baseName
	if sourceFlagEmoji := detectServerGroupSourceFlagEmoji(memberRows); sourceFlagEmoji != "" {
		defaultDisplayName = sourceFlagEmoji + " " + baseName
	}
	return defaultDisplayName
}

func hasLegacySrvPrefix(name string) bool {
	trimmedName := strings.TrimSpace(name)
	if len(trimmedName) < 4 {
		return false
	}
	lower := strings.ToLower(trimmedName)
	if !strings.HasPrefix(lower, "srv") {
		return false
	}
	remainder := []rune(trimmedName[len("srv"):])
	index := 0
	for index < len(remainder) && unicode.IsSpace(remainder[index]) {
		index++
	}
	return index < len(remainder) && (remainder[index] == ':' || remainder[index] == '：')
}

func nextManagedServerAggregationGroupName(baseName string, usedNames map[string]struct{}) string {
	baseName = strings.TrimSpace(baseName)
	if baseName == "" {
		baseName = "server"
	}
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

func detectServerGroupSourceFlagEmoji(rows []Stage2Row) string {
	var sourceFlagEmoji string
	foundSourceRow := false
	for _, row := range rows {
		if !isServerGroupSourceRow(row) {
			continue
		}
		foundSourceRow = true
		currentFlagEmoji := leadingFlagEmoji(row.proxyNameOrFallback())
		if currentFlagEmoji == "" {
			return ""
		}
		if sourceFlagEmoji == "" {
			sourceFlagEmoji = currentFlagEmoji
			continue
		}
		if sourceFlagEmoji != currentFlagEmoji {
			return ""
		}
	}
	if !foundSourceRow {
		return ""
	}
	return sourceFlagEmoji
}

func isServerGroupSourceRow(row Stage2Row) bool {
	sourceLandingName := row.sourceLandingNodeNameOrFallback()
	if sourceLandingName == "" {
		return false
	}
	if rowID := strings.TrimSpace(row.RowID); rowID != "" {
		return rowID == sourceLandingName
	}
	if proxyName := strings.TrimSpace(row.ProxyName); proxyName != "" {
		return proxyName == sourceLandingName
	}
	return strings.TrimSpace(row.LandingNodeName) == sourceLandingName
}

func leadingFlagEmoji(name string) string {
	trimmedName := strings.TrimSpace(name)
	runes := []rune(trimmedName)
	if len(runes) < 2 {
		return ""
	}
	if !isRegionalIndicatorRune(runes[0]) || !isRegionalIndicatorRune(runes[1]) {
		return ""
	}
	if len(runes) > 2 && !unicode.IsSpace(runes[2]) {
		return ""
	}
	return string(runes[:2])
}

func isRegionalIndicatorRune(value rune) bool {
	return value >= 0x1F1E6 && value <= 0x1F1FF
}

func serverAggregationGroupNeedsHealthCheckFields(groupType string) bool {
	switch groupType {
	case "fallback", "url-test", "load-balance":
		return true
	default:
		return false
	}
}

func renderManagedServerAggregationGroupLines(groups []managedServerAggregationGroup) []string {
	lines := make([]string, 0, len(groups)*8)
	for _, group := range groups {
		lines = append(lines,
			"  - name: "+group.Name,
			"    type: "+group.Type,
		)
		if serverAggregationGroupNeedsHealthCheckFields(group.Type) {
			lines = append(lines,
				"    url: "+serverAggregationGroupURL,
				"    interval: "+serverAggregationGroupInterval,
				"    timeout: "+serverAggregationGroupTimeout,
				"    max-failed-times: "+serverAggregationGroupMaxFailedTimes,
			)
		}
		lines = append(lines, "    proxies:")
		for _, member := range group.Members {
			lines = append(lines, "      - "+member)
		}
	}
	return lines
}

func proxyGroupsInsertionLine(root *yaml.Node, totalLines int) (int, error) {
	if root == nil || root.Kind != yaml.MappingNode {
		return 0, fmt.Errorf("complete config root must be a mapping")
	}
	if totalLines < 0 {
		return 0, fmt.Errorf("complete config total lines %d is invalid", totalLines)
	}

	for index := 0; index+1 < len(root.Content); index += 2 {
		keyNode := root.Content[index]
		if keyNode.Value != "proxy-groups" {
			continue
		}
		nextKeyIndex := index + 2
		if nextKeyIndex >= len(root.Content) {
			return totalLines, nil
		}
		nextKeyLine := root.Content[nextKeyIndex].Line - 1
		if nextKeyLine < 0 {
			return 0, fmt.Errorf("proxy-groups next key line %d is invalid", root.Content[nextKeyIndex].Line)
		}
		return nextKeyLine, nil
	}

	return 0, fmt.Errorf("complete config YAML is missing proxy-groups")
}
