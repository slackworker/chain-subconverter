package service

import (
	"context"
	"errors"
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
	if len(response.Messages) != 0 {
		t.Fatalf("expected 0 messages, got %d: %v", len(response.Messages), response.Messages)
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
	}
	targetName := "🇭🇰 香港节点"
	snapshot := Stage2Snapshot{
		Rows: []Stage2Row{{
			LandingNodeName: "HK 01",
			Mode:            "chain",
			TargetName:      &targetName,
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
	if len(response.Messages) != 1 {
		t.Fatalf("expected 1 message, got %d: %v", len(response.Messages), response.Messages)
	}
	if response.Messages[0].Code != "RESTORE_CONFLICT" {
		t.Fatalf("message code mismatch: got %q want %q", response.Messages[0].Code, "RESTORE_CONFLICT")
	}
	// Original snapshot should still be returned.
	if len(response.Stage2Snapshot.Rows) != 1 || response.Stage2Snapshot.Rows[0].LandingNodeName != "HK 01" {
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
}

func TestResolveURLFromSource_InvalidLongURL(t *testing.T) {
	source := &fakeConversionSource{}

	_, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		nil,
		"http://localhost:11200/subscription?data=invalid-payload",
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
		longURLByID: map[string]string{"abc123": storedLongURL},
	}
	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}

	response, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		source,
		resolver,
		"https://example.com/subscription/abc123.yaml",
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
	if response.RestoreStatus != "replayable" {
		t.Fatalf("restoreStatus mismatch: got %q want %q", response.RestoreStatus, "replayable")
	}
	if resolver.lastResolvedID != "abc123" {
		t.Fatalf("expected short ID to be resolved, got %q", resolver.lastResolvedID)
	}
}

func TestResolveURLFromSource_ShortURLNotFound(t *testing.T) {
	_, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		&fakeConversionSource{},
		&fakeShortLinkResolver{},
		"https://example.com/subscription/missing.yaml",
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
}

func TestResolveURLFromSource_ShortLinkStoreUnavailable(t *testing.T) {
	_, err := ResolveURLFromSource(
		context.Background(),
		"http://localhost:11200",
		&fakeConversionSource{},
		&fakeShortLinkResolver{err: errors.New("store unavailable")},
		"https://example.com/subscription/abc123.yaml",
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

func TestParseResolveURLInput(t *testing.T) {
	tests := []struct {
		name      string
		url       string
		want      resolveURLInput
		wantError bool
	}{
		{name: "valid long url", url: "http://localhost:11200/subscription?data=abc", want: resolveURLInput{LongURL: "http://localhost:11200/subscription?data=abc", IsLong: true}},
		{name: "valid short url", url: "http://localhost:11200/subscription/abc.yaml", want: resolveURLInput{ShortID: "abc"}},
		{name: "some random url", url: "https://example.com/page", wantError: true},
		{name: "subscription without data", url: "http://localhost:11200/subscription", wantError: true},
		{name: "relative url", url: "/subscription/abc.yaml", wantError: true},
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
		TransitDiscovery: subconverter.PassResult{YAML: "proxies:\n"},
		FullBase:         subconverter.PassResult{YAML: fullBaseYAML},
	}
}
