package service

import (
	"fmt"
	"regexp"
	"strings"

	"gopkg.in/yaml.v3"
)

var managedLandingCopySuffixPattern = regexp.MustCompile(`^(.*) (\d+)$`)

// SynthesizeManagedPass3FullBaseYAML rewrites a stage1 full-base fixture into a
// managed-Pass-3-shaped full-base for offline tests: proxies come from managed
// landing + transit, and discovery landing names in proxy-groups are expanded to
// the corresponding managed proxyNames (including copies).
func SynthesizeManagedPass3FullBaseYAML(
	stage1FullBaseYAML string,
	landingDiscoveryYAML string,
	managedLandingYAML string,
	managedTransitProxiesYAML string,
) (string, error) {
	discoveryNames, err := inlineProxyNames(landingDiscoveryYAML)
	if err != nil {
		return "", fmt.Errorf("parse landing discovery proxies: %w", err)
	}
	discoverySet := make(map[string]struct{}, len(discoveryNames))
	for _, name := range discoveryNames {
		discoverySet[name] = struct{}{}
	}

	managedLandingLines, managedLandingNames, err := inlineProxyLinesAndNames(managedLandingYAML)
	if err != nil {
		return "", fmt.Errorf("parse managed landing proxies: %w", err)
	}
	managedTransitLines, _, err := inlineProxyLinesAndNames(managedTransitProxiesYAML)
	if err != nil {
		return "", fmt.Errorf("parse managed transit proxies: %w", err)
	}

	managedByDiscovery := map[string][]string{}
	for _, managedName := range managedLandingNames {
		matched := false
		for _, discoveryName := range discoveryNames {
			if managedLandingMatchesDiscovery(discoveryName, managedName) {
				managedByDiscovery[discoveryName] = append(managedByDiscovery[discoveryName], managedName)
				matched = true
				break
			}
		}
		if !matched {
			return "", fmt.Errorf("managed landing proxy %q does not match any landing discovery name", managedName)
		}
	}

	return rewriteCompleteConfigYAML(stage1FullBaseYAML, func(root *yaml.Node, lines []string, deletedLines map[int]struct{}, replacedLines map[int]string) error {
		if err := replaceProxiesSectionLines(root, lines, deletedLines, replacedLines, append(append([]string{}, managedLandingLines...), managedTransitLines...)); err != nil {
			return err
		}
		return expandDiscoveryLandingMembersInProxyGroups(root, lines, deletedLines, replacedLines, discoverySet, managedByDiscovery)
	})
}

func managedLandingMatchesDiscovery(discoveryName, managedName string) bool {
	discoveryName = strings.TrimSpace(discoveryName)
	managedName = strings.TrimSpace(managedName)
	if discoveryName == "" || managedName == "" {
		return false
	}
	if discoveryName == managedName {
		return true
	}
	managedBase := managedLandingBaseName(managedName)
	if managedBase == discoveryName {
		return true
	}
	return managedBase == managedLandingBaseName(discoveryName)
}

func managedLandingBaseName(name string) string {
	base := strings.TrimSpace(removeLeadingEmojis(strings.TrimSpace(name)))
	if match := managedLandingCopySuffixPattern.FindStringSubmatch(base); match != nil {
		return match[1]
	}
	return base
}

func inlineProxyNames(raw string) ([]string, error) {
	proxies, err := parseInlineProxyList(raw)
	if err != nil {
		return nil, err
	}
	names := make([]string, 0, len(proxies))
	for _, proxy := range proxies {
		names = append(names, proxy.Name)
	}
	return names, nil
}

func inlineProxyLinesAndNames(raw string) ([]string, []string, error) {
	linesByName, err := indexInlineProxyLinesByName(raw)
	if err != nil {
		return nil, nil, err
	}
	proxies, err := parseInlineProxyList(raw)
	if err != nil {
		return nil, nil, err
	}
	lines := make([]string, 0, len(proxies))
	names := make([]string, 0, len(proxies))
	for _, proxy := range proxies {
		line, ok := linesByName[proxy.Name]
		if !ok {
			return nil, nil, fmt.Errorf("proxy %q not found in indexed lines", proxy.Name)
		}
		lines = append(lines, strings.TrimRight(line, "\r\n"))
		names = append(names, proxy.Name)
	}
	return lines, names, nil
}

