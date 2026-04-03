package service

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"strconv"
	"strings"
	"time"

	"gopkg.in/yaml.v3"
)

const defaultLongURLMaxLength = 2048

type Message struct {
	Level   string         `json:"level"`
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Context map[string]any `json:"context,omitempty"`
}

type BlockingError struct {
	Code      string         `json:"code"`
	Message   string         `json:"message"`
	Scope     string         `json:"scope"`
	Retryable *bool          `json:"retryable,omitempty"`
	Context   map[string]any `json:"context,omitempty"`
}

type Stage1ConvertResponse struct {
	Stage2Init     Stage2Init      `json:"stage2Init"`
	Messages       []Message       `json:"messages"`
	BlockingErrors []BlockingError `json:"blockingErrors"`
}

type GenerateRequest struct {
	Stage1Input    Stage1Input    `json:"stage1Input"`
	Stage2Snapshot Stage2Snapshot `json:"stage2Snapshot"`
}

type GenerateResponse struct {
	LongURL        string          `json:"longUrl"`
	Messages       []Message       `json:"messages"`
	BlockingErrors []BlockingError `json:"blockingErrors"`
}

type LongURLPayload struct {
	V              int            `json:"v"`
	Stage1Input    Stage1Input    `json:"stage1Input"`
	Stage2Snapshot Stage2Snapshot `json:"stage2Snapshot"`
}

func BuildStage1ConvertResponse(stage1Input Stage1Input, fixtures ConversionFixtures) (Stage1ConvertResponse, error) {
	stage2Init, err := BuildStage2Init(stage1Input, fixtures)
	if err != nil {
		return Stage1ConvertResponse{}, err
	}

	return Stage1ConvertResponse{
		Stage2Init:     stage2Init,
		Messages:       []Message{},
		BlockingErrors: []BlockingError{},
	}, nil
}

func BuildGenerateResponse(publicBaseURL string, request GenerateRequest, fixtures ConversionFixtures, maxLongURLLength int) (GenerateResponse, error) {
	if _, err := validateGenerateSnapshot(request.Stage1Input, request.Stage2Snapshot, fixtures); err != nil {
		return GenerateResponse{}, err
	}

	longURL, err := EncodeLongURL(publicBaseURL, BuildLongURLPayload(request.Stage1Input, request.Stage2Snapshot), maxLongURLLength)
	if err != nil {
		return GenerateResponse{}, err
	}

	return GenerateResponse{
		LongURL:        longURL,
		Messages:       []Message{},
		BlockingErrors: []BlockingError{},
	}, nil
}

func BuildLongURLPayload(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot) LongURLPayload {
	return LongURLPayload{
		V:              1,
		Stage1Input:    stage1Input,
		Stage2Snapshot: stage2Snapshot,
	}
}

func EncodeLongURL(publicBaseURL string, payload LongURLPayload, maxLongURLLength int) (string, error) {
	if payload.V != 1 {
		return "", fmt.Errorf("unsupported long URL payload version %d", payload.V)
	}

	payloadJSON, err := marshalCanonicalLongURLPayload(payload)
	if err != nil {
		return "", fmt.Errorf("marshal long URL payload: %w", err)
	}

	var compressed bytes.Buffer
	gzipWriter, err := gzip.NewWriterLevel(&compressed, gzip.BestCompression)
	if err != nil {
		return "", fmt.Errorf("create gzip writer: %w", err)
	}
	gzipWriter.Header.ModTime = time.Unix(0, 0)
	if _, err := gzipWriter.Write(payloadJSON); err != nil {
		return "", fmt.Errorf("gzip payload: %w", err)
	}
	if err := gzipWriter.Close(); err != nil {
		return "", fmt.Errorf("close gzip writer: %w", err)
	}

	encodedData := base64.RawURLEncoding.EncodeToString(compressed.Bytes())
	longURL, err := joinSubscriptionURL(publicBaseURL, encodedData)
	if err != nil {
		return "", err
	}

	maxLength := maxLongURLLength
	if maxLength <= 0 {
		maxLength = defaultLongURLMaxLength
	}
	if len(longURL) > maxLength {
		return "", fmt.Errorf("long URL exceeds %d bytes", maxLength)
	}

	return longURL, nil
}

