package service

import (
	"context"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
)

// ResolveURLRequest is the request payload for POST /api/resolve-url.
type ResolveURLRequest struct {
	URL string `json:"url"`
}

// ResolveURLResponse is the response payload for POST /api/resolve-url.
type ResolveURLResponse struct {
	LongURL          string            `json:"longUrl"`
	ShortURL         string            `json:"shortUrl,omitempty"`
	RestoreStatus    string            `json:"restoreStatus"`
	RestoreConflicts []RestoreConflict `json:"restoreConflicts,omitempty"`
	Stage1Input      Stage1Input       `json:"stage1Input"`
	Stage2           Stage2Bundle      `json:"stage2"`
	Messages         []Message         `json:"messages"`
	BlockingErrors   []BlockingError   `json:"blockingErrors"`
}

type resolveURLInput struct {
	LongURL string
	ShortID string
	IsLong  bool
}

// ResolveURLFromSource resolves a long URL or short URL, replays the 3-pass
// pipeline, and determines the restoreStatus (replayable or conflicted).
func ResolveURLFromSource(ctx context.Context, publicBaseURL string, source ConversionSource, shortLinkResolver ShortLinkResolver, rawURL string, maxLongURLLength int, limits InputLimits) (ResolveURLResponse, error) {
	rawURL = strings.TrimSpace(rawURL)
	if rawURL == "" {
		return ResolveURLResponse{}, newStage3FieldInvalidRequestError("url must not be empty", "currentLinkInput", nil)
	}

	resolved, shortURL, payload, legacyStage1Only, err := resolveLongURLPayload(ctx, publicBaseURL, shortLinkResolver, rawURL, maxLongURLLength, limits)
	if err != nil {
		return ResolveURLResponse{}, err
	}

	payload.Stage1Input = NormalizeStage1Input(payload.Stage1Input)
	if legacyStage1Only {
		return buildLegacyStage1OnlyResolveResponse(resolved, shortURL, payload), nil
	}

	payload.Stage2Snapshot = NormalizeStage2Snapshot(payload.Stage2Snapshot)

	pipeline := NewCorePipeline(ctx, source, payload.Stage1Input, limits).
		WithStage2Snapshot(payload.Stage2Snapshot)
	validationMessages, err := pipeline.ValidateGenerateDryRun()
	if err != nil {
		if restoreStatus, messages, restoreConflicts, downgraded := downgradeRestoreTemplateFixtureError(err); downgraded {
			return ResolveURLResponse{
				LongURL:          resolved,
				ShortURL:         shortURL,
				RestoreStatus:    restoreStatus,
				RestoreConflicts: restoreConflicts,
				Stage1Input:      payload.Stage1Input,
				Stage2:           Stage2Bundle{Snapshot: payload.Stage2Snapshot},
				Messages:         messages,
				BlockingErrors:   []BlockingError{},
			}, nil
		}
		if IsRestoreConflictError(err) {
			return ResolveURLResponse{
				LongURL:          resolved,
				ShortURL:         shortURL,
				RestoreStatus:    "conflicted",
				RestoreConflicts: []RestoreConflict{RestoreConflictFromError(err)},
				Stage1Input:      payload.Stage1Input,
				Stage2:           Stage2Bundle{Snapshot: payload.Stage2Snapshot},
				Messages: []Message{{
					Level:   "warning",
					Code:    "RESTORE_CONFLICT",
					Message: restoreConflictMessage(err),
				}},
				BlockingErrors: []BlockingError{},
			}, nil
		}
		return ResolveURLResponse{}, err
	}

	bundle := Stage2Bundle{Snapshot: payload.Stage2Snapshot}
	// Prefer catalog rebuilt from the same dry-run fixtures when available.
	if fixtures, err := pipeline.LoadGenerateValidationFixtures(); err == nil {
		if rebuilt, err := BuildStage2Bundle(payload.Stage1Input, fixtures); err == nil {
			bundle.Catalog = rebuilt.Catalog
		}
	} else if rebuilt, err := BuildStage2Bundle(payload.Stage1Input, ConversionFixtures{}); err == nil {
		bundle.Catalog = rebuilt.Catalog
	}

	return ResolveURLResponse{
		LongURL:          resolved,
		ShortURL:         shortURL,
		RestoreStatus:    "replayable",
		RestoreConflicts: nil,
		Stage1Input:      payload.Stage1Input,
		Stage2:           bundle,
		Messages: append(
			append([]Message{}, validationMessages...),
			restoreWorkflowMessages("replayable")...,
		),
		BlockingErrors:   []BlockingError{},
	}, nil
}

func buildLegacyStage1OnlyResolveResponse(longURL, shortURL string, payload LongURLPayload) ResolveURLResponse {
	return ResolveURLResponse{
		LongURL:  longURL,
		ShortURL: shortURL,
		RestoreStatus: "conflicted",
		RestoreConflicts: []RestoreConflict{{
			ReasonCode: "LEGACY_PAYLOAD_VERSION",
			ReasonArgs: map[string]any{
				"payloadVersion": payload.V,
				"currentVersion": longURLSchemaVersion,
			},
		}},
		Stage1Input: payload.Stage1Input,
		Stage2: Stage2Bundle{
			Snapshot: Stage2Snapshot{Servers: []Stage2SnapshotServer{}},
		},
		Messages: []Message{{
			Level:   "warning",
			Code:    "RESTORE_CONFLICT",
			Message: legacyPayloadVersionRestoreMessage(payload.V),
		}},
		BlockingErrors: []BlockingError{},
	}
}

