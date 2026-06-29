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
	LongURL        string          `json:"longUrl"`
	ShortURL       string          `json:"shortUrl,omitempty"`
	RestoreStatus  string          `json:"restoreStatus"`
	Stage1Input    Stage1Input     `json:"stage1Input"`
	Stage2Snapshot Stage2Snapshot  `json:"stage2Snapshot"`
	Messages       []Message       `json:"messages"`
	BlockingErrors []BlockingError `json:"blockingErrors"`
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

	resolved, shortURL, payload, err := resolveLongURLPayload(ctx, publicBaseURL, shortLinkResolver, rawURL, maxLongURLLength, limits)
	if err != nil {
		return ResolveURLResponse{}, err
	}

	payload.Stage1Input = NormalizeStage1Input(payload.Stage1Input)
	payload.Stage2Snapshot = NormalizeStage2Snapshot(payload.Stage2Snapshot)

	fixtures, err := loadGenerateValidationFixtures(ctx, source, payload.Stage1Input, payload.Stage2Snapshot, limits)
	if err != nil {
		if restoreStatus, messages, downgraded := downgradeRestoreTemplateFixtureError(err); downgraded {
			return ResolveURLResponse{
				LongURL:        resolved,
				ShortURL:       shortURL,
				RestoreStatus:  restoreStatus,
				Stage1Input:    payload.Stage1Input,
				Stage2Snapshot: payload.Stage2Snapshot,
				Messages:       messages,
				BlockingErrors: []BlockingError{},
			}, nil
		}
		if isRestoreConflictError(err) {
			return ResolveURLResponse{
				LongURL:        resolved,
				ShortURL:       shortURL,
				RestoreStatus:  "conflicted",
				Stage1Input:    payload.Stage1Input,
				Stage2Snapshot: payload.Stage2Snapshot,
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

	restoreStatus, messages, err := determineRestoreStatus(payload.Stage1Input, payload.Stage2Snapshot, fixtures)
	if err != nil {
		return ResolveURLResponse{}, err
	}
	baseMessages := append([]Message{}, fixtures.Messages...)
	baseMessages = append(baseMessages, restoreWorkflowMessages(restoreStatus)...)
	messages = append(baseMessages, messages...)

	return ResolveURLResponse{
		LongURL:        resolved,
		ShortURL:       shortURL,
		RestoreStatus:  restoreStatus,
		Stage1Input:    payload.Stage1Input,
		Stage2Snapshot: payload.Stage2Snapshot,
		Messages:       messages,
		BlockingErrors: []BlockingError{},
	}, nil
}

func downgradeRestoreTemplateFixtureError(err error) (string, []Message, bool) {
	responseErr, ok := AsResponseError(err)
	if !ok {
		return "", nil, false
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code == "TEMPLATE_CONFIG_UNAVAILABLE" {
		return "conflicted", []Message{{
			Level:   "warning",
			Code:    "RESTORE_CONFLICT",
			Message: "当前快照使用的模板 URL 暂时不可用，已恢复输入与快照供参考；请更新模板 URL 后重新转换。",
		}}, true
	}
	if blockingError.Scope == "stage1_field" && fmt.Sprint(blockingError.Context["field"]) == "config" {
		return "conflicted", []Message{{
			Level:   "warning",
			Code:    "RESTORE_CONFLICT",
			Message: "当前快照使用的模板 URL 已失效或不再可用，已恢复输入与快照供参考；请更新模板 URL 后重新转换。",
		}}, true
	}
	return "", nil, false
}

func resolveLongURLPayload(ctx context.Context, publicBaseURL string, shortLinkResolver ShortLinkResolver, rawURL string, maxLongURLLength int, limits InputLimits) (string, string, LongURLPayload, error) {
	input, err := parseResolveURLInput(rawURL)
	if err != nil {
		return "", "", LongURLPayload{}, newResponseError(
			http.StatusBadRequest, "INVALID_URL", "unsupported URL format", "stage3_field", map[string]any{"field": "currentLinkInput"}, nil, err,
		)
	}

	longURL := input.LongURL
	shortURL := ""
	if !input.IsLong {
		if shortLinkResolver == nil {
			retryable := true
			return "", "", LongURLPayload{}, newResponseError(
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
				return "", "", LongURLPayload{}, newStage3FieldValidationError("SHORT_URL_NOT_FOUND", "short URL not found", "currentLinkInput", err)
			}
			retryable := true
			return "", "", LongURLPayload{}, newResponseError(
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
			return "", "", LongURLPayload{}, newInternalResponseError("failed to build short URL", err)
		}
	}

	payload, err := DecodeLongURLPayload(longURL, limits)
	if err != nil {
		return "", "", LongURLPayload{}, newStage3FieldValidationError("INVALID_LONG_URL", "long URL payload is invalid", "currentLinkInput", err)
	}

	canonicalLongURL, err := EncodeLongURL(publicBaseURL, BuildLongURLPayload(payload.Stage1Input, payload.Stage2Snapshot), maxLongURLLength)
	if err != nil {
		return "", "", LongURLPayload{}, err
	}

	return canonicalLongURL, shortURL, payload, nil
}

// determineRestoreStatus runs the generate-phase validation against the
// restored snapshot and current fixtures to decide replayable vs conflicted.
//
// Per spec 04-business-rules §3.2.1:
//   - If every row passes validation -> "replayable"
//   - If any row has an invalid reference -> "conflicted" + RESTORE_CONFLICT message
func determineRestoreStatus(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, fixtures ConversionFixtures) (string, []Message, error) {
	_, err := validateGenerateSnapshot(stage1Input, stage2Snapshot, fixtures)
	if err == nil {
		return "replayable", []Message{}, nil
	}

	if !isRestoreConflictError(err) {
		if responseErr, ok := AsResponseError(err); ok && responseErr.StatusCode() < http.StatusInternalServerError {
			return "", nil, newStage3FieldValidationError("INVALID_LONG_URL", "long URL payload is invalid", "currentLinkInput", err)
		}
		return "", nil, err
	}
	return "conflicted", []Message{{
		Level:   "warning",
		Code:    "RESTORE_CONFLICT",
		Message: restoreConflictMessage(err),
	}}, nil
}

func isRestoreConflictError(err error) bool {
	responseErr, ok := AsResponseError(err)
	if !ok {
		return false
	}

	switch responseErr.BlockingError().Code {
	case "STAGE2_ROWSET_MISMATCH", "TARGET_NOT_FOUND", "EMPTY_CHAIN_TARGET", "LANDING_NODE_NOT_FOUND", "SERVER_AGGREGATION_MEMBER_NOT_FOUND", "SERVER_AGGREGATION_GROUP_TOO_SMALL", "SERVER_AGGREGATION_SERVER_MISMATCH":
		return true
	default:
		return false
	}
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
