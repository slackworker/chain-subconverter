package service

import (
	"context"
	"errors"
	"net/http"
	"reflect"
	"strings"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

func TestResolveURLFromSource_Replayable(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var request GenerateRequest
	readJSONFixture(t, fixtureDir+"/stage2/output/generate.request.json", &request)

	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}

	// First generate a long URL to resolve.
	generateResponse, err := BuildGenerateResponseFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		request,
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("BuildGenerateResponseFromSource() error = %v", err)
	}

	// Resolve the long URL - should be replayable.
	response, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		nil,
		generateResponse.LongURL,
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("ResolveURLFromSource() error = %v", err)
	}

	if response.RestoreStatus != "replayable" {
		t.Fatalf("restoreStatus mismatch: got %q want %q", response.RestoreStatus, "replayable")
	}
	if response.LongURL != generateResponse.LongURL {
		t.Fatalf("longUrl mismatch: got %q want %q", response.LongURL, generateResponse.LongURL)
	}
	if len(response.Stage2Snapshot.Rows) != 1 {
		t.Fatalf("len(response.Stage2Snapshot.Rows) = %d, want 1", len(response.Stage2Snapshot.Rows))
	}
	row := response.Stage2Snapshot.Rows[0]
	if row.RowID != "🇺🇸 SS2022-Test-256-US" || row.SourceLandingNodeName != "🇺🇸 SS2022-Test-256-US" || row.ProxyName != "🇺🇸 SS2022-Test-256-US" {
		t.Fatalf("derived row identity mismatch: got %+v", row)
	}
	if !reflect.DeepEqual(response.Messages, []Message{{
		Level:   "info",
		Code:    "RESTORE_METADATA_READY",
		Message: "已读取恢复快照。",
	}}) {
		t.Fatalf("expected replayable restore summary, got %v", response.Messages)
	}
	if len(response.BlockingErrors) != 0 {
		t.Fatalf("expected 0 blocking errors, got %d", len(response.BlockingErrors))
	}
}

func TestResolveURLFromSource_Conflicted(t *testing.T) {
	// Build a long URL with one landing name, then resolve with a different source
	// where the landing node was renamed — snapshot references should fail validation.
	stage1Input := Stage1Input{
		LandingRawText: "ss://landing",
		TransitRawText: "ss://transit",
		AdvancedOptions: AdvancedOptions{
			Config: stringPtr("https://templates.example.com/default.ini"),
		},
	}
	targetName := "🇭🇰 香港节点"
	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{{
			RowID:                 "hk-1",
			SourceLandingNodeName: "HK 01",
			ProxyName:             "HK 01",
			Mode:                  "chain",
			TargetName:            &targetName,
		}},
	}

	longURL, err := EncodeLongURL("http://localhost:11200", BuildLongURLPayload(stage1Input, snapshot), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	// Now resolve with a source where landing node was renamed.
	source2 := &fakeConversionSource{
		result: singleLandingThreePassResult("HK Renamed", "ss"),
	}

	response, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source2,
		nil,
		longURL,
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("ResolveURLFromSource() error = %v", err)
	}

	if response.RestoreStatus != "conflicted" {
		t.Fatalf("restoreStatus mismatch: got %q want %q", response.RestoreStatus, "conflicted")
	}
	if len(response.RestoreConflicts) != 1 {
		t.Fatalf("expected 1 restore conflict, got %d: %v", len(response.RestoreConflicts), response.RestoreConflicts)
	}
	if response.RestoreConflicts[0].ReasonCode != "STAGE2_ROWSET_MISMATCH" {
		t.Fatalf("restore conflict reasonCode mismatch: got %q want %q", response.RestoreConflicts[0].ReasonCode, "STAGE2_ROWSET_MISMATCH")
	}
	if len(response.Messages) != 1 {
		t.Fatalf("expected 1 message, got %d: %v", len(response.Messages), response.Messages)
	}
	if response.Messages[0].Code != "RESTORE_CONFLICT" {
		t.Fatalf("message code mismatch: got %q want %q", response.Messages[0].Code, "RESTORE_CONFLICT")
	}
	if strings.Contains(strings.ToLower(response.Messages[0].Message), "restore conflict") {
		t.Fatalf("restore conflict message should be business-facing, got %q", response.Messages[0].Message)
	}
	// Original snapshot should still be returned.
	if len(response.Stage2Snapshot.Rows) != 1 || response.Stage2Snapshot.Rows[0].ProxyName != "HK 01" {
		t.Fatalf("snapshot should preserve original data, got %+v", response.Stage2Snapshot)
	}
}

