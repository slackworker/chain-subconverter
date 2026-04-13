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
)

const defaultLongURLMaxLength = 2048

type longURLPayloadSchema struct {
	V              int                   `json:"v"`
	Stage1Input    longURLStage1Input    `json:"stage1Input"`
	Stage2Snapshot longURLStage2Snapshot `json:"stage2Snapshot"`
}

type longURLStage1Input struct {
	LandingRawText      string                 `json:"landingRawText"`
	TransitRawText      string                 `json:"transitRawText"`
	ForwardRelayRawText string                 `json:"forwardRelayRawText"`
	AdvancedOptions     longURLAdvancedOptions `json:"advancedOptions"`
}

type longURLAdvancedOptions struct {
	Emoji             *bool   `json:"emoji"`
	UDP               *bool   `json:"udp"`
	SkipCertVerify    *bool   `json:"skipCertVerify"`
	Config            *string `json:"config"`
	Include           *string `json:"include"`
	Exclude           *string `json:"exclude"`
	EnablePortForward bool    `json:"enablePortForward"`
}

type longURLStage2Snapshot struct {
	Rows []longURLStage2Row `json:"rows"`
}

type longURLStage2Row struct {
	LandingNodeName string  `json:"landingNodeName"`
	Mode            string  `json:"mode"`
	TargetName      *string `json:"targetName"`
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
	if err := unmarshalLongURLPayload(payloadJSON, &payload); err != nil {
		return LongURLPayload{}, fmt.Errorf("unmarshal long URL payload: %w", err)
	}
	if payload.V != 1 {
		return LongURLPayload{}, fmt.Errorf("unsupported long URL payload version %d", payload.V)
	}
	payload.Stage1Input = NormalizeStage1Input(payload.Stage1Input)
	if err := validateLongURLPayloadSchema(payload); err != nil {
		return LongURLPayload{}, fmt.Errorf("validate long URL payload schema: %w", err)
	}
	if err := ValidateStage1InputLimits(payload.Stage1Input, limits); err != nil {
		return LongURLPayload{}, fmt.Errorf("validate stage1 input limits: %w", err)
	}

	return payload, nil
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

	rows := make([]Stage2Row, len(schema.Stage2Snapshot.Rows))
	for index, row := range schema.Stage2Snapshot.Rows {
		rows[index] = Stage2Row{
			LandingNodeName: row.LandingNodeName,
			Mode:            row.Mode,
			TargetName:      row.TargetName,
		}
	}

	*payload = LongURLPayload{
		V: schema.V,
		Stage1Input: Stage1Input{
			LandingRawText:      schema.Stage1Input.LandingRawText,
			TransitRawText:      schema.Stage1Input.TransitRawText,
			ForwardRelayRawText: schema.Stage1Input.ForwardRelayRawText,
			AdvancedOptions: AdvancedOptions{
				Emoji:             schema.Stage1Input.AdvancedOptions.Emoji,
				UDP:               schema.Stage1Input.AdvancedOptions.UDP,
				SkipCertVerify:    schema.Stage1Input.AdvancedOptions.SkipCertVerify,
				Config:            schema.Stage1Input.AdvancedOptions.Config,
				Include:           schema.Stage1Input.AdvancedOptions.Include,
				Exclude:           schema.Stage1Input.AdvancedOptions.Exclude,
				EnablePortForward: schema.Stage1Input.AdvancedOptions.EnablePortForward,
			},
		},
		Stage2Snapshot: Stage2Snapshot{Rows: rows},
	}

	return nil
}

func validateLongURLPayloadSchema(payload LongURLPayload) error {
	rowsByLanding := make(map[string]struct{}, len(payload.Stage2Snapshot.Rows))
	for _, row := range payload.Stage2Snapshot.Rows {
		landingNodeName := strings.TrimSpace(row.LandingNodeName)
		if landingNodeName == "" {
			return fmt.Errorf("landingNodeName must not be empty")
		}
		if _, exists := rowsByLanding[landingNodeName]; exists {
			return fmt.Errorf("duplicate stage2 row for landing node %q", row.LandingNodeName)
		}
		rowsByLanding[landingNodeName] = struct{}{}

		targetName := ""
		if row.TargetName != nil {
			targetName = strings.TrimSpace(*row.TargetName)
		}

		switch row.Mode {
		case "none":
			if targetName != "" {
				return fmt.Errorf("targetName must be empty for landing node %q when mode is none", row.LandingNodeName)
			}
		case "chain", "port_forward":
			if targetName == "" {
				return fmt.Errorf("missing targetName for landing node %q", row.LandingNodeName)
			}
		default:
			return fmt.Errorf("unsupported mode %q for landing node %q", row.Mode, row.LandingNodeName)
		}
	}

	return nil
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
	writeJSONOptionalString(buffer, options.Config)
	buffer.WriteByte(',')
	buffer.WriteString(`"emoji":`)
	writeJSONOptionalBool(buffer, options.Emoji)
	buffer.WriteByte(',')
	buffer.WriteString(`"enablePortForward":`)
	writeJSONBool(buffer, options.EnablePortForward)
	buffer.WriteByte(',')
	buffer.WriteString(`"exclude":`)
	writeJSONOptionalString(buffer, options.Exclude)
	buffer.WriteByte(',')
	buffer.WriteString(`"include":`)
	writeJSONOptionalString(buffer, options.Include)
	buffer.WriteByte(',')
	buffer.WriteString(`"skipCertVerify":`)
	writeJSONOptionalBool(buffer, options.SkipCertVerify)
	buffer.WriteByte(',')
	buffer.WriteString(`"udp":`)
	writeJSONOptionalBool(buffer, options.UDP)
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

func writeJSONOptionalString(buffer *bytes.Buffer, value *string) {
	if value == nil {
		buffer.WriteString("null")
		return
	}
	writeJSONString(buffer, *value)
}

func writeJSONBool(buffer *bytes.Buffer, value bool) {
	if value {
		buffer.WriteString("true")
		return
	}
	buffer.WriteString("false")
}

func writeJSONOptionalBool(buffer *bytes.Buffer, value *bool) {
	if value == nil {
		buffer.WriteString("null")
		return
	}
	writeJSONBool(buffer, *value)
}
