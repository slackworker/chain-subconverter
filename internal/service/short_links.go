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
	"sort"
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
		return ShortLinkResponse{}, newStage3FieldInvalidRequestError("longUrl must not be empty", "currentLinkInput", nil)
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

	canonicalTarget, err := canonicalizeShortLinkTarget(publicBaseURL, rawLongURL, maxLongURLLength, limits)
	if err != nil {
		if _, ok := AsResponseError(err); ok {
			return ShortLinkResponse{}, err
		}
		return ShortLinkResponse{}, newStage3FieldValidationError("INVALID_LONG_URL", "long URL payload is invalid", "currentLinkInput", err)
	}

	entry, err := shortLinkStore.CreateOrGet(ctx, canonicalTarget.StateKey, DeterministicShortID(canonicalTarget.StateKey), canonicalTarget.LongURL)
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
		LongURL:        canonicalTarget.LongURL,
		ShortURL:       shortURL,
		Messages:       shortLinkWorkflowMessages(),
		BlockingErrors: []BlockingError{},
	}, nil
}

func DeterministicShortID(stateKey string) string {
	sum := sha256.Sum256([]byte(stateKey))
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
		parsedURL.Path = longURLPath + "/" + url.PathEscape(shortID)
	} else {
		parsedURL.Path = path.Clean(basePath) + longURLPath + "/" + url.PathEscape(shortID)
	}
	parsedURL.RawQuery = ""
	parsedURL.Fragment = ""
	return parsedURL.String(), nil
}

type canonicalShortLinkTarget struct {
	LongURL  string
	StateKey string
}

func CanonicalShortLinkStateKey(rawLongURL string, limits InputLimits) (string, error) {
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

	canonicalPayloadForStateKey := canonicalizeLongURLPayloadForShortLinkStateKey(
		BuildLongURLPayload(payload.Stage1Input, payload.Stage2Snapshot),
	)
	return encodeLongURLStateKey(canonicalPayloadForStateKey)
}

func canonicalizeShortLinkTarget(publicBaseURL string, rawLongURL string, maxLongURLLength int, limits InputLimits) (canonicalShortLinkTarget, error) {
	input, err := parseResolveURLInput(rawLongURL)
	if err != nil {
		return canonicalShortLinkTarget{}, err
	}
	if !input.IsLong {
		return canonicalShortLinkTarget{}, fmt.Errorf("URL is not a long subscription URL")
	}

	payload, err := DecodeLongURLPayload(rawLongURL, limits)
	if err != nil {
		return canonicalShortLinkTarget{}, err
	}

	canonicalPayload := BuildLongURLPayload(payload.Stage1Input, payload.Stage2Snapshot)
	canonicalPayloadForStateKey := canonicalizeLongURLPayloadForShortLinkStateKey(canonicalPayload)
	stateKey, err := encodeLongURLStateKey(canonicalPayloadForStateKey)
	if err != nil {
		return canonicalShortLinkTarget{}, fmt.Errorf("encode canonical short link state key: %w", err)
	}

	canonicalLongURL, err := EncodeLongURL(publicBaseURL, canonicalPayload, maxLongURLLength)
	if err != nil {
		return canonicalShortLinkTarget{}, err
	}

	return canonicalShortLinkTarget{
		LongURL:  canonicalLongURL,
		StateKey: stateKey,
	}, nil
}

