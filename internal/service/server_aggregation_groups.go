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
	serverAggregationGroupTimeout        = "1000"
	serverAggregationGroupMaxFailedTimes = "1"
)

type managedServerAggregationGroup struct {
	Name    string
	Type    string
	Members []string
}

func appendServerAggregationGroupsToCompleteConfigYAML(fullYAML string, snapshot Stage2Snapshot) (string, error) {
	snapshot = NormalizeStage2Snapshot(snapshot)
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
	return injectAggregationGroupsIntoSelectProxyGroups(result, managedGroups)
}

func shouldInjectAggregationIntoProxyGroup(groupName, groupType string, managedNames map[string]struct{}) bool {
	if groupType != "select" {
		return false
	}
	if _, isManaged := managedNames[groupName]; isManaged {
		return false
	}
	return true
}

func selectContainsAllDirectMembers(selectMembers, aggregationMembers []string) bool {
	if len(aggregationMembers) == 0 {
		return false
	}
	memberSet := make(map[string]struct{}, len(selectMembers))
	for _, member := range selectMembers {
		memberSet[member] = struct{}{}
	}
	for _, needed := range aggregationMembers {
		if _, ok := memberSet[needed]; !ok {
			return false
		}
	}
	return true
}

func matchingAggregationNamesForSelect(selectMembers []string, managedGroups []managedServerAggregationGroup) []string {
	matched := make([]string, 0, len(managedGroups))
	for _, group := range managedGroups {
		if selectContainsAllDirectMembers(selectMembers, group.Members) {
			matched = append(matched, group.Name)
		}
	}
	return matched
}

func prependAggregationNamesToProxies(existing, names []string) []string {
	if len(names) == 0 {
		return existing
	}

	nameSet := make(map[string]struct{}, len(names))
	for _, name := range names {
		nameSet[name] = struct{}{}
	}

	filtered := make([]string, 0, len(existing))
	for _, member := range existing {
		if _, duplicate := nameSet[member]; duplicate {
			continue
		}
		filtered = append(filtered, member)
	}

	result := make([]string, 0, len(names)+len(filtered))
	result = append(result, names...)
	result = append(result, filtered...)
	return result
}

func injectAggregationGroupsIntoSelectProxyGroups(fullYAML string, managedGroups []managedServerAggregationGroup) (string, error) {
	if len(managedGroups) == 0 {
		return fullYAML, nil
	}

	managedNames := make(map[string]struct{}, len(managedGroups))
	for _, group := range managedGroups {
		managedNames[group.Name] = struct{}{}
	}

	return rewriteCompleteConfigYAML(fullYAML, func(root *yaml.Node, lines []string, deletedLines map[int]struct{}, replacedLines map[int]string) error {
		return applyAggregationInjectionToProxyGroups(root, managedGroups, managedNames, lines, deletedLines, replacedLines)
	})
}

func applyAggregationInjectionToProxyGroups(
	root *yaml.Node,
	managedGroups []managedServerAggregationGroup,
	managedNames map[string]struct{},
	lines []string,
	deletedLines map[int]struct{},
	replacedLines map[int]string,
) error {
	proxyGroupsNode := yamlMappingValue(root, "proxy-groups")
	if proxyGroupsNode == nil {
		return fmt.Errorf("complete config YAML is missing proxy-groups")
	}
	if proxyGroupsNode.Kind != yaml.SequenceNode {
		return fmt.Errorf("complete config YAML field %q must be a sequence", "proxy-groups")
	}

	for index, groupNode := range proxyGroupsNode.Content {
		if groupNode.Kind != yaml.MappingNode {
			return fmt.Errorf("proxy-group entry must be a mapping")
		}

		nameNode := yamlMappingValue(groupNode, "name")
		if nameNode == nil {
			return fmt.Errorf("proxy-group entry is missing name")
		}

		groupType := ""
		if typeNode := yamlMappingValue(groupNode, "type"); typeNode != nil {
			groupType = typeNode.Value
		}
		if !shouldInjectAggregationIntoProxyGroup(nameNode.Value, groupType, managedNames) {
			continue
		}

		startIndex := groupNode.Line - 1
		if startIndex < 0 || startIndex >= len(lines) {
			return fmt.Errorf("proxy-group line %d is out of range", groupNode.Line)
		}

		endIndex := len(lines)
		if index+1 < len(proxyGroupsNode.Content) {
			nextIndex := proxyGroupsNode.Content[index+1].Line - 1
			if nextIndex > startIndex {
				endIndex = nextIndex
			}
		}

		if err := applyAggregationInjectionLines(groupNode, managedGroups, lines, startIndex, endIndex, deletedLines, replacedLines); err != nil {
			return fmt.Errorf("inject aggregation groups into %q: %w", nameNode.Value, err)
		}
	}

	return nil
}

