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
		return ResolveURLResponse{}, newResponseError(
			http.StatusBadRequest, "INVALID_REQUEST", "url must not be empty", "global", nil, nil, nil,
		)
	}

	resolved, payload, err := resolveLongURLPayload(ctx, publicBaseURL, shortLinkResolver, rawURL, maxLongURLLength, limits)
	if err != nil {
		return ResolveURLResponse{}, err
	}

	payload.Stage1Input = NormalizeStage1Input(payload.Stage1Input)

	fixtures, err := LoadConversionFixtures(ctx, source, payload.Stage1Input, limits)
	if err != nil {
		return ResolveURLResponse{}, err
	}

	restoreStatus, messages := determineRestoreStatus(payload.Stage1Input, payload.Stage2Snapshot, fixtures)

	return ResolveURLResponse{
		LongURL:        resolved,
		RestoreStatus:  restoreStatus,
		Stage1Input:    payload.Stage1Input,
		Stage2Snapshot: payload.Stage2Snapshot,
		Messages:       messages,
		BlockingErrors: []BlockingError{},
	}, nil
}

func resolveLongURLPayload(ctx context.Context, publicBaseURL string, shortLinkResolver ShortLinkResolver, rawURL string, maxLongURLLength int, limits InputLimits) (string, LongURLPayload, error) {
	input, err := parseResolveURLInput(rawURL)
	if err != nil {
		return "", LongURLPayload{}, newResponseError(
			http.StatusBadRequest, "INVALID_URL", "unsupported URL format", "global", nil, nil, err,
		)
	}

	longURL := input.LongURL
	if !input.IsLong {
		if shortLinkResolver == nil {
			retryable := true
			return "", LongURLPayload{}, newResponseError(
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
				return "", LongURLPayload{}, newResponseError(
					http.StatusUnprocessableEntity,
					"SHORT_URL_NOT_FOUND",
					"short URL not found",
					"global",
					nil,
					nil,
					err,
				)
			}
			retryable := true
			return "", LongURLPayload{}, newResponseError(
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
	}

	payload, err := DecodeLongURLPayload(longURL, limits)
	if err != nil {
		return "", LongURLPayload{}, newResponseError(
			http.StatusUnprocessableEntity, "INVALID_LONG_URL", "long URL payload is invalid", "global", nil, nil, err,
		)
	}

	canonicalLongURL, err := EncodeLongURL(publicBaseURL, BuildLongURLPayload(payload.Stage1Input, payload.Stage2Snapshot), maxLongURLLength)
	if err != nil {
		return "", LongURLPayload{}, err
	}

	return canonicalLongURL, payload, nil
}

// determineRestoreStatus runs the generate-phase validation against the
// restored snapshot and current fixtures to decide replayable vs conflicted.
//
// Per spec 04-business-rules §3.2.1:
//   - If every row passes validation → "replayable"
//   - If any row has an invalid reference → "conflicted" + RESTORE_CONFLICT message
func determineRestoreStatus(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, fixtures ConversionFixtures) (string, []Message) {
	_, err := validateGenerateSnapshot(stage1Input, stage2Snapshot, fixtures)
	if err == nil {
		return "replayable", []Message{}
	}

	return "conflicted", []Message{{
		Level:   "warning",
		Code:    "RESTORE_CONFLICT",
		Message: fmt.Sprintf("restore conflict: %s", err.Error()),
	}}
}

func parseResolveURLInput(rawURL string) (resolveURLInput, error) {
	parsedURL, err := url.Parse(strings.TrimSpace(rawURL))
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

	if lastSegment == "subscription" {
		if parsedURL.Query().Get("data") == "" {
			return resolveURLInput{}, fmt.Errorf("subscription URL is missing data query parameter")
		}
		return resolveURLInput{LongURL: rawURL, IsLong: true}, nil
	}

	if len(segments) < 2 || segments[len(segments)-2] != "subscription" || !strings.HasSuffix(lastSegment, ".yaml") {
		return resolveURLInput{}, fmt.Errorf("url path %q is not supported", cleanPath)
	}

	shortID := strings.TrimSuffix(lastSegment, ".yaml")
	if shortID == "" {
		return resolveURLInput{}, fmt.Errorf("short URL path %q is invalid", cleanPath)
	}

	return resolveURLInput{ShortID: shortID}, nil
}