func canonicalizeLongURLPayloadForShortLinkStateKey(payload LongURLPayload) LongURLPayload {
	canonical := payload
	rows := make([]Stage2Row, len(payload.Stage2Snapshot.Rows))
	copy(rows, payload.Stage2Snapshot.Rows)

	rowIDByOriginal := make(map[string]string, len(rows)*2)
	for index, row := range rows {
		originalRowID := strings.TrimSpace(row.rowIDOrFallback())
		canonicalRowID := strings.TrimSpace(row.proxyNameOrFallback())
		if canonicalRowID == "" {
			canonicalRowID = originalRowID
		}
		rows[index].RowID = canonicalRowID
		if originalRowID != "" {
			rowIDByOriginal[originalRowID] = canonicalRowID
		}
		if canonicalRowID != "" {
			rowIDByOriginal[canonicalRowID] = canonicalRowID
		}
	}

	sort.Slice(rows, func(left, right int) bool {
		return compareStage2RowCanonicalOrder(rows[left], rows[right]) < 0
	})

	groups := make([]ServerAggregationGroup, len(payload.Stage2Snapshot.ServerAggregationGroups))
	for index, group := range payload.Stage2Snapshot.ServerAggregationGroups {
		memberRowIDs := make([]string, 0, len(group.MemberRowIDs))
		seen := make(map[string]struct{}, len(group.MemberRowIDs))
		for _, memberRowID := range group.MemberRowIDs {
			memberKey := strings.TrimSpace(memberRowID)
			if memberKey == "" {
				continue
			}
			canonicalMemberRowID := strings.TrimSpace(rowIDByOriginal[memberKey])
			if canonicalMemberRowID == "" {
				canonicalMemberRowID = memberKey
			}
			if _, exists := seen[canonicalMemberRowID]; exists {
				continue
			}
			seen[canonicalMemberRowID] = struct{}{}
			memberRowIDs = append(memberRowIDs, canonicalMemberRowID)
		}
		sort.Strings(memberRowIDs)
		groups[index] = ServerAggregationGroup{
			Server:       strings.TrimSpace(group.Server),
			Enabled:      group.Enabled,
			Strategy:     strings.TrimSpace(group.Strategy),
			MemberRowIDs: memberRowIDs,
		}
	}

	sort.Slice(groups, func(left, right int) bool {
		return compareServerAggregationGroupCanonicalOrder(groups[left], groups[right]) < 0
	})

	canonical.Stage2Snapshot = Stage2Snapshot{
		Rows:                    rows,
		ServerAggregationGroups: groups,
	}
	return canonical
}

func compareStage2RowCanonicalOrder(left Stage2Row, right Stage2Row) int {
	leftFields := []string{
		strings.TrimSpace(left.sourceLandingNodeNameOrFallback()),
		strings.TrimSpace(left.proxyNameOrFallback()),
		strings.TrimSpace(left.Mode),
		normalizeOptionalStringValue(left.TargetName),
		strings.TrimSpace(normalizeChainProxyGroupProfile(left.ChainProxyGroupProfile)),
	}
	rightFields := []string{
		strings.TrimSpace(right.sourceLandingNodeNameOrFallback()),
		strings.TrimSpace(right.proxyNameOrFallback()),
		strings.TrimSpace(right.Mode),
		normalizeOptionalStringValue(right.TargetName),
		strings.TrimSpace(normalizeChainProxyGroupProfile(right.ChainProxyGroupProfile)),
	}
	return compareStringFields(leftFields, rightFields)
}

func compareServerAggregationGroupCanonicalOrder(left ServerAggregationGroup, right ServerAggregationGroup) int {
	leftFields := []string{
		strings.TrimSpace(left.Server),
		boolToCanonicalString(left.Enabled),
		strings.TrimSpace(left.Strategy),
		strings.Join(left.MemberRowIDs, "\x00"),
	}
	rightFields := []string{
		strings.TrimSpace(right.Server),
		boolToCanonicalString(right.Enabled),
		strings.TrimSpace(right.Strategy),
		strings.Join(right.MemberRowIDs, "\x00"),
	}
	return compareStringFields(leftFields, rightFields)
}

func compareStringFields(left []string, right []string) int {
	limit := len(left)
	if len(right) < limit {
		limit = len(right)
	}
	for index := 0; index < limit; index++ {
		if left[index] == right[index] {
			continue
		}
		if left[index] < right[index] {
			return -1
		}
		return 1
	}
	switch {
	case len(left) < len(right):
		return -1
	case len(left) > len(right):
		return 1
	default:
		return 0
	}
}

func normalizeOptionalStringValue(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

func boolToCanonicalString(value bool) string {
	if value {
		return "1"
	}
	return "0"
}
