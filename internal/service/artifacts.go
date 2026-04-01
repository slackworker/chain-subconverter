package service

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"regexp"
	"strconv"
	"strings"
	"time"
)

const defaultLongURLMaxLength = 2048

var (
	inlineDialerProxyFieldPattern = regexp.MustCompile(`, dialer-proxy: [^,}]+`)
	inlineServerFieldPattern      = regexp.MustCompile(`server: [^,}]+`)
	inlinePortFieldPattern        = regexp.MustCompile(`port: [0-9]+`)
)

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
	Stage2Init      Stage2Init       `json:"stage2Init"`
	Messages        []Message        `json:"messages"`
	BlockingErrors  []BlockingError  `json:"blockingErrors"`
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
		Stage2Init:      stage2Init,
		Messages:        []Message{},
		BlockingErrors:  []BlockingError{},
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

	rendered := stripLandingNodesFromDefaultRegionGroups(fixtures.FullBaseYAML, landingNames)
	rendered, err = applySnapshotToInlineProxies(rendered, stage2Snapshot.Rows)
	if err != nil {
		return "", err
	}

	return rendered, nil
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

func stripLandingNodesFromDefaultRegionGroups(fullBaseYAML string, landingNames map[string]struct{}) string {
	lines := strings.Split(fullBaseYAML, "\n")
	preserveTrailingNewline := strings.HasSuffix(fullBaseYAML, "\n")
	currentGroupName := ""
	inProxyGroups := false
	filtered := make([]string, 0, len(lines))

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "proxy-groups:":
			inProxyGroups = true
			currentGroupName = ""
		case inProxyGroups && strings.HasPrefix(line, "  - name: "):
			currentGroupName = strings.TrimSpace(strings.TrimPrefix(line, "  - name: "))
		}

		if inProxyGroups && isDefaultRegionGroup(currentGroupName) && strings.HasPrefix(line, "      - ") {
			memberName := strings.TrimSpace(strings.TrimPrefix(line, "      - "))
			if _, exists := landingNames[memberName]; exists {
				continue
			}
		}

		filtered = append(filtered, line)
	}

	result := strings.Join(filtered, "\n")
	if preserveTrailingNewline {
		result += "\n"
	}
	return result
}

func applySnapshotToInlineProxies(fullBaseYAML string, rows []Stage2Row) (string, error) {
	rowsByLanding := make(map[string]Stage2Row, len(rows))
	for _, row := range rows {
		rowsByLanding[row.LandingNodeName] = row
	}

	lines := strings.Split(fullBaseYAML, "\n")
	preserveTrailingNewline := strings.HasSuffix(fullBaseYAML, "\n")
	inTopLevelProxies := false

	for i, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case trimmed == "proxies:":
			inTopLevelProxies = true
			continue
		case trimmed == "proxy-groups:":
			inTopLevelProxies = false
			continue
		}

		if !inTopLevelProxies || !strings.HasPrefix(trimmed, "- {") {
			continue
		}

		name, err := extractInlineField(trimmed, "name")
		if err != nil {
			return "", fmt.Errorf("parse inline proxy %q: %w", trimmed, err)
		}

		row, exists := rowsByLanding[name]
		if !exists {
			continue
		}

		updatedLine, err := applyRowToInlineProxyLine(line, row)
		if err != nil {
			return "", fmt.Errorf("apply stage2 row for landing node %q: %w", name, err)
		}
		lines[i] = updatedLine
	}

	result := strings.Join(lines, "\n")
	if preserveTrailingNewline {
		result += "\n"
	}
	return result, nil
}

func applyRowToInlineProxyLine(line string, row Stage2Row) (string, error) {
	switch row.Mode {
	case "none":
		return inlineDialerProxyFieldPattern.ReplaceAllString(line, ""), nil
	case "chain":
		targetName, err := requireTargetName(row)
		if err != nil {
			return "", err
		}
		line = inlineDialerProxyFieldPattern.ReplaceAllString(line, "")
		if !strings.HasSuffix(line, "}") {
			return "", fmt.Errorf("inline proxy line %q does not end with }", line)
		}
		return strings.TrimSuffix(line, "}") + ", dialer-proxy: " + targetName + "}", nil
	case "port_forward":
		targetName, err := requireTargetName(row)
		if err != nil {
			return "", err
		}
		server, port, err := splitForwardRelayTarget(targetName)
		if err != nil {
			return "", err
		}
		line = inlineDialerProxyFieldPattern.ReplaceAllString(line, "")
		if !inlineServerFieldPattern.MatchString(line) {
			return "", fmt.Errorf("inline proxy line %q is missing server field", line)
		}
		if !inlinePortFieldPattern.MatchString(line) {
			return "", fmt.Errorf("inline proxy line %q is missing port field", line)
		}
		line = inlineServerFieldPattern.ReplaceAllString(line, "server: "+server)
		line = inlinePortFieldPattern.ReplaceAllString(line, "port: "+port)
		return line, nil
	default:
		return "", fmt.Errorf("unsupported mode %q", row.Mode)
	}
}

func requireTargetName(row Stage2Row) (string, error) {
	if row.TargetName == nil || strings.TrimSpace(*row.TargetName) == "" {
		return "", fmt.Errorf("missing targetName for landing node %q", row.LandingNodeName)
	}
	return *row.TargetName, nil
}

func splitForwardRelayTarget(targetName string) (string, string, error) {
	separator := strings.LastIndex(targetName, ":")
	if separator <= 0 || separator == len(targetName)-1 {
		return "", "", fmt.Errorf("invalid forward relay target %q", targetName)
	}

	server := targetName[:separator]
	port := targetName[separator+1:]
	if _, err := strconv.Atoi(port); err != nil {
		return "", "", fmt.Errorf("invalid forward relay target %q", targetName)
	}

	return server, port, nil
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