func downgradeRestoreTemplateFixtureError(err error) (string, []Message, []RestoreConflict, bool) {
	responseErr, ok := AsResponseError(err)
	if !ok {
		return "", nil, nil, false
	}
	blockingError := responseErr.BlockingError()
	restoreConflict := RestoreConflictFromError(err)
	if blockingError.Code == "TEMPLATE_CONFIG_UNAVAILABLE" {
		return "conflicted", []Message{{
			Level:   "warning",
			Code:    "RESTORE_CONFLICT",
			Message: "当前快照使用的模板 URL 暂时不可用，已恢复输入与快照供参考；请更新模板 URL 后重新转换。",
		}}, []RestoreConflict{restoreConflict}, true
	}
	if blockingError.Scope == "stage1_field" && fmt.Sprint(blockingError.Context["field"]) == "config" {
		return "conflicted", []Message{{
			Level:   "warning",
			Code:    "RESTORE_CONFLICT",
			Message: "当前快照使用的模板 URL 已失效或不再可用，已恢复输入与快照供参考；请更新模板 URL 后重新转换。",
		}}, []RestoreConflict{restoreConflict}, true
	}
	return "", nil, nil, false
}

func resolveLongURLPayload(ctx context.Context, publicBaseURL string, shortLinkResolver ShortLinkResolver, rawURL string, maxLongURLLength int, limits InputLimits) (string, string, LongURLPayload, bool, error) {
	input, err := parseResolveURLInput(rawURL)
	if err != nil {
		return "", "", LongURLPayload{}, false, newResponseError(
			http.StatusBadRequest, "INVALID_URL", "unsupported URL format", "stage3_field", map[string]any{"field": "currentLinkInput"}, nil, err,
		)
	}

	longURL := input.LongURL
	shortURL := ""
	if !input.IsLong {
		if shortLinkResolver == nil {
			retryable := true
			return "", "", LongURLPayload{}, false, newResponseError(
				http.StatusServiceUnavailable,
				"SHORT_LINK_STORE_UNAVAILABLE",
				"short link store is unavailable",
				"global",
				nil,
				&retryable,
				fmt.Errorf("short link resolver is not configured"),
			)
		}

		resolvedLongURL, err := shortLinkResolver.ResolveShortID(ctx, input.ShortID)
		if err != nil {
			if errors.Is(err, ErrShortURLNotFound) {
				return "", "", LongURLPayload{}, false, newStage3FieldValidationError("SHORT_URL_NOT_FOUND", "short URL not found", "currentLinkInput", err)
			}
			retryable := true
			return "", "", LongURLPayload{}, false, newResponseError(
				http.StatusServiceUnavailable,
				"SHORT_LINK_STORE_UNAVAILABLE",
				"short link store is unavailable",
				"global",
				nil,
				&retryable,
				err,
			)
		}
		longURL = resolvedLongURL
		shortURL, err = BuildShortURL(publicBaseURL, input.ShortID)
		if err != nil {
			return "", "", LongURLPayload{}, false, newInternalResponseError("failed to build short URL", err)
		}
	}

	payload, err := DecodeLongURLPayload(longURL, limits)
	if err != nil {
		if _, ok := AsUnsupportedLongURLPayloadVersion(err); ok {
			stage1, version, extractErr := ExtractStage1InputFromLegacyLongURL(longURL, limits)
			if extractErr == nil {
				return longURL, shortURL, LongURLPayload{
					V:           version,
					Stage1Input: stage1,
				}, true, nil
			}
		}
		return "", "", LongURLPayload{}, false, newStage3FieldValidationError("INVALID_LONG_URL", "long URL payload is invalid", "currentLinkInput", err)
	}

	canonicalLongURL, err := EncodeLongURL(publicBaseURL, BuildLongURLPayload(payload.Stage1Input, payload.Stage2Snapshot), maxLongURLLength)
	if err != nil {
		return "", "", LongURLPayload{}, false, err
	}

	return canonicalLongURL, shortURL, payload, false, nil
}

func parseResolveURLInput(rawURL string) (resolveURLInput, error) {
	trimmedInput := strings.TrimSpace(rawURL)
	if isBareShortIDInput(trimmedInput) {
		return resolveURLInput{ShortID: trimmedInput}, nil
	}

	parsedURL, err := url.Parse(trimmedInput)
	if err != nil {
		return resolveURLInput{}, fmt.Errorf("parse url: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return resolveURLInput{}, fmt.Errorf("url must include scheme and host")
	}

	cleanPath := path.Clean(parsedURL.EscapedPath())
	if cleanPath == "." {
		cleanPath = "/"
	}
	trimmedPath := strings.Trim(cleanPath, "/")
	if trimmedPath == "" {
		return resolveURLInput{}, fmt.Errorf("url path %q is not supported", cleanPath)
	}
	segments := strings.Split(trimmedPath, "/")
	lastSegment := segments[len(segments)-1]

	if lastSegment == "sub" {
		if parsedURL.Query().Get(longURLParamData) == "" {
			return resolveURLInput{}, fmt.Errorf("sub URL is missing data query parameter")
		}
		return resolveURLInput{LongURL: rawURL, IsLong: true}, nil
	}

	if len(segments) < 2 || segments[len(segments)-2] != "sub" {
		return resolveURLInput{}, fmt.Errorf("url path %q is not supported", cleanPath)
	}

	shortID := strings.TrimSpace(lastSegment)
	if shortID == "" {
		return resolveURLInput{}, fmt.Errorf("short URL path %q is invalid", cleanPath)
	}

	return resolveURLInput{ShortID: shortID}, nil
}

func isBareShortIDInput(raw string) bool {
	if raw == "" || len(raw) > 11 {
		return false
	}
	if strings.ContainsAny(raw, "/?#&=:%") {
		return false
	}

	for _, char := range raw {
		if !strings.ContainsRune(shortIDBase62Alphabet, char) {
			return false
		}
	}

	return true
}