func applyAggregationInjectionLines(
	groupNode *yaml.Node,
	managedGroups []managedServerAggregationGroup,
	lines []string,
	startIndex int,
	endIndex int,
	deletedLines map[int]struct{},
	replacedLines map[int]string,
) error {
	membersNode := yamlMappingValue(groupNode, "proxies")
	if membersNode == nil {
		nameNode := yamlMappingValue(groupNode, "name")
		groupName := ""
		if nameNode != nil {
			groupName = nameNode.Value
		}
		return fmt.Errorf("proxy-group %q is missing proxies", groupName)
	}

	existingMembers := make([]string, 0, len(membersNode.Content))
	memberLineIndexes := make([]int, 0, len(membersNode.Content))
	for _, memberNode := range membersNode.Content {
		if memberNode.Kind != yaml.ScalarNode {
			continue
		}
		existingMembers = append(existingMembers, memberNode.Value)
		if memberNode.Line > 0 {
			memberLineIndexes = append(memberLineIndexes, memberNode.Line-1)
		}
	}

	matchedNames := matchingAggregationNamesForSelect(existingMembers, managedGroups)
	if len(matchedNames) == 0 {
		return nil
	}

	for _, lineIndex := range memberLineIndexes {
		deletedLines[lineIndex] = struct{}{}
	}

	newMembers := prependAggregationNamesToProxies(existingMembers, matchedNames)

	proxiesLineIndex := proxyGroupProxiesLineIndex(groupNode)
	if proxiesLineIndex < 0 || proxiesLineIndex >= len(lines) {
		return fmt.Errorf("proxy-group proxies line %d is out of range", proxiesLineIndex+1)
	}

	memberIndent := proxyGroupMemberIndent(lines, startIndex, endIndex)
	memberLines := make([]string, 0, len(newMembers))
	for _, member := range newMembers {
		memberLines = append(memberLines, memberIndent+"- "+member)
	}
	replacedLines[proxiesLineIndex] = lines[proxiesLineIndex] + "\n" + strings.Join(memberLines, "\n")
	return nil
}

func proxyGroupProxiesLineIndex(groupNode *yaml.Node) int {
	if groupNode == nil || groupNode.Kind != yaml.MappingNode {
		return -1
	}
	for index := 0; index+1 < len(groupNode.Content); index += 2 {
		keyNode := groupNode.Content[index]
		if keyNode.Value != "proxies" {
			continue
		}
		if keyNode.Line > 0 {
			return keyNode.Line - 1
		}
		valueNode := groupNode.Content[index+1]
		if valueNode.Line > 0 {
			return valueNode.Line - 1
		}
	}
	return -1
}

func proxyGroupMemberIndent(lines []string, startIndex int, endIndex int) string {
	for lineIndex := startIndex + 1; lineIndex < endIndex; lineIndex++ {
		trimmed := strings.TrimLeft(lines[lineIndex], " \t")
		if strings.HasPrefix(trimmed, "- ") {
			return lines[lineIndex][:len(lines[lineIndex])-len(trimmed)]
		}
	}
	return "      "
}

func buildManagedServerAggregationGroups(fullYAML string, snapshot Stage2Snapshot) ([]managedServerAggregationGroup, error) {
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
	usedNames := make(map[string]struct{}, len(proxyGroups)+len(snapshot.Servers))
	for name := range proxyGroups {
		usedNames[name] = struct{}{}
	}

	managedGroups := make([]managedServerAggregationGroup, 0, len(snapshot.Servers))
	for _, server := range snapshot.Servers {
		if !server.Aggregation.Enabled {
			continue
		}
		memberProxyNames := append([]string(nil), server.Aggregation.MemberProxyNames...)
		if strings.TrimSpace(server.Aggregation.Strategy) != "fallback" {
			memberProxyNames = DFSMemberProxyNames(server, memberProxyNames)
		}
		members := make([]string, 0, len(memberProxyNames))
		memberInstances := make([]Stage2Instance, 0, len(memberProxyNames))
		seen := map[string]struct{}{}
		instanceByName := map[string]Stage2Instance{}
		for _, source := range server.Sources {
			for _, inst := range source.Instances {
				instanceByName[strings.TrimSpace(inst.ProxyName)] = inst
			}
		}
		for _, name := range memberProxyNames {
			if _, dup := seen[name]; dup {
				continue
			}
			seen[name] = struct{}{}
			if _, exists := proxyNames[name]; !exists {
				return nil, fmt.Errorf("server aggregation group member proxy %q is missing from complete config", name)
			}
			members = append(members, name)
			if inst, ok := instanceByName[name]; ok {
				memberInstances = append(memberInstances, inst)
			}
		}
		managedName := nextManagedServerAggregationGroupName(
			deriveManagedServerAggregationGroupBaseName(server.ServerKey, server.Aggregation.GroupName, memberInstances),
			usedNames,
		)
		usedNames[managedName] = struct{}{}
		managedGroups = append(managedGroups, managedServerAggregationGroup{
			Name:    managedName,
			Type:    server.Aggregation.Strategy,
			Members: members,
		})
	}

	return managedGroups, nil
}

func deriveManagedServerAggregationGroupBaseName(server string, groupName string, memberInstances []Stage2Instance) string {
	if trimmedGroupName := strings.TrimSpace(groupName); trimmedGroupName != "" {
		return trimmedGroupName
	}
	baseName := strings.TrimSpace(server)
	if baseName == "" {
		baseName = "server"
	}
	defaultDisplayName := baseName
	if sourceFlagEmoji := detectServerGroupSourceFlagEmoji(memberInstances); sourceFlagEmoji != "" {
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

func detectServerGroupSourceFlagEmoji(instances []Stage2Instance) string {
	var sourceFlagEmoji string
	found := false
	for _, inst := range instances {
		found = true
		currentFlagEmoji := leadingFlagEmoji(stage2ProxyName(inst))
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
	if !found {
		return ""
	}
	return sourceFlagEmoji
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