func TestResolveURLFromSource_InvalidURL(t *testing.T) {
	source := &fakeConversionSource{}

	_, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		nil,
		"https://example.com/some-other-page",
		0,
		InputLimits{},
	)
	if err == nil {
		t.Fatal("expected error for unsupported URL format")
	}

	respErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected ResponseError, got %T: %v", err, err)
	}
	if respErr.BlockingError().Code != "INVALID_URL" {
		t.Fatalf("error code mismatch: got %q want %q", respErr.BlockingError().Code, "INVALID_URL")
	}
	if respErr.BlockingError().Scope != "stage3_field" {
		t.Fatalf("scope mismatch: got %q want %q", respErr.BlockingError().Scope, "stage3_field")
	}
}

func TestResolveURLFromSource_EmptyURL(t *testing.T) {
	source := &fakeConversionSource{}

	_, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		nil,
		"  ",
		0,
		InputLimits{},
	)
	if err == nil {
		t.Fatal("expected error for empty URL")
	}

	respErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected ResponseError, got %T: %v", err, err)
	}
	if respErr.BlockingError().Code != "INVALID_REQUEST" {
		t.Fatalf("error code mismatch: got %q want %q", respErr.BlockingError().Code, "INVALID_REQUEST")
	}
	if respErr.BlockingError().Scope != "stage3_field" {
		t.Fatalf("scope mismatch: got %q want %q", respErr.BlockingError().Scope, "stage3_field")
	}
}

func TestResolveURLFromSource_InvalidLongURL(t *testing.T) {
	source := &fakeConversionSource{}

	_, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		nil,
		"http://localhost:11200/sub?data=invalid-payload",
		0,
		InputLimits{},
	)
	if err == nil {
		t.Fatal("expected error for invalid long URL payload")
	}

	respErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected ResponseError, got %T: %v", err, err)
	}
	if respErr.BlockingError().Code != "INVALID_LONG_URL" {
		t.Fatalf("error code mismatch: got %q want %q", respErr.BlockingError().Code, "INVALID_LONG_URL")
	}
	if respErr.BlockingError().Scope != "stage3_field" {
		t.Fatalf("scope mismatch: got %q want %q", respErr.BlockingError().Scope, "stage3_field")
	}
}

func TestResolveURLFromSource_RejectsSchemaInvalidLongURLPayload(t *testing.T) {
	invalidLongURL, err := EncodeLongURL(
		"http://localhost:11200",
		BuildLongURLPayload(
			stage1InputWithTemplate(Stage1Input{}),
			Stage2Snapshot{
				Rows: []Stage2Row{{
					Mode:            "unsupported",
				}},
			},
		),
		0,
	)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	_, err = ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		&fakeConversionSource{},
		nil,
		invalidLongURL,
		0,
		InputLimits{},
	)
	if err == nil {
		t.Fatal("expected error for schema-invalid long URL payload")
	}

	respErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected ResponseError, got %T: %v", err, err)
	}
	if respErr.StatusCode() != http.StatusUnprocessableEntity {
		t.Fatalf("status code mismatch: got %d want %d", respErr.StatusCode(), http.StatusUnprocessableEntity)
	}
	if respErr.BlockingError().Code != "INVALID_LONG_URL" {
		t.Fatalf("error code mismatch: got %q want %q", respErr.BlockingError().Code, "INVALID_LONG_URL")
	}
	if respErr.BlockingError().Scope != "stage3_field" {
		t.Fatalf("scope mismatch: got %q want %q", respErr.BlockingError().Scope, "stage3_field")
	}
}

