package service

import (
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

const aggressiveChainProxyGroupHealthCheckURL = "https://cp.cloudflare.com/generate_204"

func renderCompleteConfigYAML(fullBaseYAML string, rows []Stage2Row, landingNames map[string]struct{}, regionGroupNames map[string]struct{}) (string, error) {
	return rewriteCompleteConfigYAML(fullBaseYAML, func(root *yaml.Node, lines []string, deletedLines map[int]struct{}, replacedLines map[int]string) error {
		if err := stripLandingNodesFromRegionGroups(root, landingNames, regionGroupNames, deletedLines); err != nil {
			return err
		}
		if err := applySnapshotToInlineProxies(root, rows, lines, replacedLines); err != nil {
			return err
		}
		if err := applyChainProxyGroupProfiles(root, rows, lines, deletedLines, replacedLines); err != nil {
			return err
		}
		return nil
	})
}

func stripLandingNodesFromCompleteConfigYAML(fullBaseYAML string, rows []Stage2Row, landingNames map[string]struct{}, regionGroupNames map[string]struct{}) (string, error) {
	return rewriteCompleteConfigYAML(fullBaseYAML, func(root *yaml.Node, lines []string, deletedLines map[int]struct{}, replacedLines map[int]string) error {
		if err := stripLandingNodesFromRegionGroups(root, landingNames, regionGroupNames, deletedLines); err != nil {
			return err
		}
		return applyChainProxyGroupProfiles(root, rows, lines, deletedLines, replacedLines)
	})
}

func rewriteCompleteConfigYAML(fullBaseYAML string, rewrite func(root *yaml.Node, lines []string, deletedLines map[int]struct{}, replacedLines map[int]string) error) (string, error) {
	var document yaml.Node
	if err := yaml.Unmarshal([]byte(fullBaseYAML), &document); err != nil {
		return "", fmt.Errorf("parse full-base YAML: %w", err)
	}

	root, err := yamlDocumentRootMapping(&document)
	if err != nil {
		return "", err
	}

	lines, preserveTrailingNewline := splitConfigLines(fullBaseYAML)
	deletedLines := make(map[int]struct{})
	replacedLines := make(map[int]string)

	if err := rewrite(root, lines, deletedLines, replacedLines); err != nil {
		return "", err
	}

	filtered := make([]string, 0, len(lines))
	for index, line := range lines {
		if _, deleted := deletedLines[index]; deleted {
			continue
		}
		if replacement, ok := replacedLines[index]; ok {
			filtered = append(filtered, replacement)
			continue
		}
		filtered = append(filtered, line)
	}

	result := strings.Join(filtered, "\n")
	if preserveTrailingNewline {
		result += "\n"
	}
	return result, nil
}

func stripLandingNodesFromRegionGroups(root *yaml.Node, landingNames map[string]struct{}, regionGroupNames map[string]struct{}, deletedLines map[int]struct{}) error {
	proxyGroupsNode := yamlMappingValue(root, "proxy-groups")
	if proxyGroupsNode == nil {
		return fmt.Errorf("full-base YAML is missing proxy-groups")
	}
	if proxyGroupsNode.Kind != yaml.SequenceNode {
		return fmt.Errorf("full-base YAML field %q must be a sequence", "proxy-groups")
	}

	for _, groupNode := range proxyGroupsNode.Content {
		if groupNode.Kind != yaml.MappingNode {
			return fmt.Errorf("proxy-group entry must be a mapping")
		}

		nameNode := yamlMappingValue(groupNode, "name")
		if nameNode == nil {
			return fmt.Errorf("proxy-group entry is missing name")
		}
		if _, ok := regionGroupNames[nameNode.Value]; !ok {
			continue
		}

		membersNode := yamlMappingValue(groupNode, "proxies")
		if membersNode == nil {
			return fmt.Errorf("region proxy-group %q is missing proxies", nameNode.Value)
		}
		if membersNode.Kind != yaml.SequenceNode {
			return fmt.Errorf("proxy-group %q field %q must be a sequence", nameNode.Value, "proxies")
		}

		filtered := membersNode.Content[:0]
		for _, memberNode := range membersNode.Content {
			if memberNode.Kind == yaml.ScalarNode {
				if _, exists := landingNames[memberNode.Value]; exists {
					if memberNode.Line > 0 {
						deletedLines[memberNode.Line-1] = struct{}{}
					}
					continue
				}
			}
			filtered = append(filtered, memberNode)
		}
		membersNode.Content = filtered
	}

	return nil
}

func applySnapshotToInlineProxies(root *yaml.Node, rows []Stage2Row, lines []string, replacedLines map[int]string) error {
	rowsByLanding := make(map[string]Stage2Row, len(rows))
	for _, row := range rows {
		rowsByLanding[row.LandingNodeName] = row
	}

	proxiesNode := yamlMappingValue(root, "proxies")
	if proxiesNode == nil {
		return fmt.Errorf("full-base YAML is missing proxies")
	}
	if proxiesNode.Kind != yaml.SequenceNode {
		return fmt.Errorf("full-base YAML field %q must be a sequence", "proxies")
	}

	for _, proxyNode := range proxiesNode.Content {
		if proxyNode.Kind != yaml.MappingNode {
			return fmt.Errorf("proxy entry must be a mapping")
		}

		nameNode := yamlMappingValue(proxyNode, "name")
		if nameNode == nil {
			return fmt.Errorf("proxy entry is missing name")
		}

		row, exists := rowsByLanding[nameNode.Value]
		if !exists {
			continue
		}

		lineIndex := proxyNode.Line - 1
		if lineIndex < 0 || lineIndex >= len(lines) {
			return fmt.Errorf("proxy line %d is out of range", proxyNode.Line)
		}

		updatedLine, err := applyRowToInlineProxyLine(lines[lineIndex], row)
		if err != nil {
			return fmt.Errorf("apply stage2 row for landing node %q: %w", nameNode.Value, err)
		}
		replacedLines[lineIndex] = updatedLine
	}

	return nil
}

func applyChainProxyGroupProfiles(root *yaml.Node, rows []Stage2Row, lines []string, deletedLines map[int]struct{}, replacedLines map[int]string) error {
	profilesByTarget := collectChainProxyGroupProfiles(rows)
	if len(profilesByTarget) == 0 {
		return nil
	}

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

		nameNode := yamlMappingValue(groupNode, "name")
		if nameNode == nil {
			return fmt.Errorf("proxy-group entry is missing name")
		}

		profile, ok := profilesByTarget[nameNode.Value]
		if !ok {
			continue
		}

		if err := applyChainProxyGroupProfileNode(groupNode, profile); err != nil {
			return fmt.Errorf("apply chain proxy-group profile for %q: %w", nameNode.Value, err)
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

		replacement, err := renderProxyGroupBlock(groupNode, leadingWhitespace(lines[startIndex]))
		if err != nil {
			return fmt.Errorf("render proxy-group %q: %w", nameNode.Value, err)
		}
		replacedLines[startIndex] = replacement
		for lineIndex := startIndex + 1; lineIndex < endIndex; lineIndex++ {
			deletedLines[lineIndex] = struct{}{}
		}
	}

	return nil
}

func collectChainProxyGroupProfiles(rows []Stage2Row) map[string]string {
	profilesByTarget := make(map[string]string)
	for _, row := range rows {
		if row.Mode != "chain" || row.TargetName == nil {
			continue
		}
		profile := normalizeChainProxyGroupProfile(row.ChainProxyGroupProfile)
		if profile == "" {
			continue
		}
		profilesByTarget[strings.TrimSpace(*row.TargetName)] = profile
	}
	return profilesByTarget
}

func applyChainProxyGroupProfileNode(groupNode *yaml.Node, profile string) error {
	membersNode := yamlMappingValue(groupNode, "proxies")
	if membersNode == nil {
		nameNode := yamlMappingValue(groupNode, "name")
		groupName := ""
		if nameNode != nil {
			groupName = nameNode.Value
		}
		return fmt.Errorf("proxy-group %q is missing proxies", groupName)
	}

	urlValue := aggressiveChainProxyGroupHealthCheckURL
	yamlMappingSetScalar(groupNode, "url", urlValue, "!!str")
	yamlMappingSetScalar(groupNode, "interval", "60", "!!int")
	yamlMappingSetScalar(groupNode, "lazy", "false", "!!bool")
	yamlMappingSetScalar(groupNode, "timeout", "2000", "!!int")
	yamlMappingSetScalar(groupNode, "max-failed-times", "1", "!!int")

	switch normalizeChainProxyGroupProfile(profile) {
	case ChainProxyGroupProfileAggressiveFallback:
		yamlMappingSetScalar(groupNode, "type", "fallback", "!!str")
		yamlMappingDelete(groupNode, "tolerance")
	case ChainProxyGroupProfileAggressiveURLTest:
		yamlMappingSetScalar(groupNode, "type", "url-test", "!!str")
		yamlMappingSetScalar(groupNode, "tolerance", "1", "!!int")
	default:
		return fmt.Errorf("unsupported chain proxy-group profile %q", profile)
	}

	return nil
}

func renderProxyGroupBlock(groupNode *yaml.Node, indent string) (string, error) {
	sequence := &yaml.Node{Kind: yaml.SequenceNode, Content: []*yaml.Node{groupNode}}
	document := &yaml.Node{Kind: yaml.DocumentNode, Content: []*yaml.Node{sequence}}
	encoded, err := yaml.Marshal(document)
	if err != nil {
		return "", fmt.Errorf("marshal proxy-group block: %w", err)
	}
	block := strings.TrimSuffix(string(encoded), "\n")
	if indent == "" {
		return block, nil
	}
	parts := strings.Split(block, "\n")
	for index, part := range parts {
		parts[index] = indent + part
	}
	return strings.Join(parts, "\n"), nil
}

func leadingWhitespace(line string) string {
	trimmed := strings.TrimLeft(line, " \t")
	return line[:len(line)-len(trimmed)]
}

func applyRowToInlineProxyLine(line string, row Stage2Row) (string, error) {
	prefix, fields, err := parseInlineProxyLine(line)
	if err != nil {
		return "", err
	}

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

func yamlDocumentRootMapping(document *yaml.Node) (*yaml.Node, error) {
	if document.Kind != yaml.DocumentNode || len(document.Content) != 1 {
		return nil, fmt.Errorf("full-base YAML must contain a single document")
	}
	root := document.Content[0]
	if root.Kind != yaml.MappingNode {
		return nil, fmt.Errorf("full-base YAML root must be a mapping")
	}
	return root, nil
}

func yamlMappingValue(mapping *yaml.Node, key string) *yaml.Node {
	if mapping == nil || mapping.Kind != yaml.MappingNode {
		return nil
	}
	for i := 0; i+1 < len(mapping.Content); i += 2 {
		if mapping.Content[i].Value == key {
			return mapping.Content[i+1]
		}
	}
	return nil
}

func yamlMappingSetScalar(mapping *yaml.Node, key string, value string, tag string) {
	if mapping == nil || mapping.Kind != yaml.MappingNode {
		return
	}
	for index := 0; index+1 < len(mapping.Content); index += 2 {
		if mapping.Content[index].Value != key {
			continue
		}
		mapping.Content[index+1] = &yaml.Node{Kind: yaml.ScalarNode, Tag: tag, Value: value}
		return
	}
	mapping.Content = append(mapping.Content,
		&yaml.Node{Kind: yaml.ScalarNode, Tag: "!!str", Value: key},
		&yaml.Node{Kind: yaml.ScalarNode, Tag: tag, Value: value},
	)
}

func yamlMappingDelete(mapping *yaml.Node, key string) {
	if mapping == nil || mapping.Kind != yaml.MappingNode {
		return
	}
	filtered := mapping.Content[:0]
	for index := 0; index+1 < len(mapping.Content); index += 2 {
		if mapping.Content[index].Value == key {
			continue
		}
		filtered = append(filtered, mapping.Content[index], mapping.Content[index+1])
	}
	mapping.Content = filtered
}

type inlineProxyField struct {
	Key   string
	Value string
}

func splitConfigLines(value string) ([]string, bool) {
	preserveTrailingNewline := strings.HasSuffix(value, "\n")
	if preserveTrailingNewline {
		value = strings.TrimSuffix(value, "\n")
	}
	if value == "" {
		return []string{}, preserveTrailingNewline
	}
	return strings.Split(value, "\n"), preserveTrailingNewline
}

func parseInlineProxyLine(line string) (string, []inlineProxyField, error) {
	start := strings.Index(line, "{")
	end := strings.LastIndex(line, "}")
	if start < 0 || end < 0 || end < start {
		return "", nil, fmt.Errorf("inline proxy line %q is not a flow mapping", line)
	}

	prefix := line[:start]
	body := strings.TrimSpace(line[start+1 : end])
	if body == "" {
		return prefix, []inlineProxyField{}, nil
	}

	parts, err := splitTopLevelDelimited(body, ',')
	if err != nil {
		return "", nil, fmt.Errorf("parse inline proxy line %q: %w", line, err)
	}

	fields := make([]inlineProxyField, 0, len(parts))
	for _, part := range parts {
		key, value, err := splitTopLevelKeyValue(part)
		if err != nil {
			return "", nil, fmt.Errorf("parse inline proxy field %q: %w", part, err)
		}
		fields = append(fields, inlineProxyField{Key: key, Value: value})
	}

	return prefix, fields, nil
}

func splitTopLevelKeyValue(field string) (string, string, error) {
	segments, err := splitTopLevelDelimited(field, ':')
	if err != nil {
		return "", "", err
	}
	if len(segments) < 2 {
		return "", "", fmt.Errorf("missing key/value separator")
	}

	key := strings.TrimSpace(segments[0])
	value := strings.TrimSpace(strings.Join(segments[1:], ":"))
	if key == "" || value == "" {
		return "", "", fmt.Errorf("missing key or value")
	}
	return key, value, nil
}

func splitTopLevelDelimited(value string, delimiter rune) ([]string, error) {
	parts := make([]string, 0, 8)
	var current strings.Builder
	depth := 0
	quote := rune(0)
	escaped := false

	for _, r := range value {
		switch {
		case quote != 0:
			current.WriteRune(r)
			if escaped {
				escaped = false
				continue
			}
			if r == '\\' && quote == '"' {
				escaped = true
				continue
			}
			if r == quote {
				quote = 0
			}
		case r == '\'' || r == '"':
			quote = r
			current.WriteRune(r)
		case r == '{' || r == '[':
			depth++
			current.WriteRune(r)
		case r == '}' || r == ']':
			depth--
			if depth < 0 {
				return nil, fmt.Errorf("unexpected closing delimiter")
			}
			current.WriteRune(r)
		case r == delimiter && depth == 0:
			parts = append(parts, strings.TrimSpace(current.String()))
			current.Reset()
		default:
			current.WriteRune(r)
		}
	}

	if quote != 0 {
		return nil, fmt.Errorf("unterminated quoted string")
	}
	if depth != 0 {
		return nil, fmt.Errorf("unbalanced nested flow structure")
	}

	parts = append(parts, strings.TrimSpace(current.String()))
	return parts, nil
}

func hasInlineProxyField(fields []inlineProxyField, key string) bool {
	for _, field := range fields {
		if field.Key == key {
			return true
		}
	}
	return false
}

func deleteInlineProxyField(fields []inlineProxyField, key string) []inlineProxyField {
	filtered := fields[:0]
	for _, field := range fields {
		if field.Key == key {
			continue
		}
		filtered = append(filtered, field)
	}
	return filtered
}

func upsertInlineProxyField(fields []inlineProxyField, key string, value string) []inlineProxyField {
	for index, field := range fields {
		if field.Key == key {
			fields[index].Value = value
			return fields
		}
	}
	return append(fields, inlineProxyField{Key: key, Value: value})
}

func renderInlineProxyLine(prefix string, fields []inlineProxyField) string {
	parts := make([]string, 0, len(fields))
	for _, field := range fields {
		parts = append(parts, field.Key+": "+field.Value)
	}
	return prefix + "{" + strings.Join(parts, ", ") + "}"
}
