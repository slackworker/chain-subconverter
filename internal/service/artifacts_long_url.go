package service

import (
	"bytes"
	"compress/gzip"
	"encoding/base64"
	"encoding/json"
	"fmt"
	"io"
	"net/url"
	"strings"
	"time"
)

const (
	defaultLongURLMaxLength = 8192
	longURLSchemaVersion    = 4
	longURLPath             = "/sub"
	NoLongURLLengthLimit    = -1
)

const (
	longURLParamData           = "data"
	longURLParamDownload       = "download"
	longURLParamEmoji          = "emoji"
	longURLParamUDP            = "udp"
	longURLParamSkipCertVerify = "scv"
	longURLParamConfig         = "config"
	longURLParamInclude        = "include"
	longURLParamExclude        = "exclude"
	longURLParamTarget         = "target"
	longURLParamURL            = "url"
	longURLParamList           = "list"
	longURLParamExpand         = "expand"
	longURLParamClassic        = "classic"
	longURLParamVersion        = "v"
	longURLParamLanding        = "landing"
	longURLParamTransit        = "transit"
	longURLParamRelay          = "relay"
	longURLParamPortForward    = "port_forward"
	longURLParamChain          = "chain"
)

type longURLPayloadSchema struct {
	Stage1Input    longURLStage1Input    `json:"stage1Input"`
	Stage2Snapshot longURLStage2Snapshot `json:"stage2Snapshot"`
	V              int                   `json:"v"`
}

type longURLStage1Input struct {
	AdvancedOptions   longURLAdvancedOptions `json:"advancedOptions"`
	ForwardRelayItems []string               `json:"forwardRelayItems"`
	LandingRawText    string                 `json:"landingRawText"`
	TransitRawText    string                 `json:"transitRawText"`
}

type longURLAdvancedOptions struct {
	Config         *string  `json:"config"`
	Emoji          *bool    `json:"emoji"`
	Exclude        []string `json:"exclude"`
	Include        []string `json:"include"`
	SkipCertVerify *bool    `json:"skipCertVerify"`
	UDP            *bool    `json:"udp"`
}

type longURLStage2Snapshot struct {
	Rows                                           []longURLStage2Row              `json:"rows"`
	ChainProxyTargetGroupSwitchOptimizationEnabled *bool                           `json:"chainProxyTargetGroupSwitchOptimizationEnabled,omitempty"`
	ServerAggregationGroups                        []longURLServerAggregationGroup `json:"serverAggregationGroups,omitempty"`
}

type longURLStage2Row struct {
	RowID                 string  `json:"rowId"`
	SourceLandingNodeName string  `json:"sourceLandingNodeName"`
	ProxyName             string  `json:"proxyName"`
	Mode                  string  `json:"mode"`
	TargetName            *string `json:"targetName"`
}

type longURLServerAggregationGroup struct {
	Server       string   `json:"server"`
	GroupName    string   `json:"groupName,omitempty"`
	Enabled      bool     `json:"enabled"`
	Strategy     string   `json:"strategy"`
	MemberRowIDs []string `json:"memberRowIds,omitempty"`
}

func EncodeLongURL(publicBaseURL string, payload LongURLPayload, maxLongURLLength int) (string, error) {
	if payload.V != longURLSchemaVersion {
		return "", fmt.Errorf("unsupported long URL payload version %d", payload.V)
	}

	payloadJSON, err := marshalCanonicalLongURLPayload(payload)
	if err != nil {
		return "", fmt.Errorf("marshal long URL payload: %w", err)
	}

	encodedData, err := encodeCompressedData(payloadJSON)
	if err != nil {
		return "", fmt.Errorf("encode long URL payload: %w", err)
	}

	longURL, err := joinSubURL(publicBaseURL, encodedData)
	if err != nil {
		return "", err
	}

	maxLength := maxLongURLLength
	if maxLength == NoLongURLLengthLimit {
		return longURL, nil
	}
	if maxLength <= 0 {
		maxLength = defaultLongURLMaxLength
	}
	if len(longURL) > maxLength {
		cause := fmt.Errorf("long URL exceeds %d bytes", maxLength)
		return "", newGlobalValidationError("LONG_URL_TOO_LONG", "long URL exceeds maximum length", cause)
	}

	return longURL, nil
}

