package subconverter

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/slackworker/chain-subconverter/internal/config"
	"github.com/slackworker/chain-subconverter/internal/inpututil"
)

type Client struct {
	baseURL     *url.URL
	timeout     time.Duration
	httpClient  *http.Client
	maxInFlight chan struct{}
}

type RequestURLs struct {
	LandingDiscovery string
	TransitDiscovery string
	FullBase         string
}

func NewClient(cfg config.Subconverter) (*Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	normalizedBaseURL, err := config.NormalizeSubconverterBaseURL(cfg.BaseURL)
	if err != nil {
		return nil, err
	}

	baseURL, err := url.Parse(normalizedBaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse subconverter base URL: %w", err)
	}
	if baseURL.Scheme == "" || baseURL.Host == "" {
		return nil, fmt.Errorf("subconverter base URL must include scheme and host")
	}

	return &Client{
		baseURL:     baseURL,
		timeout:     cfg.Timeout,
		httpClient:  &http.Client{},
		maxInFlight: make(chan struct{}, cfg.MaxInFlight),
	}, nil
}

func (client *Client) Convert(ctx context.Context, request Request) (ThreePassResult, error) {
	requestURLs, err := BuildRequestURLs(client.baseURL.String(), request)
	if err != nil {
		return ThreePassResult{}, err
	}
	landingYAML, err := client.executePass(ctx, "landing-discovery pass", requestURLs.LandingDiscovery)
	if err != nil {
		return ThreePassResult{}, err
	}

	transitYAML, err := client.executePass(ctx, "transit-discovery pass", requestURLs.TransitDiscovery)
	if err != nil {
		return ThreePassResult{}, err
	}

	fullBaseYAML, err := client.executePass(ctx, "full-base pass", requestURLs.FullBase)
	if err != nil {
		return ThreePassResult{}, err
	}

	return ThreePassResult{
		LandingDiscovery: PassResult{
			RequestURL: requestURLs.LandingDiscovery,
			YAML:       landingYAML,
		},
		TransitDiscovery: PassResult{
			RequestURL: requestURLs.TransitDiscovery,
			YAML:       transitYAML,
		},
		FullBase: PassResult{
			RequestURL: requestURLs.FullBase,
			YAML:       fullBaseYAML,
		},
	}, nil
}

func BuildRequestURLs(baseURL string, request Request) (RequestURLs, error) {
	normalizedBaseURL, err := config.NormalizeSubconverterBaseURL(baseURL)
	if err != nil {
		return RequestURLs{}, fmt.Errorf("normalize subconverter base URL: %w", err)
	}

	parsedBaseURL, err := url.Parse(normalizedBaseURL)
	if err != nil {
		return RequestURLs{}, fmt.Errorf("parse subconverter base URL: %w", err)
	}
	if parsedBaseURL.Scheme == "" || parsedBaseURL.Host == "" {
		return RequestURLs{}, fmt.Errorf("subconverter base URL must include scheme and host")
	}

	landingURL, err := buildPassURLFromBaseURL(parsedBaseURL, request, request.LandingRawText, true, request.ExtraQuery)
	if err != nil {
		return RequestURLs{}, err
	}
	transitURL, err := buildPassURLFromBaseURL(parsedBaseURL, request, request.TransitRawText, true, request.ExtraQuery)
	if err != nil {
		return RequestURLs{}, err
	}
	fullBaseURL, err := buildPassURLFromBaseURL(parsedBaseURL, request, joinURLs(request.LandingRawText, request.TransitRawText), false, request.ExtraQuery)
	if err != nil {
		return RequestURLs{}, err
	}

	return RequestURLs{
		LandingDiscovery: landingURL,
		TransitDiscovery: transitURL,
		FullBase:         fullBaseURL,
	}, nil
}

func (client *Client) executePass(ctx context.Context, op string, rawURL string) (string, error) {
	if err := client.acquire(); err != nil {
		return "", err
	}
	defer client.release()

	timeoutCtx, cancel := context.WithTimeout(ctx, client.timeout)
	defer cancel()

	req, err := http.NewRequestWithContext(timeoutCtx, http.MethodGet, rawURL, nil)
	if err != nil {
		return "", NewUnavailableError(op, fmt.Errorf("build request: %w", err))
	}

	resp, err := client.httpClient.Do(req)
	if err != nil {
		return "", NewUnavailableError(op, err)
	}
	defer resp.Body.Close()

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", NewUnavailableError(op, err)
	}

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		message := fmt.Sprintf("unexpected HTTP status %d", resp.StatusCode)
		if details := strings.TrimSpace(string(body)); details != "" {
			message += ": " + details
		}
		return "", NewUnavailableError(op, fmt.Errorf("%s", message))
	}

	if len(strings.TrimSpace(string(body))) == 0 {
		return "", NewUnavailableError(op, fmt.Errorf("empty response body"))
	}

	return string(body), nil
}