func TestResolveURLFromSource_ResolvesShortURL(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var request GenerateRequest
	readJSONFixture(t, fixtureDir+"/stage2/output/generate.request.json", &request)

	storedLongURL, err := EncodeLongURL("https://legacy.example.com/base", BuildLongURLPayload(request.Stage1Input, request.Stage2Snapshot), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	resolver := &fakeShortLinkResolver{
		longURLByID: map[string]string{"7NpK2mQx9a": storedLongURL},
	}
	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}

	response, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		resolver,
		"https://example.com/sub/7NpK2mQx9a",
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("ResolveURLFromSource() error = %v", err)
	}

	wantLongURL, err := EncodeLongURL("http://localhost:11200", BuildLongURLPayload(request.Stage1Input, request.Stage2Snapshot), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	if response.LongURL != wantLongURL {
		t.Fatalf("longUrl mismatch: got %q want %q", response.LongURL, wantLongURL)
	}
	if response.ShortURL != "http://localhost:11200/sub/7NpK2mQx9a" {
		t.Fatalf("shortUrl mismatch: got %q want %q", response.ShortURL, "http://localhost:11200/sub/7NpK2mQx9a")
	}
	if response.RestoreStatus != "replayable" {
		t.Fatalf("restoreStatus mismatch: got %q want %q", response.RestoreStatus, "replayable")
	}
	if resolver.lastResolvedID != "7NpK2mQx9a" {
		t.Fatalf("expected short ID to be resolved, got %q", resolver.lastResolvedID)
	}
}

func TestResolveURLFromSource_ResolvesBareShortID(t *testing.T) {
	fixtureDir := fixtureDirectory(t)

	var request GenerateRequest
	readJSONFixture(t, fixtureDir+"/stage2/output/generate.request.json", &request)

	storedLongURL, err := EncodeLongURL("https://legacy.example.com/base", BuildLongURLPayload(request.Stage1Input, request.Stage2Snapshot), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	resolver := &fakeShortLinkResolver{
		longURLByID: map[string]string{"7NpK2mQx9a": storedLongURL},
	}
	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}

	response, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		resolver,
		"7NpK2mQx9a",
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("ResolveURLFromSource() error = %v", err)
	}

	if response.ShortURL != "http://localhost:11200/sub/7NpK2mQx9a" {
		t.Fatalf("shortUrl mismatch: got %q want %q", response.ShortURL, "http://localhost:11200/sub/7NpK2mQx9a")
	}
	if resolver.lastResolvedID != "7NpK2mQx9a" {
		t.Fatalf("expected short ID to be resolved, got %q", resolver.lastResolvedID)
	}
	if response.RestoreStatus != "replayable" {
		t.Fatalf("restoreStatus mismatch: got %q want %q", response.RestoreStatus, "replayable")
	}
}

func TestResolveURLFromSource_ShortURLNotFound(t *testing.T) {
	_, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		&fakeConversionSource{},
		&fakeShortLinkResolver{},
		"https://example.com/sub/missing",
		0,
		InputLimits{},
	)
	if err == nil {
		t.Fatal("expected error for missing short URL")
	}

	respErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected ResponseError, got %T: %v", err, err)
	}
	if respErr.StatusCode() != 422 {
		t.Fatalf("status code mismatch: got %d want %d", respErr.StatusCode(), 422)
	}
	if respErr.BlockingError().Code != "SHORT_URL_NOT_FOUND" {
		t.Fatalf("error code mismatch: got %q want %q", respErr.BlockingError().Code, "SHORT_URL_NOT_FOUND")
	}
	if respErr.BlockingError().Scope != "stage3_field" {
		t.Fatalf("scope mismatch: got %q want %q", respErr.BlockingError().Scope, "stage3_field")
	}
}