func DecodeLongURLPayload(longURL string, limits InputLimits) (LongURLPayload, error) {
	parsedURL, err := url.Parse(longURL)
	if err != nil {
		return LongURLPayload{}, fmt.Errorf("parse long URL: %w", err)
	}
	if err := validateLongURLDecodeQuery(parsedURL.Query()); err != nil {
		return LongURLPayload{}, fmt.Errorf("validate long URL query: %w", err)
	}

	data, err := parseRequiredStringQueryValue(parsedURL.Query(), longURLParamData)
	if err != nil {
		return LongURLPayload{}, fmt.Errorf("parse long URL data: %w", err)
	}

	payloadJSON, err := decodeCompressedData(data)
	if err != nil {
		return LongURLPayload{}, fmt.Errorf("decode long URL payload: %w", err)
	}

	var payload LongURLPayload
	if err := unmarshalLongURLPayload(payloadJSON, &payload); err != nil {
		return LongURLPayload{}, fmt.Errorf("unmarshal long URL payload: %w", err)
	}

	if err := validateLongURLPayloadSchema(payload); err != nil {
		return LongURLPayload{}, fmt.Errorf("validate long URL payload schema: %w", err)
	}

	// Canonicalize decoded payload to the current in-memory schema version.
	payload.V = longURLSchemaVersion
	payload.Stage2Snapshot = NormalizeStage2Snapshot(payload.Stage2Snapshot)

	if err := ValidateStage1InputLimits(payload.Stage1Input, limits); err != nil {
		return LongURLPayload{}, fmt.Errorf("validate stage1 input limits: %w", err)
	}

	return payload, nil
}

func encodeCompressedData(payload []byte) (string, error) {
	var compressed bytes.Buffer
	gzipWriter, err := gzip.NewWriterLevel(&compressed, gzip.BestCompression)
	if err != nil {
		return "", fmt.Errorf("create gzip writer: %w", err)
	}
	gzipWriter.Header.ModTime = time.Unix(0, 0)
	if _, err := gzipWriter.Write(payload); err != nil {
		return "", fmt.Errorf("gzip payload: %w", err)
	}
	if err := gzipWriter.Close(); err != nil {
		return "", fmt.Errorf("close gzip writer: %w", err)
	}
	return base64.RawURLEncoding.EncodeToString(compressed.Bytes()), nil
}

func decodeCompressedData(encoded string) ([]byte, error) {
	compressed, err := base64.RawURLEncoding.DecodeString(encoded)
	if err != nil {
		return nil, fmt.Errorf("decode base64url payload: %w", err)
	}

	gzipReader, err := gzip.NewReader(bytes.NewReader(compressed))
	if err != nil {
		return nil, fmt.Errorf("open gzip payload: %w", err)
	}
	defer gzipReader.Close()

	decoded, err := io.ReadAll(gzipReader)
	if err != nil {
		return nil, fmt.Errorf("read gzip payload: %w", err)
	}
	return decoded, nil
}

func unmarshalLongURLPayload(payloadJSON []byte, payload *LongURLPayload) error {
	decoder := json.NewDecoder(bytes.NewReader(payloadJSON))
	decoder.DisallowUnknownFields()

	var schema longURLPayloadSchema
	if err := decoder.Decode(&schema); err != nil {
		return err
	}
	var extra json.RawMessage
	if err := decoder.Decode(&extra); err != io.EOF {
		return fmt.Errorf("unexpected extra data")
	}

	*payload = schema.payload()
	return nil
}

