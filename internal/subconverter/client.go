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
)

type Client struct {
	baseURL     *url.URL
	timeout     time.Duration
	httpClient  *http.Client
	maxInFlight chan struct{}
}

func NewClient(cfg config.Subconverter) (*Client, error) {
	if err := cfg.Validate(); err != nil {
		return nil, err
	}

	baseURL, err := url.Parse(cfg.BaseURL)
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
	landingURL, err := client.buildPassURL(request, request.LandingRawText, true)
	if err != nil {
		return ThreePassResult{}, err
	}
	landingYAML, err := client.executePass(ctx, "landing-discovery pass", landingURL)
	if err != nil {
		return ThreePassResult{}, err
	}

	transitURL, err := client.buildPassURL(request, request.TransitRawText, true)
	if err != nil {
		return ThreePassResult{}, err
	}
	transitYAML, err := client.executePass(ctx, "transit-discovery pass", transitURL)
	if err != nil {
		return ThreePassResult{}, err
	}

	fullBaseURL, err := client.buildPassURL(request, joinURLs(request.LandingRawText, request.TransitRawText), false)
	if err != nil {
		return ThreePassResult{}, err
	}
	fullBaseYAML, err := client.executePass(ctx, "full-base pass", fullBaseURL)
	if err != nil {
		return ThreePassResult{}, err
	}

	return ThreePassResult{
		LandingDiscovery: PassResult{
			RequestURL: landingURL,
			YAML:       landingYAML,
		},
		TransitDiscovery: PassResult{
			RequestURL: transitURL,
			YAML:       transitYAML,
		},
		FullBase: PassResult{
			RequestURL: fullBaseURL,
			YAML:       fullBaseYAML,
		},
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

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", NewUnavailableError(op, fmt.Errorf("unexpected HTTP status %d", resp.StatusCode))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", NewUnavailableError(op, err)
	}

	if len(strings.TrimSpace(string(body))) == 0 {
		return "", NewUnavailableError(op, fmt.Errorf("empty response body"))
	}

	return string(body), nil
}

func (client *Client) buildPassURL(request Request, rawInput string, list bool) (string, error) {
	baseURL := *client.baseURL
	baseURL.RawQuery = client.buildRawQuery(request, rawInput, list)
	return baseURL.String(), nil
}

func (client *Client) buildRawQuery(request Request, rawInput string, list bool) string {
	params := make([]string, 0, 9)
	params = append(params, "target=clash")
	if request.Options.Emoji {
		params = append(params, "emoji=true")
	}
	if request.Options.UDP {
		params = append(params, "udp=true")
	}
	if request.Options.SkipCertVerify {
		params = append(params, "skip_cert_verify=true")
	}
	params = append(params, "expand=false")
	params = append(params, "classic=true")
	params = append(params, "url="+url.QueryEscape(rawInput))
	if list {
		params = append(params, "list=true")
	}
	if trimmed := strings.TrimSpace(request.Options.Config); trimmed != "" {
		params = append(params, "config="+url.QueryEscape(trimmed))
	}
	if trimmed := strings.TrimSpace(request.Options.Include); trimmed != "" {
		params = append(params, "include="+url.QueryEscape(trimmed))
	}
	if trimmed := strings.TrimSpace(request.Options.Exclude); trimmed != "" {
		params = append(params, "exclude="+url.QueryEscape(trimmed))
	}
	return strings.Join(params, "&")
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
	switch {
	case strings.TrimSpace(landingRawText) == "":
		return transitRawText
	case strings.TrimSpace(transitRawText) == "":
		return landingRawText
	default:
		return landingRawText + "|" + transitRawText
	}
}
