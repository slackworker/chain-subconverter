package config

import (
	"fmt"
	"net/netip"
	"net/url"
	"strconv"
	"strings"
	"time"
)

const (
	DefaultHTTPAddress                  = ":11200"
	DefaultPublicBaseURL                = "http://localhost:11200"
	DefaultManagedTemplateBaseURL       = DefaultPublicBaseURL
	DefaultFrontendDistDir              = "web/dist"
	DefaultWriteRequestsPerMinute       = 60
	DefaultMaxLongURLLength             = 8192
	DefaultMaxUpstreamRequestURLLength  = 16384
	DefaultMaxURLsPerField              = 32
	DefaultShortLinkDBPath              = "data/short-links.sqlite3"
	DefaultShortLinkCapacity            = 1000
	DefaultDefaultTemplateURL           = "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini"
	DefaultDefaultTemplateFetchCacheTTL = 5 * time.Minute
	DefaultTemplateFetchCacheTTL        = 0 * time.Second
	DefaultTemplateAllowPrivateNetworks = false
	DefaultRequirePublicBaseURL         = false
	DefaultTrustedProxyCIDRs            = ""

	EnvHTTPAddress                  = "CHAIN_SUBCONVERTER_HTTP_ADDRESS"
	EnvPublicBaseURL                = "CHAIN_SUBCONVERTER_PUBLIC_BASE_URL"
	EnvManagedTemplateBaseURL       = "CHAIN_SUBCONVERTER_MANAGED_TEMPLATE_BASE_URL"
	EnvFrontendDistDir              = "CHAIN_SUBCONVERTER_FRONTEND_DIST_DIR"
	EnvWriteRequestsPerMinute       = "CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE"
	EnvMaxLongURLLength             = "CHAIN_SUBCONVERTER_MAX_LONG_URL_LENGTH"
	EnvMaxUpstreamRequestURLLength  = "CHAIN_SUBCONVERTER_MAX_UPSTREAM_REQUEST_URL_LENGTH"
	EnvMaxURLsPerField              = "CHAIN_SUBCONVERTER_MAX_URLS_PER_FIELD"
	EnvShortLinkDBPath              = "CHAIN_SUBCONVERTER_SHORT_LINK_DB_PATH"
	EnvShortLinkCapacity            = "CHAIN_SUBCONVERTER_SHORT_LINK_CAPACITY"
	EnvDefaultTemplateURL           = "CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_URL"
	EnvDefaultTemplateFetchCacheTTL = "CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_FETCH_CACHE_TTL"
	EnvTemplateFetchCacheTTL        = "CHAIN_SUBCONVERTER_TEMPLATE_FETCH_CACHE_TTL"
	EnvTemplateAllowPrivateNetworks = "CHAIN_SUBCONVERTER_TEMPLATE_ALLOW_PRIVATE_NETWORKS"
	EnvRequirePublicBaseURL         = "CHAIN_SUBCONVERTER_REQUIRE_PUBLIC_BASE_URL"
	EnvTrustedProxyCIDRs            = "CHAIN_SUBCONVERTER_TRUSTED_PROXY_CIDRS"
)

type Server struct {
	HTTPAddress                  string
	PublicBaseURL                string
	ManagedTemplateBaseURL       string
	FrontendDistDir              string
	WriteRequestsPerMinute       int
	MaxLongURLLength             int
	MaxUpstreamRequestURLLength  int
	MaxURLsPerField              int
	ShortLinkDBPath              string
	ShortLinkCapacity            int
	DefaultTemplateURL           string
	DefaultTemplateFetchCacheTTL time.Duration
	TemplateFetchCacheTTL        time.Duration
	TemplateAllowPrivateNetworks bool
	RequirePublicBaseURL         bool
	TrustedProxyCIDRs            string
}