func TestResolveURLFromSource_ShortLinkStoreUnavailable(t *testing.T) {
	_, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		&fakeConversionSource{},
		&fakeShortLinkResolver{err: errors.New("store unavailable")},
		"https://example.com/sub/7NpK2mQx9a",
		0,
		InputLimits{},
	)
	if err == nil {
		t.Fatal("expected error for unavailable short link store")
	}

	respErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected ResponseError, got %T: %v", err, err)
	}
	if respErr.StatusCode() != 503 {
		t.Fatalf("status code mismatch: got %d want %d", respErr.StatusCode(), 503)
	}
	blockingError := respErr.BlockingError()
	if blockingError.Code != "SHORT_LINK_STORE_UNAVAILABLE" {
		t.Fatalf("error code mismatch: got %q want %q", blockingError.Code, "SHORT_LINK_STORE_UNAVAILABLE")
	}
	if blockingError.Retryable == nil || !*blockingError.Retryable {
		t.Fatalf("expected retryable=true, got %+v", blockingError.Retryable)
	}
}

func TestResolveURLFromSource_DowngradesTemplateUnavailableToConflicted(t *testing.T) {
	stage1Input := stage1InputWithTemplate(Stage1Input{
		LandingRawText: "ss://landing",
		TransitRawText: "ss://transit",
	})
	targetName := "🇭🇰 香港节点"
	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{{
			RowID:                 "HK 01",
			SourceLandingNodeName: "HK 01",
			ProxyName:             "HK 01",
			Mode:                  "chain",
			TargetName:            &targetName,
		}},
	}
	longURL, err := EncodeLongURL("http://localhost:11200", BuildLongURLPayload(stage1Input, snapshot), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	source := &failingPrepareConversionSource{
		prepareErr: newResponseError(
			http.StatusServiceUnavailable,
			"TEMPLATE_CONFIG_UNAVAILABLE",
			"模板 URL 当前不可用：无法从 templates.example.com 拉取模板内容。",
			"global",
			nil,
			nil,
			errors.New("template unavailable"),
		),
	}

	response, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		nil,
		longURL,
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("ResolveURLFromSource() error = %v", err)
	}
	if response.RestoreStatus != "conflicted" {
		t.Fatalf("restoreStatus mismatch: got %q want %q", response.RestoreStatus, "conflicted")
	}
	if response.Stage1Input.LandingRawText != stage1Input.LandingRawText {
		t.Fatalf("landingRawText mismatch: got %q want %q", response.Stage1Input.LandingRawText, stage1Input.LandingRawText)
	}
	if response.Stage1Input.TransitRawText != stage1Input.TransitRawText {
		t.Fatalf("transitRawText mismatch: got %q want %q", response.Stage1Input.TransitRawText, stage1Input.TransitRawText)
	}
	if response.Stage1Input.AdvancedOptions.Config == nil || stage1Input.AdvancedOptions.Config == nil {
		t.Fatalf("config should not be nil: got=%v want=%v", response.Stage1Input.AdvancedOptions.Config, stage1Input.AdvancedOptions.Config)
	}
	if strings.TrimSpace(*response.Stage1Input.AdvancedOptions.Config) != strings.TrimSpace(*stage1Input.AdvancedOptions.Config) {
		t.Fatalf("config mismatch: got %q want %q", *response.Stage1Input.AdvancedOptions.Config, *stage1Input.AdvancedOptions.Config)
	}
	if len(response.Stage2Snapshot.Rows) != 1 {
		t.Fatalf("stage2Snapshot rows mismatch: got %d want 1", len(response.Stage2Snapshot.Rows))
	}
	if response.Stage2Snapshot.Rows[0].RowID != "HK 01" || response.Stage2Snapshot.Rows[0].Mode != "chain" {
		t.Fatalf("stage2 row mismatch: got %+v", response.Stage2Snapshot.Rows[0])
	}
	if len(response.BlockingErrors) != 0 {
		t.Fatalf("expected no blocking errors, got %v", response.BlockingErrors)
	}
	if len(response.Messages) != 1 || response.Messages[0].Code != "RESTORE_CONFLICT" {
		t.Fatalf("messages mismatch: got %v", response.Messages)
	}
	if len(response.RestoreConflicts) != 1 || response.RestoreConflicts[0].ReasonCode != "TEMPLATE_CONFIG_UNAVAILABLE" {
		t.Fatalf("restoreConflicts mismatch: got %v", response.RestoreConflicts)
	}
}