func (schema longURLPayloadSchema) payload() LongURLPayload {
	rows := make([]Stage2Row, len(schema.Stage2Snapshot.Rows))
	chainProxyTargetGroupSwitchOptimizationEnabled := false
	if schema.Stage2Snapshot.ChainProxyTargetGroupSwitchOptimizationEnabled != nil {
		chainProxyTargetGroupSwitchOptimizationEnabled = *schema.Stage2Snapshot.ChainProxyTargetGroupSwitchOptimizationEnabled
	}
	for index, row := range schema.Stage2Snapshot.Rows {
		rows[index] = Stage2Row{
			RowID:                 row.RowID,
			SourceLandingNodeName: row.SourceLandingNodeName,
			ProxyName:             row.ProxyName,
			LandingNodeName:       row.ProxyName,
			Mode:                  row.Mode,
			TargetName:            row.TargetName,
		}
	}
	var serverAggregationGroups []ServerAggregationGroup
	if len(schema.Stage2Snapshot.ServerAggregationGroups) > 0 {
		serverAggregationGroups = make([]ServerAggregationGroup, len(schema.Stage2Snapshot.ServerAggregationGroups))
		for index, group := range schema.Stage2Snapshot.ServerAggregationGroups {
			serverAggregationGroups[index] = ServerAggregationGroup{
				Server:       group.Server,
				GroupName:    group.GroupName,
				Enabled:      group.Enabled,
				Strategy:     group.Strategy,
				MemberRowIDs: append([]string(nil), group.MemberRowIDs...),
			}
		}
	}

	return LongURLPayload{
		V: schema.V,
		Stage1Input: Stage1Input{
			LandingRawText:    schema.Stage1Input.LandingRawText,
			TransitRawText:    schema.Stage1Input.TransitRawText,
			ForwardRelayItems: schema.Stage1Input.ForwardRelayItems,
			AdvancedOptions: AdvancedOptions{
				Emoji:          schema.Stage1Input.AdvancedOptions.Emoji,
				UDP:            schema.Stage1Input.AdvancedOptions.UDP,
				SkipCertVerify: schema.Stage1Input.AdvancedOptions.SkipCertVerify,
				Config:         schema.Stage1Input.AdvancedOptions.Config,
				Include:        schema.Stage1Input.AdvancedOptions.Include,
				Exclude:        schema.Stage1Input.AdvancedOptions.Exclude,
			},
		},
		Stage2Snapshot: Stage2Snapshot{
			Rows: rows,
			ChainProxyTargetGroupSwitchOptimizationEnabled: chainProxyTargetGroupSwitchOptimizationEnabled,
			ServerAggregationGroups:                        serverAggregationGroups,
		},
	}
}