func DecodeLongURLPayload(longURL string) (LongURLPayload, error) {
	parsedURL, err := url.Parse(longURL)
	if err != nil {
		return LongURLPayload{}, fmt.Errorf("parse long URL: %w", err)
	}

	data := parsedURL.Query().Get("data")
	if data == "" {
		return LongURLPayload{}, fmt.Errorf("missing data query parameter")
	}

	compressed, err := base64.RawURLEncoding.DecodeString(data)
	if err != nil {
		return LongURLPayload{}, fmt.Errorf("decode base64url payload: %w", err)
	}

	gzipReader, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return LongURLPayload{}, fmt.Errorf("open gzip payload: %w", err)
	}
	defer gzipReader.Close()

	payloadJSON, err := io.ReadAll(gzipReader)
	if err != nil {
		return LongURLPayload{}, fmt.Errorf("read gzip payload: %w", err)
	}

	var payload LongURLPayload
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return LongURLPayload{}, fmt.Errorf("unmarshal long URL payload: %w", err)
	}
	if payload.V != 1 {
		return LongURLPayload{}, fmt.Errorf("unsupported long URL payload version %d", payload.V)
	}

	return payload, nil
}

func RenderCompleteConfig(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, fixtures ConversionFixtures) (string, error) {
	landingProxies, err := validateGenerateSnapshot(stage1Input, stage2Snapshot, fixtures)
	if err != nil {
		return "", err
	}

	landingNames := make(map[string]struct{}, len(landingProxies))
	for _, landing := range landingProxies {
		landingNames[landing.Name] = struct{}{}
	}

	rendered, err := renderCompleteConfigYAML(fixtures.FullBaseYAML, stage2Snapshot.Rows, landingNames)
	if err != nil {
		return "", err
	}

	return rendered, nil
}

func renderCompleteConfigYAML(fullBaseYAML string, rows []Stage2Row, landingNames map[string]struct{}) (string, error) {
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

	if err := stripLandingNodesFromDefaultRegionGroups(root, landingNames, deletedLines); err != nil {
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
			return nil, fmt.Errorf("duplicate stage2 row for landing node %q", row.LandingNodeName)
		}
		rowsByLanding[row.LandingNodeName] = row
	}

	if len(rowsByLanding) != len(landingProxies) {
		return nil, fmt.Errorf("stage2 rowset size mismatch: got %d rows want %d", len(rowsByLanding), len(landingProxies))
	}

	chainTargetNames := make(map[string]struct{}, len(stage2Init.ChainTargets))
	for _, target := range stage2Init.ChainTargets {
		chainTargetNames[target.Name] = struct{}{}
	}

	forwardRelayNames := make(map[string]struct{}, len(stage2Init.ForwardRelays))
	for _, relay := range stage2Init.ForwardRelays {
		forwardRelayNames[relay.Name] = struct{}{}
	}

	for _, landing := range landingProxies {
		row, exists := rowsByLanding[landing.Name]
		if !exists {
			return nil, fmt.Errorf("missing stage2 row for landing node %q", landing.Name)
		}

		switch row.Mode {
		case "none":
			if row.TargetName != nil && strings.TrimSpace(*row.TargetName) != "" {
				return nil, fmt.Errorf("targetName must be empty for landing node %q when mode is none", landing.Name)
			}
			continue
		case "chain":
			targetName, err := requireTargetName(row)
			if err != nil {
				return nil, err
			}
			if landing.Type == "vless-reality" {
				return nil, fmt.Errorf("landing node %q does not allow chain mode", landing.Name)
			}
			if _, exists := chainTargetNames[targetName]; !exists {
				return nil, fmt.Errorf("unknown chain target %q for landing node %q", targetName, landing.Name)
			}
		case "port_forward":
			targetName, err := requireTargetName(row)
			if err != nil {
				return nil, err
			}
			if _, exists := forwardRelayNames[targetName]; !exists {
				return nil, fmt.Errorf("unknown forward relay %q for landing node %q", targetName, landing.Name)
			}
		default:
			return nil, fmt.Errorf("unsupported mode %q for landing node %q", row.Mode, landing.Name)
		}
	}

	for rowName := range rowsByLanding {
		if _, exists := landingByName[rowName]; !exists {
			return nil, fmt.Errorf("unknown landing node %q in stage2 snapshot", rowName)
		}
	}

	return landingProxies, nil
}

