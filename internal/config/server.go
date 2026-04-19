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
	DefaultFrontendDistDir        = "web/dist"
	DefaultMaxLongURLLength       = 8192
	DefaultMaxInputSize           = 2048
	DefaultMaxURLsPerField        = 20
	DefaultShortLinkDBPath        = "data/short-links.sqlite3"
	DefaultShortLinkCapacity      = 1000

	EnvHTTPAddress            = "CHAIN_SUBCONVERTER_HTTP_ADDRESS"
	EnvPublicBaseURL          = "CHAIN_SUBCONVERTER_PUBLIC_BASE_URL"
	EnvManagedTemplateBaseURL = "CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL"
	EnvFrontendDistDir        = "CHAIN_SUBCONVERTER_FRONTEND_DIST_DIR"
	EnvMaxLongURLLength       = "CHAIN_SUBCONVERTER_MAX_LONG_URL_LENGTH"
	EnvMaxInputSize           = "CHAIN_SUBCONVERTER_MAX_INPUT_SIZE"
	EnvMaxURLsPerField        = "CHAIN_SUBCONVERTER_MAX_URLS_PER_FIELD"
	EnvShortLinkDBPath        = "CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH"
	EnvShortLinkCapacity      = "CHAIN_SUBCONVERTER_SHORT_LINK_CAPACITY"
)

type Server struct {
	HTTPAddress            string
	PublicBaseURL          string
	ManagedTemplateBaseURL string
	FrontendDistDir        string
	MaxLongURLLength       int
	MaxInputSize           int
	MaxURLsPerField        int
	ShortLinkDBPath        string
	ShortLinkCapacity      int
}

func DefaultServer() Server {
	return Server{
		HTTPAddress:            DefaultHTTPAddress,
		PublicBaseURL:          DefaultPublicBaseURL,
		ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
		FrontendDistDir:        DefaultFrontendDistDir,
		MaxLongURLLength:       DefaultMaxLongURLLength,
		MaxInputSize:           DefaultMaxInputSize,
		MaxURLsPerField:        DefaultMaxURLsPerField,
		ShortLinkDBPath:        DefaultShortLinkDBPath,
		ShortLinkCapacity:      DefaultShortLinkCapacity,
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
	if value, ok := lookupTrimmedEnv(EnvFrontendDistDir); ok {
		cfg.FrontendDistDir = value
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
	if value, ok := lookupTrimmedEnv(EnvShortLinkDBPath); ok {
		cfg.ShortLinkDBPath = value
	}
	if value, ok := lookupTrimmedEnv(EnvShortLinkCapacity); ok {
		shortLinkCapacity, err := strconv.Atoi(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvShortLinkCapacity, err)
		}
		cfg.ShortLinkCapacity = shortLinkCapacity
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
	if strings.TrimSpace(cfg.FrontendDistDir) == "" {
		return fmt.Errorf("frontend dist dir must not be empty")
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
	if strings.TrimSpace(cfg.ShortLinkDBPath) == "" {
		return fmt.Errorf("short link DB path must not be empty")
	}
	if cfg.ShortLinkCapacity <= 0 {
		return fmt.Errorf("short link capacity must be greater than zero")
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