func validateLongURLPayloadSchema(payload LongURLPayload) error {
	if payload.V != longURLSchemaVersion {
		return fmt.Errorf("unsupported long URL payload version %d", payload.V)
	}

	if payload.Stage1Input.AdvancedOptions.Config == nil {
		return fmt.Errorf("advancedOptions.config must not be empty")
	}
	configURL := strings.TrimSpace(*payload.Stage1Input.AdvancedOptions.Config)
	if configURL == "" {
		return fmt.Errorf("advancedOptions.config must not be empty")
	}
	parsedConfigURL, err := url.Parse(configURL)
	if err != nil {
		return fmt.Errorf("advancedOptions.config must be a valid HTTP(S) URL: %w", err)
	}
	if parsedConfigURL.Scheme != "http" && parsedConfigURL.Scheme != "https" {
		return fmt.Errorf("advancedOptions.config must use HTTP(S)")
	}
	if parsedConfigURL.Host == "" {
		return fmt.Errorf("advancedOptions.config must include host")
	}

	rowsByID := make(map[string]Stage2Row, len(payload.Stage2Snapshot.Rows))
	rowsByProxyName := make(map[string]struct{}, len(payload.Stage2Snapshot.Rows))
	for _, row := range payload.Stage2Snapshot.Rows {
		rowID := strings.TrimSpace(row.rowIDOrFallback())
		if rowID == "" {
			return fmt.Errorf("rowId must not be empty")
		}
		if _, exists := rowsByID[rowID]; exists {
			return fmt.Errorf("duplicate rowId %q", rowID)
		}
		rowsByID[rowID] = row
		sourceLandingNodeName := strings.TrimSpace(row.sourceLandingNodeNameOrFallback())
		if sourceLandingNodeName == "" {
			return fmt.Errorf("sourceLandingNodeName must not be empty")
		}
		proxyName := strings.TrimSpace(row.proxyNameOrFallback())
		if proxyName == "" {
			return fmt.Errorf("proxyName must not be empty")
		}
		if _, exists := rowsByProxyName[proxyName]; exists {
			return fmt.Errorf("duplicate proxy name %q", proxyName)
		}
		rowsByProxyName[proxyName] = struct{}{}

		targetName := ""
		if row.TargetName != nil {
			targetName = strings.TrimSpace(*row.TargetName)
		}

		switch row.Mode {
		case "none":
			if targetName != "" {
				return fmt.Errorf("targetName must be empty for proxy %q when mode is none", proxyName)
			}
		case "chain":
			if targetName == "" {
				return fmt.Errorf("missing targetName for proxy %q", proxyName)
			}
		case "port_forward":
			if targetName == "" {
				return fmt.Errorf("missing targetName for proxy %q", proxyName)
			}
		default:
			return fmt.Errorf("unsupported mode %q for proxy %q", row.Mode, proxyName)
		}
	}

	seenServerGroups := make(map[string]struct{}, len(payload.Stage2Snapshot.ServerAggregationGroups))
	for _, group := range payload.Stage2Snapshot.ServerAggregationGroups {
		server := strings.TrimSpace(group.Server)
		if server == "" {
			return fmt.Errorf("serverAggregationGroups.server must not be empty")
		}
		if _, exists := seenServerGroups[server]; exists {
			return fmt.Errorf("duplicate server aggregation group for server %q", server)
		}
		seenServerGroups[server] = struct{}{}

		if !group.Enabled {
			continue
		}
		switch strings.TrimSpace(group.Strategy) {
		case "fallback", "url-test", "select", "load-balance":
		default:
			return fmt.Errorf("unsupported server aggregation strategy %q for server %q", group.Strategy, server)
		}
		memberSeen := make(map[string]struct{}, len(group.MemberRowIDs))
		for _, memberRowID := range group.MemberRowIDs {
			rowID := strings.TrimSpace(memberRowID)
			if rowID == "" {
				return fmt.Errorf("server aggregation group for server %q contains empty memberRowId", server)
			}
			memberSeen[rowID] = struct{}{}
			if _, exists := rowsByID[rowID]; !exists {
				return fmt.Errorf("server aggregation group for server %q references unknown rowId %q", server, rowID)
			}
		}
		if len(memberSeen) < 2 {
			return fmt.Errorf("server aggregation group for server %q must include at least 2 memberRowIds", server)
		}
	}

	return nil
}

