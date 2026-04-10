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

	EnvHTTPAddress            = "CHAIN_SUBCONVERTER_HTTP_ADDRESS"
	EnvPublicBaseURL          = "CHAIN_SUBCONVERTER_PUBLIC_BASE_URL"
	EnvManagedTemplateBaseURL = "CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL"
	EnvMaxLongURLLength       = "CHAIN_SUBCONVERTER_MAX_LONG_URL_LENGTH"
)

type Server struct {
	HTTPAddress            string
	PublicBaseURL          string
	ManagedTemplateBaseURL string
	MaxLongURLLength       int
}

func DefaultServer() Server {
	return Server{
		HTTPAddress:            DefaultHTTPAddress,
		PublicBaseURL:          DefaultPublicBaseURL,
		ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
		MaxLongURLLength:       DefaultMaxLongURLLength,
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