func DefaultServer() Server {
	return Server{
		HTTPAddress:                  DefaultHTTPAddress,
		PublicBaseURL:                "",
		ManagedTemplateBaseURL:       DefaultManagedTemplateBaseURL,
		FrontendDistDir:              DefaultFrontendDistDir,
		WriteRequestsPerMinute:       DefaultWriteRequestsPerMinute,
		MaxLongURLLength:             DefaultMaxLongURLLength,
		MaxUpstreamRequestURLLength:  DefaultMaxUpstreamRequestURLLength,
		MaxURLsPerField:              DefaultMaxURLsPerField,
		ShortLinkDBPath:              DefaultShortLinkDBPath,
		ShortLinkCapacity:            DefaultShortLinkCapacity,
		DefaultTemplateURL:           DefaultDefaultTemplateURL,
		DefaultTemplateFetchCacheTTL: DefaultDefaultTemplateFetchCacheTTL,
		TemplateFetchCacheTTL:        DefaultTemplateFetchCacheTTL,
		TemplateAllowPrivateNetworks: DefaultTemplateAllowPrivateNetworks,
		RequirePublicBaseURL:         DefaultRequirePublicBaseURL,
		TrustedProxyCIDRs:            DefaultTrustedProxyCIDRs,
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
	if value, ok := lookupTrimmedEnv(EnvWriteRequestsPerMinute); ok {
		writeRequestsPerMinute, err := strconv.Atoi(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvWriteRequestsPerMinute, err)
		}
		cfg.WriteRequestsPerMinute = writeRequestsPerMinute
	}
	if value, ok := lookupTrimmedEnv(EnvMaxLongURLLength); ok {
		maxLongURLLength, err := strconv.Atoi(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvMaxLongURLLength, err)
		}
		cfg.MaxLongURLLength = maxLongURLLength
	}
	if value, ok := lookupTrimmedEnv(EnvMaxUpstreamRequestURLLength); ok {
		maxUpstreamRequestURLLength, err := strconv.Atoi(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvMaxUpstreamRequestURLLength, err)
		}
		cfg.MaxUpstreamRequestURLLength = maxUpstreamRequestURLLength
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
	if value, ok := lookupTrimmedEnv(EnvDefaultTemplateURL); ok {
		cfg.DefaultTemplateURL = value
	}
	if value, ok := lookupTrimmedEnv(EnvDefaultTemplateFetchCacheTTL); ok {
		defaultTemplateFetchCacheTTL, err := time.ParseDuration(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvDefaultTemplateFetchCacheTTL, err)
		}
		cfg.DefaultTemplateFetchCacheTTL = defaultTemplateFetchCacheTTL
	}
	if value, ok := lookupTrimmedEnv(EnvTemplateFetchCacheTTL); ok {
		templateFetchCacheTTL, err := time.ParseDuration(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvTemplateFetchCacheTTL, err)
		}
		cfg.TemplateFetchCacheTTL = templateFetchCacheTTL
	}
	if value, ok := lookupTrimmedEnv(EnvTemplateAllowPrivateNetworks); ok {
		templateAllowPrivateNetworks, err := strconv.ParseBool(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvTemplateAllowPrivateNetworks, err)
		}
		cfg.TemplateAllowPrivateNetworks = templateAllowPrivateNetworks
	}
	if value, ok := lookupTrimmedEnv(EnvRequirePublicBaseURL); ok {
		requirePublicBaseURL, err := strconv.ParseBool(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvRequirePublicBaseURL, err)
		}
		cfg.RequirePublicBaseURL = requirePublicBaseURL
	}
	if value, ok := lookupTrimmedEnv(EnvTrustedProxyCIDRs); ok {
		normalized, err := normalizeTrustedProxyCIDRs(value)
		if err != nil {
			return Server{}, fmt.Errorf("parse %s: %w", EnvTrustedProxyCIDRs, err)
		}
		cfg.TrustedProxyCIDRs = normalized
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
	if cfg.WriteRequestsPerMinute < 0 {
		return fmt.Errorf("write requests per minute must not be negative")
	}
	if cfg.MaxLongURLLength <= 0 {
		return fmt.Errorf("max long URL length must be greater than zero")
	}
	if cfg.MaxUpstreamRequestURLLength <= 0 {
		return fmt.Errorf("max upstream request URL length must be greater than zero")
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
	if cfg.DefaultTemplateFetchCacheTTL < 0 {
		return fmt.Errorf("default template fetch cache TTL must not be negative")
	}
	if cfg.TemplateFetchCacheTTL < 0 {
		return fmt.Errorf("template fetch cache TTL must not be negative")
	}

	defaultTemplateURL, err := url.Parse(strings.TrimSpace(cfg.DefaultTemplateURL))
	if err != nil {
		return fmt.Errorf("parse default template URL: %w", err)
	}
	if defaultTemplateURL.Scheme != "http" && defaultTemplateURL.Scheme != "https" {
		return fmt.Errorf("default template URL must be HTTP(S)")
	}
	if defaultTemplateURL.Host == "" {
		return fmt.Errorf("default template URL must include host")
	}

	if strings.TrimSpace(cfg.PublicBaseURL) != "" {
		parsedURL, err := url.Parse(cfg.PublicBaseURL)
		if err != nil {
			return fmt.Errorf("parse public base URL: %w", err)
		}
		if parsedURL.Scheme == "" || parsedURL.Host == "" {
			return fmt.Errorf("public base URL must include scheme and host")
		}
	} else if cfg.RequirePublicBaseURL {
		return fmt.Errorf("public base URL is required when %s=true", EnvRequirePublicBaseURL)
	}
	if _, err := normalizeTrustedProxyCIDRs(cfg.TrustedProxyCIDRs); err != nil {
		return fmt.Errorf("parse trusted proxy CIDRs: %w", err)
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

func normalizeTrustedProxyCIDRs(value string) (string, error) {
	parts := strings.Split(value, ",")
	normalized := make([]string, 0, len(parts))

	for _, part := range parts {
		trimmed := strings.TrimSpace(part)
		if trimmed == "" {
			continue
		}

		if prefix, err := netip.ParsePrefix(trimmed); err == nil {
			normalized = append(normalized, prefix.String())
			continue
		}

		addr, err := netip.ParseAddr(trimmed)
		if err != nil {
			return "", fmt.Errorf("invalid proxy entry %q", trimmed)
		}
		normalized = append(normalized, addr.String())
	}

	return strings.Join(normalized, ","), nil
}
