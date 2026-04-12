package service

import (
	"context"
	"crypto/sha256"
	"encoding/binary"
	"errors"
	"fmt"
	"net/http"
	"net/url"
	"path"
	"strings"
)

const shortIDBase62Alphabet = "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz"

type ShortLinkRequest struct {
	LongURL string `json:"longUrl"`
}

type ShortLinkResponse struct {
	LongURL        string          `json:"longUrl"`
	ShortURL       string          `json:"shortUrl"`
	Messages       []Message       `json:"messages"`
	BlockingErrors []BlockingError `json:"blockingErrors"`
}

func BuildShortLinkResponse(ctx context.Context, publicBaseURL string, shortLinkStore ShortLinkStore, rawLongURL string, maxLongURLLength int, limits InputLimits) (ShortLinkResponse, error) {
	rawLongURL = strings.TrimSpace(rawLongURL)
	if rawLongURL == "" {
		return ShortLinkResponse{}, newInvalidRequestError("longUrl must not be empty", nil)
	}
	if shortLinkStore == nil {
		retryable := true
		return ShortLinkResponse{}, newResponseError(
			http.StatusServiceUnavailable,
			"SHORT_LINK_STORE_UNAVAILABLE",
			"short link store is unavailable",
			"global",
			nil,
			&retryable,
			fmt.Errorf("short link store is not configured"),
		)
	}

	canonicalLongURL, err := canonicalizeLongURL(publicBaseURL, rawLongURL, maxLongURLLength, limits)
	if err != nil {
		if _, ok := AsResponseError(err); ok {
			return ShortLinkResponse{}, err
		}
		return ShortLinkResponse{}, newGlobalValidationError("INVALID_LONG_URL", "long URL payload is invalid", err)
	}

	entry, err := shortLinkStore.CreateOrGet(ctx, DeterministicShortID(canonicalLongURL), canonicalLongURL)
	if err != nil {
		if errors.Is(err, ErrShortIDCollision) {
			return ShortLinkResponse{}, newInternalResponseError("short link ID collision detected", err)
		}
		retryable := true
		return ShortLinkResponse{}, newResponseError(
			http.StatusServiceUnavailable,
			"SHORT_LINK_STORE_UNAVAILABLE",
			"short link store is unavailable",
			"global",
			nil,
			&retryable,
			err,
		)
	}

	shortURL, err := BuildShortURL(publicBaseURL, entry.ShortID)
	if err != nil {
		return ShortLinkResponse{}, newInternalResponseError("failed to build short URL", err)
	}

	return ShortLinkResponse{
		LongURL:        canonicalLongURL,
		ShortURL:       shortURL,
		Messages:       []Message{},
		BlockingErrors: []BlockingError{},
	}, nil
}

func DeterministicShortID(longURL string) string {
	sum := sha256.Sum256([]byte(longURL))
	return encodeBase62Uint64(binary.BigEndian.Uint64(sum[:8]))
}

func encodeBase62Uint64(value uint64) string {
	if value == 0 {
		return string(shortIDBase62Alphabet[0])
	}

	encoded := make([]byte, 0, 11)
	for value > 0 {
		remainder := value % 62
		encoded = append(encoded, shortIDBase62Alphabet[remainder])
		value /= 62
	}

	for left, right := 0, len(encoded)-1; left < right; left, right = left+1, right-1 {
		encoded[left], encoded[right] = encoded[right], encoded[left]
	}
	return string(encoded)
}

func BuildShortURL(publicBaseURL string, shortID string) (string, error) {
	parsedURL, err := url.Parse(strings.TrimSpace(publicBaseURL))
	if err != nil {
		return "", fmt.Errorf("parse public base URL: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return "", fmt.Errorf("public base URL must include scheme and host")
	}

	basePath := strings.TrimRight(parsedURL.EscapedPath(), "/")
	if basePath == "" {
		parsedURL.Path = "/subscription/" + url.PathEscape(shortID) + ".yaml"
	} else {
		parsedURL.Path = path.Clean(basePath) + "/subscription/" + url.PathEscape(shortID) + ".yaml"
	}
	parsedURL.RawQuery = ""
	parsedURL.Fragment = ""
	return parsedURL.String(), nil
}

func canonicalizeLongURL(publicBaseURL string, rawLongURL string, maxLongURLLength int, limits InputLimits) (string, error) {
	input, err := parseResolveURLInput(rawLongURL)
	if err != nil {
		return "", err
	}
	if !input.IsLong {
		return "", fmt.Errorf("URL is not a long subscription URL")
	}

	payload, err := DecodeLongURLPayload(rawLongURL, limits)
	if err != nil {
		return "", err
	}

	return EncodeLongURL(publicBaseURL, BuildLongURLPayload(payload.Stage1Input, payload.Stage2Snapshot), maxLongURLLength)
}