func stripLandingNodesFromDefaultRegionGroups(root *yaml.Node, landingNames map[string]struct{}, deletedLines map[int]struct{}) error {
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
		if !isDefaultRegionGroup(nameNode.Value) {
			continue
		}

		membersNode := yamlMappingValue(groupNode, "proxies")
		if membersNode == nil {
			return fmt.Errorf("default region proxy-group %q is missing proxies", nameNode.Value)
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

func requireTargetName(row Stage2Row) (string, error) {
	if row.TargetName == nil || strings.TrimSpace(*row.TargetName) == "" {
		return "", fmt.Errorf("missing targetName for landing node %q", row.LandingNodeName)
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

func isDefaultRegionGroup(groupName string) bool {
	for _, candidate := range defaultRegionGroupOrder {
		if candidate == groupName {
			return true
		}
	}
	return false
}

func joinSubscriptionURL(publicBaseURL string, data string) (string, error) {
	parsedURL, err := url.Parse(publicBaseURL)
	if err != nil {
		return "", fmt.Errorf("parse public base URL: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return "", fmt.Errorf("public base URL must include scheme and host")
	}

	trimmedPath := strings.TrimSuffix(parsedURL.Path, "/")
	parsedURL.Path = trimmedPath + "/subscription"
	parsedURL.RawQuery = url.Values{"data": []string{data}}.Encode()
	parsedURL.Fragment = ""
	return parsedURL.String(), nil
}

func marshalCanonicalLongURLPayload(payload LongURLPayload) ([]byte, error) {
	var buffer bytes.Buffer
	buffer.WriteByte('{')
	buffer.WriteString(`"stage1Input":`)
	marshalStage1Input(&buffer, payload.Stage1Input)
	buffer.WriteByte(',')
	buffer.WriteString(`"stage2Snapshot":`)
	marshalStage2Snapshot(&buffer, payload.Stage2Snapshot)
	buffer.WriteByte(',')
	buffer.WriteString(`"v":`)
	buffer.WriteString(strconv.Itoa(payload.V))
	buffer.WriteByte('}')
	return buffer.Bytes(), nil
}

func marshalStage1Input(buffer *bytes.Buffer, input Stage1Input) {
	buffer.WriteByte('{')
	buffer.WriteString(`"advancedOptions":`)
	marshalAdvancedOptions(buffer, input.AdvancedOptions)
	buffer.WriteByte(',')
	buffer.WriteString(`"forwardRelayRawText":`)
	writeJSONString(buffer, input.ForwardRelayRawText)
	buffer.WriteByte(',')
	buffer.WriteString(`"landingRawText":`)
	writeJSONString(buffer, input.LandingRawText)
	buffer.WriteByte(',')
	buffer.WriteString(`"transitRawText":`)
	writeJSONString(buffer, input.TransitRawText)
	buffer.WriteByte('}')
}

func marshalAdvancedOptions(buffer *bytes.Buffer, options AdvancedOptions) {
	buffer.WriteByte('{')
	buffer.WriteString(`"config":`)
	writeJSONString(buffer, options.Config)
	buffer.WriteByte(',')
	buffer.WriteString(`"emoji":`)
	writeJSONBool(buffer, options.Emoji)
	buffer.WriteByte(',')
	buffer.WriteString(`"enablePortForward":`)
	writeJSONBool(buffer, options.EnablePortForward)
	buffer.WriteByte(',')
	buffer.WriteString(`"exclude":`)
	writeJSONString(buffer, options.Exclude)
	buffer.WriteByte(',')
	buffer.WriteString(`"include":`)
	writeJSONString(buffer, options.Include)
	buffer.WriteByte(',')
	buffer.WriteString(`"skipCertVerify":`)
	writeJSONBool(buffer, options.SkipCertVerify)
	buffer.WriteByte(',')
	buffer.WriteString(`"udp":`)
	writeJSONBool(buffer, options.UDP)
	buffer.WriteByte('}')
}

func marshalStage2Snapshot(buffer *bytes.Buffer, snapshot Stage2Snapshot) {
	buffer.WriteByte('{')
	buffer.WriteString(`"rows":[`)
	for i, row := range snapshot.Rows {
		if i > 0 {
			buffer.WriteByte(',')
		}
		marshalStage2Row(buffer, row)
	}
	buffer.WriteByte(']')
	buffer.WriteByte('}')
}

func marshalStage2Row(buffer *bytes.Buffer, row Stage2Row) {
	buffer.WriteByte('{')
	buffer.WriteString(`"landingNodeName":`)
	writeJSONString(buffer, row.LandingNodeName)
	buffer.WriteByte(',')
	buffer.WriteString(`"mode":`)
	writeJSONString(buffer, row.Mode)
	buffer.WriteByte(',')
	buffer.WriteString(`"targetName":`)
	if row.TargetName == nil {
		buffer.WriteString("null")
	} else {
		writeJSONString(buffer, *row.TargetName)
	}
	buffer.WriteByte('}')
}

func writeJSONString(buffer *bytes.Buffer, value string) {
	encoded, _ := json.Marshal(value)
	buffer.Write(encoded)
}

func writeJSONBool(buffer *bytes.Buffer, value bool) {
	if value {
		buffer.WriteString("true")
		return
	}
	buffer.WriteString("false")
}
