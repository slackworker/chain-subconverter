package config

import (
	"fmt"
	"net/url"
	"strconv"
	"strings"
)

const (
	DefaultHTTPAddress            = ":11200"
	DefaultPublicBaseURL          = "http://localhost:11200"
	DefaultManagedTemplateBaseURL = DefaultPublicBaseURL
	DefaultMaxLongURLLength       = 2048
	DefaultMaxInputSize           = 2048
	DefaultMaxURLsPerField        = 20

	EnvHTTPAddress            = "CHAIN_SUBCONVERTER_HTTP_ADDRESS"
	EnvPublicBaseURL          = "CHAIN_SUBCONVERTER_PUBLIC_BASE_URL"
	EnvManagedTemplateBaseURL = "CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL"
	EnvMaxLongURLLength       = "CHAIN_SUBCONVERTER_MAX_LONG_URL_LENGTH"
	EnvMaxInputSize           = "CHAIN_SUBCONVERTER_MAX_INPUT_SIZE"
	EnvMaxURLsPerField        = "CHAIN_SUBCONVERTER_MAX_URLS_PER_FIELD"
)

type Server struct {
	HTTPAddress            string
	PublicBaseURL          string
	ManagedTemplateBaseURL string
	MaxLongURLLength       int
	MaxInputSize           int
	MaxURLsPerField        int
}

func DefaultServer() Server {
	return Server{
		HTTPAddress:            DefaultHTTPAddress,
		PublicBaseURL:          DefaultPublicBaseURL,
		ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
		MaxLongURLLength:       DefaultMaxLongURLLength,
		MaxInputSize:           DefaultMaxInputSize,
		MaxURLsPerField:        DefaultMaxURLsPerField,
	}
}

func LoadServerFromEnv() (Server, error) {
	cfg := DefaultServer()

	if value, ok := lookupTrimmedEnv(EnvHTTPAddress); ok {
		cfg.HTTPAddress = value
	}
	if value, ok := lookupTrimmedEnv(EnvPublicBaseURL); ok {
		cfg.PublicBaseURL = value
	}
	if value, ok := lookupTrimmedEnv(EnvManagedTemplateBaseURL); ok {
		cfg.ManagedTemplateBaseURL = value
	}
	if value, ok := lookupTrimmedEnv(EnvMaxLongURLLength); ok {
		maxLongURLLength, err := strconv.Atoi(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvMaxLongURLLength, err)
		}
		cfg.MaxLongURLLength = maxLongURLLength
	}
	if value, ok := lookupTrimmedEnv(EnvMaxInputSize); ok {
		maxInputSize, err := strconv.Atoi(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvMaxInputSize, err)
		}
		cfg.MaxInputSize = maxInputSize
	}
	if value, ok := lookupTrimmedEnv(EnvMaxURLsPerField); ok {
		maxURLsPerField, err := strconv.Atoi(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvMaxURLsPerField, err)
		}
		cfg.MaxURLsPerField = maxURLsPerField
	}

	if err := cfg.Validate(); err != nil {
		return Server{}, err
	}
	return cfg, nil
}

func (cfg Server) Validate() error {
	if strings.TrimSpace(cfg.HTTPAddress) == "" {
		return fmt.Errorf("HTTP address must not be empty")
	}
	if cfg.MaxLongURLLength <= 0 {
		return fmt.Errorf("max long URL length must be greater than zero")
	}
	if cfg.MaxInputSize <= 0 {
		return fmt.Errorf("max input size must be greater than zero")
	}
	if cfg.MaxURLsPerField <= 0 {
		return fmt.Errorf("max URLs per field must be greater than zero")
	}

	parsedURL, err := url.Parse(cfg.PublicBaseURL)
	if err != nil {
		return fmt.Errorf("parse public base URL: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return fmt.Errorf("public base URL must include scheme and host")
	}
	managedTemplateURL, err := url.Parse(cfg.ManagedTemplateBaseURL)
	if err != nil {
		return fmt.Errorf("parse managed template base URL: %w", err)
	}
	if managedTemplateURL.Scheme == "" || managedTemplateURL.Host == "" {
		return fmt.Errorf("managed template base URL must include scheme and host")
	}
	return nil
}
