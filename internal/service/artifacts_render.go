package service

import (
	"fmt"
	"strings"

	"gopkg.in/yaml.v3"
)

func renderCompleteConfigYAML(fullBaseYAML string, rows []Stage2Row, landingNames map[string]struct{}, regionGroupNames map[string]struct{}) (string, error) {
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

	if err := stripLandingNodesFromRegionGroups(root, landingNames, regionGroupNames, deletedLines); err != nil {
		return "", err
	}
	if err := applySnapshotToInlineProxies(root, rows, lines, replacedLines); err != nil {
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
