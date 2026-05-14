package config

import (
	"strings"
	"testing"
	"time"
)

func TestLoadServerFromEnv(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		want    Server
		wantErr string
	}{
		{
			name: "defaults when env is blank",
			env: map[string]string{
				EnvHTTPAddress:            "   ",
				EnvPublicBaseURL:          "",
				EnvManagedTemplateBaseURL: "",
				EnvFrontendDistDir:        "  ",
				EnvMaxLongURLLength:       "\t",
				EnvShortLinkDBPath:        "  ",
			},
			want: DefaultServer(),
		},
		{
			name: "trimmed overrides",
			env: map[string]string{
				EnvHTTPAddress:                  "  :11300  ",
				EnvPublicBaseURL:                "  https://example.com/base  ",
				EnvManagedTemplateBaseURL:       "  https://internal.example.com/base  ",
				EnvFrontendDistDir:              "  web/app-dist  ",
				EnvWriteRequestsPerMinute:       " 120 ",
				EnvMaxLongURLLength:             " 4096 ",
				EnvShortLinkDBPath:              "  tmp/short-links.sqlite3  ",
				EnvShortLinkCapacity:            " 2048 ",
				EnvDefaultTemplateURL:           "  https://templates.example.com/default.ini  ",
				EnvDefaultTemplateFetchCacheTTL: " 30m ",
				EnvTemplateFetchCacheTTL:        " 5m ",
				EnvTemplateAllowPrivateNetworks: " true ",
				EnvRequirePublicBaseURL:         " true ",
			},
			want: Server{
				HTTPAddress:                  ":11300",
				PublicBaseURL:                "https://example.com/base",
				ManagedTemplateBaseURL:       "https://internal.example.com/base",
				FrontendDistDir:              "web/app-dist",
				WriteRequestsPerMinute:       120,
				MaxLongURLLength:             4096,
				MaxInputSize:                 DefaultMaxInputSize,
				MaxURLsPerField:              DefaultMaxURLsPerField,
				ShortLinkDBPath:              "tmp/short-links.sqlite3",
				ShortLinkCapacity:            2048,
				DefaultTemplateURL:           "https://templates.example.com/default.ini",
				DefaultTemplateFetchCacheTTL: 30 * time.Minute,
				TemplateFetchCacheTTL:        5 * time.Minute,
				TemplateAllowPrivateNetworks: true,
				RequirePublicBaseURL:         true,
			},
		},
		{
			name: "invalid write requests per minute",
			env: map[string]string{
				EnvWriteRequestsPerMinute: "bad",
			},
			wantErr: "parse CHAIN_SUBCONVERTER_WRITE_REQUESTS_PER_MINUTE",
		},
		{
			name: "invalid max long url length",
			env: map[string]string{
				EnvMaxLongURLLength: "bad",
			},
			wantErr: "parse CHAIN_SUBCONVERTER_MAX_LONG_URL_LENGTH",
		},
		{
			name: "invalid public base url",
			env: map[string]string{
				EnvPublicBaseURL: "localhost:11200",
			},
			wantErr: "public base URL must include scheme and host",
		},
		{
			name: "invalid short link capacity",
			env: map[string]string{
				EnvShortLinkCapacity: "bad",
			},
			wantErr: "parse CHAIN_SUBCONVERTER_SHORT_LINK_CAPACITY",
		},
		{
			name: "invalid default template fetch cache ttl",
			env: map[string]string{
				EnvDefaultTemplateFetchCacheTTL: "bad",
			},
			wantErr: "parse CHAIN_SUBCONVERTER_DEFAULT_TEMPLATE_FETCH_CACHE_TTL",
		},
		{
			name: "invalid template fetch cache ttl",
			env: map[string]string{
				EnvTemplateFetchCacheTTL: "bad",
			},
			wantErr: "parse CHAIN_SUBCONVERTER_TEMPLATE_FETCH_CACHE_TTL",
		},
		{
			name: "invalid template allow private networks",
			env: map[string]string{
				EnvTemplateAllowPrivateNetworks: "bad",
			},
			wantErr: "parse CHAIN_SUBCONVERTER_TEMPLATE_ALLOW_PRIVATE_NETWORKS",
		},
		{
			name: "invalid require public base url",
			env: map[string]string{
				EnvRequirePublicBaseURL: "bad",
			},
			wantErr: "parse CHAIN_SUBCONVERTER_REQUIRE_PUBLIC_BASE_URL",
		},
		{
			name: "require public base url without explicit value",
			env: map[string]string{
				EnvRequirePublicBaseURL: "true",
			},
			wantErr: "public base URL is required when CHAIN_SUBCONVERTER_REQUIRE_PUBLIC_BASE_URL=true",
		},
		{
			name: "invalid managed template base url",
			env: map[string]string{
				EnvManagedTemplateBaseURL: "localhost:11200",
			},
			wantErr: "managed template base URL must include scheme and host",
		},
		{
			name: "invalid default template url",
			env: map[string]string{
				EnvDefaultTemplateURL: "localhost/default.ini",
			},
			wantErr: "default template URL must be HTTP(S)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setServerEnv(t, tt.env)

			got, err := LoadServerFromEnv()
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("LoadServerFromEnv() error = nil, want substring %q", tt.wantErr)
				}
				if got != (Server{}) {
					t.Fatalf("LoadServerFromEnv() cfg = %#v, want zero value on error", got)
				}
				if err.Error() == "" || !contains(err.Error(), tt.wantErr) {
					t.Fatalf("LoadServerFromEnv() error = %v, want substring %q", err, tt.wantErr)
				}
				return
			}

			if err != nil {
				t.Fatalf("LoadServerFromEnv() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("LoadServerFromEnv() = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestServerValidate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Server
		wantErr string
	}{
		{
			name: "valid default config",
			cfg:  DefaultServer(),
		},
		{
			name: "empty http address",
			cfg: Server{
				HTTPAddress:            " ",
				PublicBaseURL:          DefaultPublicBaseURL,
				ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
				FrontendDistDir:        DefaultFrontendDistDir,
				MaxLongURLLength:       DefaultMaxLongURLLength,
				MaxInputSize:           DefaultMaxInputSize,
				MaxURLsPerField:        DefaultMaxURLsPerField,
				ShortLinkDBPath:        DefaultShortLinkDBPath,
				ShortLinkCapacity:      DefaultShortLinkCapacity,
				DefaultTemplateURL:     DefaultDefaultTemplateURL,
			},
			wantErr: "HTTP address must not be empty",
		},
		{
			name: "empty frontend dist dir",
			cfg: Server{
				HTTPAddress:            DefaultHTTPAddress,
				PublicBaseURL:          DefaultPublicBaseURL,
				ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
				FrontendDistDir:        " ",
				MaxLongURLLength:       DefaultMaxLongURLLength,
				MaxInputSize:           DefaultMaxInputSize,
				MaxURLsPerField:        DefaultMaxURLsPerField,
				ShortLinkDBPath:        DefaultShortLinkDBPath,
				ShortLinkCapacity:      DefaultShortLinkCapacity,
				DefaultTemplateURL:     DefaultDefaultTemplateURL,
			},
			wantErr: "frontend dist dir must not be empty",
		},
		{
			name: "negative write requests per minute",
			cfg: Server{
				HTTPAddress:            DefaultHTTPAddress,
				PublicBaseURL:          DefaultPublicBaseURL,
				ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
				FrontendDistDir:        DefaultFrontendDistDir,
				WriteRequestsPerMinute: -1,
				MaxLongURLLength:       DefaultMaxLongURLLength,
				MaxInputSize:           DefaultMaxInputSize,
				MaxURLsPerField:        DefaultMaxURLsPerField,
				ShortLinkDBPath:        DefaultShortLinkDBPath,
				ShortLinkCapacity:      DefaultShortLinkCapacity,
				DefaultTemplateURL:     DefaultDefaultTemplateURL,
			},
			wantErr: "write requests per minute must not be negative",
		},
		{
			name: "non-positive max long url length",
			cfg: Server{
				HTTPAddress:            DefaultHTTPAddress,
				PublicBaseURL:          DefaultPublicBaseURL,
				ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
				FrontendDistDir:        DefaultFrontendDistDir,
				MaxLongURLLength:       0,
				MaxInputSize:           DefaultMaxInputSize,
				MaxURLsPerField:        DefaultMaxURLsPerField,
				ShortLinkDBPath:        DefaultShortLinkDBPath,
				ShortLinkCapacity:      DefaultShortLinkCapacity,
				DefaultTemplateURL:     DefaultDefaultTemplateURL,
			},
			wantErr: "max long URL length must be greater than zero",
		},
		{
			name: "empty short link db path",
			cfg: Server{
				HTTPAddress:            DefaultHTTPAddress,
				PublicBaseURL:          DefaultPublicBaseURL,
				ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
				FrontendDistDir:        DefaultFrontendDistDir,
				MaxLongURLLength:       DefaultMaxLongURLLength,
				MaxInputSize:           DefaultMaxInputSize,
				MaxURLsPerField:        DefaultMaxURLsPerField,
				ShortLinkDBPath:        " ",
				ShortLinkCapacity:      DefaultShortLinkCapacity,
				DefaultTemplateURL:     DefaultDefaultTemplateURL,
			},
			wantErr: "short link DB path must not be empty",
		},
		{
			name: "non-positive short link capacity",
			cfg: Server{
				HTTPAddress:            DefaultHTTPAddress,
				PublicBaseURL:          DefaultPublicBaseURL,
				ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
				FrontendDistDir:        DefaultFrontendDistDir,
				MaxLongURLLength:       DefaultMaxLongURLLength,
				MaxInputSize:           DefaultMaxInputSize,
				MaxURLsPerField:        DefaultMaxURLsPerField,
				ShortLinkDBPath:        DefaultShortLinkDBPath,
				ShortLinkCapacity:      0,
				DefaultTemplateURL:     DefaultDefaultTemplateURL,
			},
			wantErr: "short link capacity must be greater than zero",
		},
		{
			name: "missing public base scheme",
			cfg: Server{
				HTTPAddress:            DefaultHTTPAddress,
				PublicBaseURL:          "localhost:11200",
				ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
				FrontendDistDir:        DefaultFrontendDistDir,
				MaxLongURLLength:       DefaultMaxLongURLLength,
				MaxInputSize:           DefaultMaxInputSize,
				MaxURLsPerField:        DefaultMaxURLsPerField,
				ShortLinkDBPath:        DefaultShortLinkDBPath,
				ShortLinkCapacity:      DefaultShortLinkCapacity,
				DefaultTemplateURL:     DefaultDefaultTemplateURL,
			},
			wantErr: "public base URL must include scheme and host",
		},
		{
			name: "require public base url when empty",
			cfg: Server{
				HTTPAddress:            DefaultHTTPAddress,
				ManagedTemplateBaseURL: DefaultManagedTemplateBaseURL,
				FrontendDistDir:        DefaultFrontendDistDir,
				MaxLongURLLength:       DefaultMaxLongURLLength,
				MaxInputSize:           DefaultMaxInputSize,
				MaxURLsPerField:        DefaultMaxURLsPerField,
				ShortLinkDBPath:        DefaultShortLinkDBPath,
				ShortLinkCapacity:      DefaultShortLinkCapacity,
				DefaultTemplateURL:     DefaultDefaultTemplateURL,
				RequirePublicBaseURL:   true,
			},
			wantErr: "public base URL is required when CHAIN_SUBCONVERTER_REQUIRE_PUBLIC_BASE_URL=true",
		},
		{
			name: "missing managed template base scheme",
			cfg: Server{
				HTTPAddress:            DefaultHTTPAddress,
				PublicBaseURL:          DefaultPublicBaseURL,
				ManagedTemplateBaseURL: "localhost:11200",
				FrontendDistDir:        DefaultFrontendDistDir,
				MaxLongURLLength:       DefaultMaxLongURLLength,
				MaxInputSize:           DefaultMaxInputSize,
				MaxURLsPerField:        DefaultMaxURLsPerField,
				ShortLinkDBPath:        DefaultShortLinkDBPath,
				ShortLinkCapacity:      DefaultShortLinkCapacity,
				DefaultTemplateURL:     DefaultDefaultTemplateURL,
			},
			wantErr: "managed template base URL must include scheme and host",
		},
		{
			name: "negative default template fetch cache ttl",
			cfg: Server{
				HTTPAddress:                  DefaultHTTPAddress,
				PublicBaseURL:                DefaultPublicBaseURL,
				ManagedTemplateBaseURL:       DefaultManagedTemplateBaseURL,
				FrontendDistDir:              DefaultFrontendDistDir,
				MaxLongURLLength:             DefaultMaxLongURLLength,
				MaxInputSize:                 DefaultMaxInputSize,
				MaxURLsPerField:              DefaultMaxURLsPerField,
				ShortLinkDBPath:              DefaultShortLinkDBPath,
				ShortLinkCapacity:            DefaultShortLinkCapacity,
				DefaultTemplateURL:           DefaultDefaultTemplateURL,
				DefaultTemplateFetchCacheTTL: -1 * time.Second,
			},
			wantErr: "default template fetch cache TTL must not be negative",
		},
		{
			name: "negative template fetch cache ttl",
			cfg: Server{
				HTTPAddress:                  DefaultHTTPAddress,
				PublicBaseURL:                DefaultPublicBaseURL,
				ManagedTemplateBaseURL:       DefaultManagedTemplateBaseURL,
				FrontendDistDir:              DefaultFrontendDistDir,
				MaxLongURLLength:             DefaultMaxLongURLLength,
				MaxInputSize:                 DefaultMaxInputSize,
				MaxURLsPerField:              DefaultMaxURLsPerField,
				ShortLinkDBPath:              DefaultShortLinkDBPath,
				ShortLinkCapacity:            DefaultShortLinkCapacity,
				DefaultTemplateURL:           DefaultDefaultTemplateURL,
				DefaultTemplateFetchCacheTTL: DefaultDefaultTemplateFetchCacheTTL,
				TemplateFetchCacheTTL:        -1 * time.Second,
			},
			wantErr: "template fetch cache TTL must not be negative",
		},
		{
			name: "empty default template url",
			cfg: Server{
				HTTPAddress:                  DefaultHTTPAddress,
				PublicBaseURL:                DefaultPublicBaseURL,
				ManagedTemplateBaseURL:       DefaultManagedTemplateBaseURL,
				FrontendDistDir:              DefaultFrontendDistDir,
				MaxLongURLLength:             DefaultMaxLongURLLength,
				MaxInputSize:                 DefaultMaxInputSize,
				MaxURLsPerField:              DefaultMaxURLsPerField,
				ShortLinkDBPath:              DefaultShortLinkDBPath,
				ShortLinkCapacity:            DefaultShortLinkCapacity,
				DefaultTemplateURL:           " ",
				DefaultTemplateFetchCacheTTL: DefaultDefaultTemplateFetchCacheTTL,
			},
			wantErr: "default template URL must be HTTP(S)",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			err := tt.cfg.Validate()
			if tt.wantErr == "" {
				if err != nil {
					t.Fatalf("Validate() error = %v", err)
				}
				return
			}

			if err == nil {
				t.Fatalf("Validate() error = nil, want substring %q", tt.wantErr)
			}
			if !contains(err.Error(), tt.wantErr) {
				t.Fatalf("Validate() error = %v, want substring %q", err, tt.wantErr)
			}
		})
	}
}

func setServerEnv(t *testing.T, values map[string]string) {
	t.Helper()

	t.Setenv(EnvHTTPAddress, "")
	t.Setenv(EnvPublicBaseURL, "")
	t.Setenv(EnvManagedTemplateBaseURL, "")
	t.Setenv(EnvFrontendDistDir, "")
	t.Setenv(EnvMaxLongURLLength, "")
	t.Setenv(EnvMaxInputSize, "")
	t.Setenv(EnvMaxURLsPerField, "")
	t.Setenv(EnvShortLinkDBPath, "")
	t.Setenv(EnvShortLinkCapacity, "")
	t.Setenv(EnvDefaultTemplateURL, "")
	t.Setenv(EnvDefaultTemplateFetchCacheTTL, "")
	t.Setenv(EnvTemplateFetchCacheTTL, "")
	t.Setenv(EnvTemplateAllowPrivateNetworks, "")
	t.Setenv(EnvRequirePublicBaseURL, "")

	for key, value := range values {
		t.Setenv(key, value)
	}
}

func contains(s string, want string) bool {
	return want == "" || strings.Contains(s, want)
}