func TestResolveURLFromSource_DowngradesTemplateConfigFieldErrorToConflicted(t *testing.T) {
	stage1Input := stage1InputWithTemplate(Stage1Input{
		LandingRawText: "ss://landing",
		TransitRawText: "ss://transit",
	})
	targetName := "🇭🇰 香港节点"
	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{{
			RowID:                 "HK 01",
			SourceLandingNodeName: "HK 01",
			ProxyName:             "HK 01",
			Mode:                  "chain",
			TargetName:            &targetName,
		}},
	}
	longURL, err := EncodeLongURL("http://localhost:11200", BuildLongURLPayload(stage1Input, snapshot), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}

	source := &failingPrepareConversionSource{
		prepareErr: newResponseError(
			http.StatusBadRequest,
			"INVALID_REQUEST",
			"config must not target private or loopback addresses",
			"stage1_field",
			map[string]any{"field": "config"},
			nil,
			errors.New("invalid template host"),
		),
	}

	response, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		nil,
		longURL,
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("ResolveURLFromSource() error = %v", err)
	}
	if response.RestoreStatus != "conflicted" {
		t.Fatalf("restoreStatus mismatch: got %q want %q", response.RestoreStatus, "conflicted")
	}
	if response.Stage1Input.LandingRawText != stage1Input.LandingRawText {
		t.Fatalf("landingRawText mismatch: got %q want %q", response.Stage1Input.LandingRawText, stage1Input.LandingRawText)
	}
	if response.Stage1Input.TransitRawText != stage1Input.TransitRawText {
		t.Fatalf("transitRawText mismatch: got %q want %q", response.Stage1Input.TransitRawText, stage1Input.TransitRawText)
	}
	if response.Stage1Input.AdvancedOptions.Config == nil || stage1Input.AdvancedOptions.Config == nil {
		t.Fatalf("config should not be nil: got=%v want=%v", response.Stage1Input.AdvancedOptions.Config, stage1Input.AdvancedOptions.Config)
	}
	if strings.TrimSpace(*response.Stage1Input.AdvancedOptions.Config) != strings.TrimSpace(*stage1Input.AdvancedOptions.Config) {
		t.Fatalf("config mismatch: got %q want %q", *response.Stage1Input.AdvancedOptions.Config, *stage1Input.AdvancedOptions.Config)
	}
	if len(response.BlockingErrors) != 0 {
		t.Fatalf("expected no blocking errors, got %v", response.BlockingErrors)
	}
	if len(response.Messages) != 1 || response.Messages[0].Code != "RESTORE_CONFLICT" {
		t.Fatalf("messages mismatch: got %v", response.Messages)
	}
	if len(response.RestoreConflicts) != 1 || response.RestoreConflicts[0].ReasonCode != "INVALID_REQUEST" {
		t.Fatalf("restoreConflicts mismatch: got %v", response.RestoreConflicts)
	}
	if response.RestoreConflicts[0].ReasonArgs["field"] != "config" {
		t.Fatalf("restore conflict field mismatch: got %#v", response.RestoreConflicts[0].ReasonArgs)
	}
}

