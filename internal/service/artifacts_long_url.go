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
	longURLSchemaVersion    = 5
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
	Servers                                        []longURLStage2Server `json:"servers"`
	ChainProxyTargetGroupSwitchOptimizationEnabled *bool                 `json:"chainProxyTargetGroupSwitchOptimizationEnabled,omitempty"`
}

type longURLStage2Server struct {
	ServerKey   string                 `json:"serverKey"`
	Aggregation longURLStage2Aggregation `json:"aggregation"`
	Sources     []longURLStage2Source  `json:"sources"`
}

type longURLStage2Aggregation struct {
	Enabled          bool     `json:"enabled"`
	GroupName        string   `json:"groupName,omitempty"`
	Strategy         string   `json:"strategy,omitempty"`
	MemberProxyNames []string `json:"memberProxyNames,omitempty"`
}

type longURLStage2Source struct {
	SourceID  string               `json:"sourceId"`
	Instances []longURLStage2Instance `json:"instances"`
}

type longURLStage2Instance struct {
	ProxyName  string  `json:"proxyName"`
	Mode       string  `json:"mode"`
	TargetName *string `json:"targetName"`
}

func EncodeLongURL(publicBaseURL string, payload LongURLPayload, maxLongURLLength int) (string, error) {
	if payload.V != longURLSchemaVersion {
		return "", fmt.Errorf("unsupported long URL payload version %d", payload.V)
	}

	payload.Stage2Snapshot = CanonicalizeStage2SnapshotForLinkEncoding(payload.Stage2Snapshot)

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
	payload.Stage2Snapshot = RestoreStage2SnapshotFromEncoding(payload.Stage2Snapshot)

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
	chainProxyTargetGroupSwitchOptimizationEnabled := false
	if schema.Stage2Snapshot.ChainProxyTargetGroupSwitchOptimizationEnabled != nil {
		chainProxyTargetGroupSwitchOptimizationEnabled = *schema.Stage2Snapshot.ChainProxyTargetGroupSwitchOptimizationEnabled
	}
	servers := make([]Stage2SnapshotServer, 0, len(schema.Stage2Snapshot.Servers))
	for _, server := range schema.Stage2Snapshot.Servers {
		sources := make([]Stage2SnapshotSource, 0, len(server.Sources))
		for _, source := range server.Sources {
			instances := make([]Stage2Instance, 0, len(source.Instances))
			for _, inst := range source.Instances {
				instances = append(instances, Stage2Instance{
					ProxyName:  inst.ProxyName,
					Mode:       inst.Mode,
					TargetName: inst.TargetName,
				})
			}
			sources = append(sources, Stage2SnapshotSource{
				SourceID:  source.SourceID,
				Instances: instances,
			})
		}
		agg := Stage2Aggregation{Enabled: server.Aggregation.Enabled}
		if server.Aggregation.Enabled {
			agg.GroupName = server.Aggregation.GroupName
			agg.Strategy = server.Aggregation.Strategy
			agg.MemberProxyNames = append([]string(nil), server.Aggregation.MemberProxyNames...)
		}
		servers = append(servers, Stage2SnapshotServer{
			ServerKey:   server.ServerKey,
			Aggregation: agg,
			Sources:     sources,
		})
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
			ChainProxyTargetGroupSwitchOptimizationEnabled: chainProxyTargetGroupSwitchOptimizationEnabled,
			Servers: servers,
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

	proxyNames := map[string]struct{}{}
	for _, server := range payload.Stage2Snapshot.Servers {
		serverKey := strings.TrimSpace(server.ServerKey)
		if serverKey == "" {
			return fmt.Errorf("serverKey must not be empty")
		}
		for _, source := range server.Sources {
			sourceID := strings.TrimSpace(source.SourceID)
			if sourceID == "" {
				return fmt.Errorf("sourceId must not be empty")
			}
			if len(source.Instances) == 0 {
				return fmt.Errorf("source %q must contain at least one instance", sourceID)
			}
			for _, inst := range source.Instances {
				proxyName := strings.TrimSpace(inst.ProxyName)
				if proxyName == "" {
					return fmt.Errorf("proxyName must not be empty")
				}
				if _, exists := proxyNames[proxyName]; exists {
					return fmt.Errorf("duplicate proxy name %q", proxyName)
				}
				proxyNames[proxyName] = struct{}{}

				targetName := ""
				if inst.TargetName != nil {
					targetName = strings.TrimSpace(*inst.TargetName)
				}
				switch inst.Mode {
				case "none":
					if targetName != "" {
						return fmt.Errorf("targetName must be empty for proxy %q when mode is none", proxyName)
					}
				case "chain", "port_forward":
					if targetName == "" {
						return fmt.Errorf("missing targetName for proxy %q", proxyName)
					}
				default:
					return fmt.Errorf("unsupported mode %q for proxy %q", inst.Mode, proxyName)
				}
			}
		}
		agg := server.Aggregation
		if !agg.Enabled {
			continue
		}
		switch strings.TrimSpace(agg.Strategy) {
		case "fallback", "url-test", "select", "load-balance":
		default:
			return fmt.Errorf("unsupported server aggregation strategy %q for server %q", agg.Strategy, serverKey)
		}
		memberNames := agg.MemberProxyNames
		if len(memberNames) < 2 {
			return fmt.Errorf("server aggregation for %q must include at least 2 members", serverKey)
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
	canonical := CanonicalizeStage2SnapshotForLinkEncoding(payload.Stage2Snapshot)
	servers := make([]longURLStage2Server, 0, len(canonical.Servers))
	for _, server := range canonical.Servers {
		sources := make([]longURLStage2Source, 0, len(server.Sources))
		for _, source := range server.Sources {
			instances := make([]longURLStage2Instance, 0, len(source.Instances))
			for _, inst := range source.Instances {
				instances = append(instances, longURLStage2Instance{
					ProxyName:  inst.ProxyName,
					Mode:       inst.Mode,
					TargetName: inst.TargetName,
				})
			}
			sources = append(sources, longURLStage2Source{
				SourceID:  source.SourceID,
				Instances: instances,
			})
		}
		agg := longURLStage2Aggregation{Enabled: server.Aggregation.Enabled}
		if server.Aggregation.Enabled {
			agg.GroupName = server.Aggregation.GroupName
			agg.Strategy = server.Aggregation.Strategy
			agg.MemberProxyNames = append([]string(nil), server.Aggregation.MemberProxyNames...)
		}
		servers = append(servers, longURLStage2Server{
			ServerKey:   server.ServerKey,
			Aggregation: agg,
			Sources:     sources,
		})
	}

	var chainProxyTargetGroupSwitchOptimizationEnabled *bool
	if canonical.ChainProxyTargetGroupSwitchOptimizationEnabled {
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
			Servers: servers,
			ChainProxyTargetGroupSwitchOptimizationEnabled: chainProxyTargetGroupSwitchOptimizationEnabled,
		},
		V: payload.V,
	}
}