func replaceProxiesSectionLines(
	root *yaml.Node,
	lines []string,
	deletedLines map[int]struct{},
	replacedLines map[int]string,
	proxyLines []string,
) error {
	if root == nil || root.Kind != yaml.MappingNode {
		return fmt.Errorf("full-base YAML root must be a mapping")
	}

	var proxiesKeyNode *yaml.Node
	var proxiesNode *yaml.Node
	for index := 0; index+1 < len(root.Content); index += 2 {
		keyNode := root.Content[index]
		if keyNode.Value != "proxies" {
			continue
		}
		proxiesKeyNode = keyNode
		proxiesNode = root.Content[index+1]
		break
	}
	if proxiesKeyNode == nil || proxiesNode == nil {
		return fmt.Errorf("full-base YAML is missing proxies")
	}
	if proxiesNode.Kind != yaml.SequenceNode {
		return fmt.Errorf("full-base YAML field %q must be a sequence", "proxies")
	}
	if proxiesKeyNode.Line <= 0 || proxiesKeyNode.Line > len(lines) {
		return fmt.Errorf("proxies section line %d is out of range", proxiesKeyNode.Line)
	}

	for _, proxyNode := range proxiesNode.Content {
		if proxyNode.Line > 0 {
			deletedLines[proxyNode.Line-1] = struct{}{}
		}
	}

	headerIndex := proxiesKeyNode.Line - 1
	if len(proxyLines) == 0 {
		replacedLines[headerIndex] = lines[headerIndex]
		return nil
	}
	replacedLines[headerIndex] = lines[headerIndex] + "\n" + strings.Join(proxyLines, "\n")
	return nil
}

func expandDiscoveryLandingMembersInProxyGroups(
	root *yaml.Node,
	lines []string,
	deletedLines map[int]struct{},
	replacedLines map[int]string,
	discoverySet map[string]struct{},
	managedByDiscovery map[string][]string,
) error {
	proxyGroupsNode := yamlMappingValue(root, "proxy-groups")
	if proxyGroupsNode == nil {
		return fmt.Errorf("full-base YAML is missing proxy-groups")
	}
	if proxyGroupsNode.Kind != yaml.SequenceNode {
		return fmt.Errorf("full-base YAML field %q must be a sequence", "proxy-groups")
	}

	for index, groupNode := range proxyGroupsNode.Content {
		if groupNode.Kind != yaml.MappingNode {
			return fmt.Errorf("proxy-group entry must be a mapping")
		}
		membersNode := yamlMappingValue(groupNode, "proxies")
		if membersNode == nil || membersNode.Kind != yaml.SequenceNode || len(membersNode.Content) == 0 {
			continue
		}

		existingMembers := make([]string, 0, len(membersNode.Content))
		memberLineIndexes := make([]int, 0, len(membersNode.Content))
		needsRewrite := false
		for _, memberNode := range membersNode.Content {
			if memberNode.Kind != yaml.ScalarNode {
				continue
			}
			existingMembers = append(existingMembers, memberNode.Value)
			if memberNode.Line > 0 {
				memberLineIndexes = append(memberLineIndexes, memberNode.Line-1)
			}
			if _, ok := discoverySet[memberNode.Value]; ok {
				needsRewrite = true
			}
		}
		if !needsRewrite {
			continue
		}

		expanded := make([]string, 0, len(existingMembers))
		for _, member := range existingMembers {
			if managedNames, ok := managedByDiscovery[member]; ok {
				expanded = append(expanded, managedNames...)
				continue
			}
			expanded = append(expanded, member)
		}

		for _, lineIndex := range memberLineIndexes {
			deletedLines[lineIndex] = struct{}{}
		}

		proxiesLineIndex := proxyGroupProxiesLineIndex(groupNode)
		if proxiesLineIndex < 0 || proxiesLineIndex >= len(lines) {
			return fmt.Errorf("proxy-group proxies line is out of range")
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
		indent := proxyGroupMemberIndent(lines, startIndex, endIndex)
		var builder strings.Builder
		builder.WriteString(lines[proxiesLineIndex])
		for _, name := range expanded {
			builder.WriteByte('\n')
			builder.WriteString(indent)
			builder.WriteString("- ")
			builder.WriteString(name)
		}
		replacedLines[proxiesLineIndex] = builder.String()
	}
	return nil
}
