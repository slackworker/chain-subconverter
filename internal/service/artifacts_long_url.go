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
	if err := json.Unmarshal(payloadJSON, &payload); err != nil {
		return LongURLPayload{}, fmt.Errorf("unmarshal long URL payload: %w", err)
	}
	if payload.V != 1 {
		return LongURLPayload{}, fmt.Errorf("unsupported long URL payload version %d", payload.V)
	}
	payload.Stage1Input = NormalizeStage1Input(payload.Stage1Input)
	if err := ValidateStage1InputLimits(payload.Stage1Input, limits); err != nil {
		return LongURLPayload{}, fmt.Errorf("validate stage1 input limits: %w", err)
	}

	return payload, nil
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