func TestResolveURLFromSource_UsesManagedLandingPass3ForRestoreValidation(t *testing.T) {
	chainTarget := "🇭🇰 香港节点"
	forwardRelay := "relay.example.com:7443"
	stage1Input := stage1InputWithTemplate(Stage1Input{
		LandingRawText:    "https://landing.example/sub",
		TransitRawText:    "https://transit.example/sub",
		ForwardRelayItems: []string{forwardRelay},
		AdvancedOptions:   AdvancedOptions{},
	})
	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "chain",
				TargetName:            &chainTarget,
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing Copy",
				Mode:                  "port_forward",
				TargetName:            &forwardRelay,
			},
		},
	}
	longURL, err := EncodeLongURL("http://localhost:11200", BuildLongURLPayload(stage1Input, snapshot), 0)
	if err != nil {
		t.Fatalf("EncodeLongURL() error = %v", err)
	}
	source := &fakeSnapshotRenderingSource{
		fakeConversionSource: fakeConversionSource{
			usePrepared: true,
			prepared: PreparedConversion{
				Request: subconverter.Request{
					LandingRawText: stage1Input.LandingRawText,
					TransitRawText: stage1Input.TransitRawText,
					Options: subconverter.AdvancedOptions{
						Config: stage1Input.AdvancedOptions.Config,
					},
				},
				TemplateConfig: "custom_proxy_group=🇭🇰 香港节点`select`HK\n",
			},
			plannedResult: subconverter.ThreePassResult{
				LandingDiscovery: subconverter.PassResult{YAML: strings.Join([]string{
					"proxies:",
					"  - {name: HK Landing, server: landing.example.com, port: 443, type: ss}",
					"",
				}, "\n")},
				TransitDiscovery: subconverter.PassResult{YAML: strings.Join([]string{
					"proxies:",
					"  - {name: transit-a, server: transit.example.com, port: 443, type: ss}",
					"proxy-groups:",
					"  - name: 🇭🇰 香港节点",
					"    type: select",
					"    proxies:",
					"      - transit-a",
					"",
				}, "\n")},
			},
		},
		renderedFullBaseYAML: strings.Join([]string{
			"proxies:",
			"  - {name: HK Landing, type: ss, server: landing.example.com, port: 443, dialer-proxy: 🇭🇰 香港节点}",
			"  - {name: HK Landing Copy, type: ss, server: relay.example.com, port: 7443}",
			"  - {name: transit-a, type: ss, server: transit.example.com, port: 443}",
			"proxy-groups:",
			"  - name: 🇭🇰 香港节点",
			"    type: select",
			"    proxies:",
			"      - HK Landing",
			"      - HK Landing Copy",
			"      - transit-a",
			"",
		}, "\n"),
	}

	response, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		nil,
		longURL,
		0,
		InputLimits{},
	)
	if err != nil {
		t.Fatalf("ResolveURLFromSource() error = %v", err)
	}
	if response.RestoreStatus != "replayable" {
		t.Fatalf("restoreStatus mismatch: got %q want %q", response.RestoreStatus, "replayable")
	}
	if source.gotPlan == nil || *source.gotPlan != subconverter.Stage1InitConvertPlan() {
		t.Fatalf("got plan = %+v, want %+v", source.gotPlan, subconverter.Stage1InitConvertPlan())
	}
}