func joinSubURL(publicBaseURL string, encodedData string) (string, error) {
	parsedURL, err := url.Parse(publicBaseURL)
	if err != nil {
		return "", fmt.Errorf("parse public base URL: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return "", fmt.Errorf("public base URL must include scheme and host")
	}

	trimmedPath := strings.TrimSuffix(parsedURL.Path, "/")
	parsedURL.Path = trimmedPath + longURLPath
	parsedURL.RawQuery = url.Values{longURLParamData: []string{encodedData}}.Encode()
	parsedURL.Fragment = ""
	return parsedURL.String(), nil
}

func validateLongURLDecodeQuery(query url.Values) error {
	for rawName, values := range query {
		name := strings.TrimSpace(rawName)
		switch name {
		case longURLParamData:
			if len(values) > 1 {
				return fmt.Errorf("duplicate %s query parameter", longURLParamData)
			}
		case longURLParamDownload:
			if len(values) > 1 {
				return fmt.Errorf("duplicate %s query parameter", longURLParamDownload)
			}
			if len(values) == 1 {
				value := strings.TrimSpace(values[0])
				if value != "1" {
					return fmt.Errorf("invalid %s query parameter %q", longURLParamDownload, value)
				}
			}
		case "":
			return fmt.Errorf("empty query parameter name is not allowed")
		default:
			return fmt.Errorf("unsupported query parameter %q", name)
		}
	}
	return nil
}

func parseRequiredStringQueryValue(query url.Values, name string) (string, error) {
	values := query[name]
	if len(values) == 0 {
		return "", fmt.Errorf("missing %s query parameter", name)
	}
	if len(values) > 1 {
		return "", fmt.Errorf("duplicate %s query parameter", name)
	}
	trimmed := strings.TrimSpace(values[0])
	if trimmed == "" {
		return "", fmt.Errorf("missing %s query parameter", name)
	}
	return trimmed, nil
}

func marshalCanonicalLongURLPayload(payload LongURLPayload) ([]byte, error) {
	return json.Marshal(newLongURLPayloadSchema(payload))
}

func encodeLongURLStateKey(payload LongURLPayload) (string, error) {
	payloadJSON, err := marshalCanonicalLongURLPayload(payload)
	if err != nil {
		return "", fmt.Errorf("marshal long URL payload: %w", err)
	}
	encodedData, err := encodeCompressedData(payloadJSON)
	if err != nil {
		return "", fmt.Errorf("encode long URL payload: %w", err)
	}
	return encodedData, nil
}

func newLongURLPayloadSchema(payload LongURLPayload) longURLPayloadSchema {
	rows := make([]longURLStage2Row, len(payload.Stage2Snapshot.Rows))
	for index, row := range payload.Stage2Snapshot.Rows {
		rows[index] = longURLStage2Row{
			RowID:                 row.rowIDOrFallback(),
			SourceLandingNodeName: row.sourceLandingNodeNameOrFallback(),
			ProxyName:             row.proxyNameOrFallback(),
			Mode:                  row.Mode,
			TargetName:            row.TargetName,
		}
	}
	serverAggregationGroups := make([]longURLServerAggregationGroup, len(payload.Stage2Snapshot.ServerAggregationGroups))
	for index, group := range payload.Stage2Snapshot.ServerAggregationGroups {
		serverAggregationGroups[index] = longURLServerAggregationGroup{
			Server:       group.Server,
			GroupName:    group.GroupName,
			Enabled:      group.Enabled,
			Strategy:     group.Strategy,
			MemberRowIDs: append([]string(nil), group.MemberRowIDs...),
		}
	}

	var chainProxyTargetGroupSwitchOptimizationEnabled *bool
	if payload.Stage2Snapshot.ChainProxyTargetGroupSwitchOptimizationEnabled {
		enabled := true
		chainProxyTargetGroupSwitchOptimizationEnabled = &enabled
	}
	return longURLPayloadSchema{
		Stage1Input: longURLStage1Input{
			AdvancedOptions: longURLAdvancedOptions{
				Config:         payload.Stage1Input.AdvancedOptions.Config,
				Emoji:          payload.Stage1Input.AdvancedOptions.Emoji,
				Exclude:        payload.Stage1Input.AdvancedOptions.Exclude,
				Include:        payload.Stage1Input.AdvancedOptions.Include,
				SkipCertVerify: payload.Stage1Input.AdvancedOptions.SkipCertVerify,
				UDP:            payload.Stage1Input.AdvancedOptions.UDP,
			},
			ForwardRelayItems: payload.Stage1Input.ForwardRelayItems,
			LandingRawText:    payload.Stage1Input.LandingRawText,
			TransitRawText:    payload.Stage1Input.TransitRawText,
		},
		Stage2Snapshot: longURLStage2Snapshot{
			Rows: rows,
			ChainProxyTargetGroupSwitchOptimizationEnabled: chainProxyTargetGroupSwitchOptimizationEnabled,
			ServerAggregationGroups:                        serverAggregationGroups,
		},
		V: payload.V,
	}
}
