package config

import (
	"fmt"
	"net/url"
	"os"
	"path"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultSubconverterBaseURL     = "http://subconverter:25500/sub?"
	DefaultSubconverterTimeout     = 15 * time.Second
	DefaultSubconverterMaxInFlight = 10

	EnvSubconverterBaseURL     = "CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL"
	EnvSubconverterTimeout     = "CHAIN_SUBCONVERTER_SUBCONVERTER_TIMEOUT"
	EnvSubconverterMaxInFlight = "CHAIN_SUBCONVERTER_SUBCONVERTER_MAX_IN_FLIGHT"
)

type Subconverter struct {
	BaseURL     string
	Timeout     time.Duration
	MaxInFlight int
}

func DefaultSubconverter() Subconverter {
	return Subconverter{
		BaseURL:     DefaultSubconverterBaseURL,
		Timeout:     DefaultSubconverterTimeout,
		MaxInFlight: DefaultSubconverterMaxInFlight,
	}
}

func LoadSubconverterFromEnv() (Subconverter, error) {
	cfg := DefaultSubconverter()

	if value, ok := lookupTrimmedEnv(EnvSubconverterBaseURL); ok {
		normalizedBaseURL, err := NormalizeSubconverterBaseURL(value)
		if err != nil {
			return Subconverter{}, fmt.Errorf("normalize %s: %w", EnvSubconverterBaseURL, err)
		}
		cfg.BaseURL = normalizedBaseURL
	}

	if value, ok := lookupTrimmedEnv(EnvSubconverterTimeout); ok {
		timeout, err := time.ParseDuration(value)
		if err != nil {
			return Subconverter{}, fmt.Errorf("parse %s: %w", EnvSubconverterTimeout, err)
		}
		cfg.Timeout = timeout
	}

	if value, ok := lookupTrimmedEnv(EnvSubconverterMaxInFlight); ok {
		maxInFlight, err := strconv.Atoi(value)
		if err != nil {
			return Subconverter{}, fmt.Errorf("parse %s: %w", EnvSubconverterMaxInFlight, err)
		}
		cfg.MaxInFlight = maxInFlight
	}

	if err := cfg.Validate(); err != nil {
		return Subconverter{}, err
	}

	return cfg, nil
}

func (cfg Subconverter) Validate() error {
	if strings.TrimSpace(cfg.BaseURL) == "" {
		return fmt.Errorf("subconverter base URL must not be empty")
	}
	if _, err := NormalizeSubconverterBaseURL(cfg.BaseURL); err != nil {
		return err
	}
	if cfg.Timeout <= 0 {
		return fmt.Errorf("subconverter timeout must be greater than zero")
	}
	if cfg.MaxInFlight <= 0 {
		return fmt.Errorf("subconverter maxInFlight must be greater than zero")
	}
	return nil
}

func NormalizeSubconverterBaseURL(rawURL string) (string, error) {
	trimmedURL := strings.TrimSpace(rawURL)
	if trimmedURL == "" {
		return "", fmt.Errorf("subconverter base URL must not be empty")
	}

	candidateURL := trimmedURL
	if !strings.Contains(candidateURL, "://") {
		candidateURL = "http://" + candidateURL
	}

	parsedURL, err := url.Parse(candidateURL)
	if err != nil {
		return "", fmt.Errorf("subconverter base URL must be a valid http(s) URL, got %q", trimmedURL)
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return "", fmt.Errorf("subconverter base URL must use http or https, got %q", parsedURL.Scheme)
	}
	if parsedURL.Host == "" {
		return "", fmt.Errorf("subconverter base URL must include host, got %q; try %q", trimmedURL, "http://localhost:25500/sub")
	}

	parsedURL.Path = normalizeSubconverterEndpointPath(parsedURL.Path)
	parsedURL.RawPath = ""
	return parsedURL.String(), nil
}

func normalizeSubconverterEndpointPath(rawPath string) string {
	trimmedPath := strings.TrimSpace(rawPath)
	if trimmedPath == "" || trimmedPath == "/" {
		return "/sub"
	}

	cleanPath := path.Clean(trimmedPath)
	if !strings.HasPrefix(cleanPath, "/") {
		cleanPath = "/" + cleanPath
	}
	if cleanPath == "/sub" || strings.HasSuffix(cleanPath, "/sub") {
		return cleanPath
	}

	return strings.TrimRight(cleanPath, "/") + "/sub"
}

func lookupTrimmedEnv(key string) (string, bool) {
	value, ok := os.LookupEnv(key)
	if !ok {
		return "", false
	}
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "", false
	}
	return trimmed, true
}