func TestParseResolveURLInput(t *testing.T) {
	tests := []struct {
		name      string
		url       string
		want      resolveURLInput
		wantError bool
	}{
		{name: "valid long url", url: "http://localhost:11200/sub?data=abc", want: resolveURLInput{LongURL: "http://localhost:11200/sub?data=abc", IsLong: true}},
		{name: "valid long url with base path", url: "http://localhost:11200/base/sub?data=abc", want: resolveURLInput{LongURL: "http://localhost:11200/base/sub?data=abc", IsLong: true}},
		{name: "valid short url", url: "http://localhost:11200/sub/7NpK2mQx9a", want: resolveURLInput{ShortID: "7NpK2mQx9a"}},
		{name: "valid short url with base path", url: "http://localhost:11200/base/sub/7NpK2mQx9a", want: resolveURLInput{ShortID: "7NpK2mQx9a"}},
		{name: "valid bare short id", url: "7NpK2mQx9a", want: resolveURLInput{ShortID: "7NpK2mQx9a"}},
		{name: "some random url", url: "https://example.com/page", wantError: true},
		{name: "sub without data", url: "http://localhost:11200/sub", wantError: true},
		{name: "invalid bare token", url: "not-a-short-id", wantError: true},
		{name: "relative url", url: "/sub/7NpK2mQx9a", wantError: true},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got, err := parseResolveURLInput(tt.url)
			if tt.wantError {
				if err == nil {
					t.Fatalf("parseResolveURLInput(%q) error = nil, want error", tt.url)
				}
				return
			}
			if err != nil {
				t.Fatalf("parseResolveURLInput(%q) error = %v", tt.url, err)
			}
			if got != tt.want {
				t.Fatalf("parseResolveURLInput(%q) = %+v, want %+v", tt.url, got, tt.want)
			}
		})
	}
}

type fakeShortLinkResolver struct {
	longURLByID    map[string]string
	err            error
	lastResolvedID string
}

type failingPrepareConversionSource struct {
	prepareErr error
}

func (source *failingPrepareConversionSource) Convert(_ context.Context, _ subconverter.Request) (subconverter.ThreePassResult, error) {
	return subconverter.ThreePassResult{}, errors.New("unexpected Convert call")
}

func (source *failingPrepareConversionSource) PrepareConversion(_ context.Context, _ Stage1Input) (PreparedConversion, error) {
	return PreparedConversion{}, source.prepareErr
}

func (resolver *fakeShortLinkResolver) ResolveShortID(_ context.Context, shortID string) (string, error) {
	resolver.lastResolvedID = shortID
	if resolver.err != nil {
		return "", resolver.err
	}
	if resolver.longURLByID == nil {
		return "", ErrShortURLNotFound
	}
	longURL, ok := resolver.longURLByID[shortID]
	if !ok {
		return "", ErrShortURLNotFound
	}
	return longURL, nil
}

// singleLandingThreePassResult builds a minimal ThreePassResult
// with a single landing node and standard region groups.
func singleLandingThreePassResult(landingName string, landingType string) subconverter.ThreePassResult {
	fullBaseYAML := strings.Join([]string{
		"proxies:",
		"- {name: " + landingName + ", type: " + landingType + ", server: landing.example.com, port: 443}",
		"proxy-groups:",
		"  - name: 🇭🇰 香港节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"  - name: 🇺🇸 美国节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"  - name: 🇯🇵 日本节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"  - name: 🇸🇬 新加坡节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"  - name: 🇼🇸 台湾节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"  - name: 🇰🇷 韩国节点",
		"    type: url-test",
		"    proxies:",
		"      - DIRECT",
		"",
	}, "\n")

	return subconverter.ThreePassResult{
		LandingDiscovery: subconverter.PassResult{YAML: "proxies:\n- {name: " + landingName + ", type: " + landingType + "}\n"},
		TransitDiscovery: subconverter.PassResult{YAML: strings.Join([]string{
			"proxies:",
			"proxy-groups:",
			"  - name: 🇭🇰 香港节点",
			"    type: url-test",
			"    proxies:",
			"      - DIRECT",
			"  - name: 🇺🇸 美国节点",
			"    type: url-test",
			"    proxies:",
			"      - DIRECT",
			"  - name: 🇯🇵 日本节点",
			"    type: url-test",
			"    proxies:",
			"      - DIRECT",
			"  - name: 🇸🇬 新加坡节点",
			"    type: url-test",
			"    proxies:",
			"      - DIRECT",
			"  - name: 🇼🇸 台湾节点",
			"    type: url-test",
			"    proxies:",
			"      - DIRECT",
			"  - name: 🇰🇷 韩国节点",
			"    type: url-test",
			"    proxies:",
			"      - DIRECT",
			"",
		}, "\n")},
		FullBase: subconverter.PassResult{YAML: fullBaseYAML},
	}
}