func (client *Client) buildPassURL(request Request, rawInput string, list bool, extraQuery url.Values) (string, error) {
	return buildPassURLFromBaseURL(client.baseURL, request, rawInput, list, extraQuery)
}

func buildPassURLFromBaseURL(baseURL *url.URL, request Request, rawInput string, list bool, extraQuery url.Values) (string, error) {
	if baseURL == nil {
		return "", fmt.Errorf("subconverter base URL must not be nil")
	}
	requestURL := *baseURL
	requestURL.RawQuery = buildRawQuery(request, rawInput, list, extraQuery)
	return requestURL.String(), nil
}

func buildRawQuery(request Request, rawInput string, list bool, extraQuery url.Values) string {
	params := make([]string, 0, 9)
	params = append(params, "target=clash")
	params = appendOptionalBoolQuery(params, "emoji", request.Options.Emoji)
	params = appendOptionalBoolQuery(params, "udp", request.Options.UDP)
	params = appendOptionalBoolQuery(params, "scv", request.Options.SkipCertVerify)
	params = append(params, "expand=false")
	params = append(params, "classic=true")
	params = append(params, "url="+url.QueryEscape(normalizeSubconverterURLInput(rawInput)))
	if list {
		params = append(params, "list=true")
	}
	params = appendOptionalStringQuery(params, "config", request.Options.Config)
	params = appendOptionalStringListQuery(params, "include", request.Options.Include)
	params = appendOptionalStringListQuery(params, "exclude", request.Options.Exclude)
	params = appendExtraQuery(params, extraQuery)
	return strings.Join(params, "&")
}

func cloneExtraQuery(values url.Values) url.Values {
	if len(values) == 0 {
		return url.Values{}
	}
	cloned := make(url.Values, len(values))
	for name, entries := range values {
		cloned[name] = append([]string(nil), entries...)
	}
	return cloned
}

func appendOptionalBoolQuery(params []string, name string, value *bool) []string {
	if value == nil {
		return params
	}

	if *value {
		return append(params, name+"=true")
	}

	return append(params, name+"=false")
}

func appendOptionalStringQuery(params []string, name string, value *string) []string {
	if value == nil {
		return params
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return params
	}

	return append(params, name+"="+url.QueryEscape(trimmed))
}

func appendOptionalStringListQuery(params []string, name string, values []string) []string {
	if len(values) == 0 {
		return params
	}

	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}
	if len(normalized) == 0 {
		return params
	}

	return append(params, name+"="+url.QueryEscape(strings.Join(normalized, "|")))
}

func appendExtraQuery(params []string, extraQuery url.Values) []string {
	if len(extraQuery) == 0 {
		return params
	}

	for name, values := range extraQuery {
		trimmedName := strings.TrimSpace(name)
		if trimmedName == "" {
			continue
		}
		for _, value := range values {
			trimmedValue := strings.TrimSpace(value)
			if trimmedValue == "" {
				continue
			}
			params = append(params, trimmedName+"="+url.QueryEscape(trimmedValue))
		}
	}

	return params
}

func normalizeSubconverterURLInput(rawInput string) string {
	return inpututil.NormalizeURLText(rawInput)
}

func (client *Client) acquire() error {
	select {
	case client.maxInFlight <- struct{}{}:
		return nil
	default:
		return NewUnavailableError("acquire subconverter slot", fmt.Errorf("max in-flight requests reached"))
	}
}

func (client *Client) release() {
	select {
	case <-client.maxInFlight:
	default:
	}
}

func joinURLs(landingRawText string, transitRawText string) string {
	landing := normalizeSubconverterURLInput(landingRawText)
	transit := normalizeSubconverterURLInput(transitRawText)

	switch {
	case landing == "":
		return transit
	case transit == "":
		return landing
	default:
		return landing + "|" + transit
	}
}
