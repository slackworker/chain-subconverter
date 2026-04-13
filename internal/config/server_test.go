package config

import (
	"strings"
	"testing"
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
				EnvHTTPAddress:            "  :11300  ",
				EnvPublicBaseURL:          "  https://example.com/base  ",
				EnvManagedTemplateBaseURL: "  https://internal.example.com/base  ",
				EnvFrontendDistDir:        "  web/app-dist  ",
				EnvMaxLongURLLength:       " 4096 ",
				EnvShortLinkDBPath:        "  tmp/short-links.sqlite3  ",
				EnvShortLinkCapacity:      " 2048 ",
			},
			want: Server{
				HTTPAddress:            ":11300",
				PublicBaseURL:          "https://example.com/base",
				ManagedTemplateBaseURL: "https://internal.example.com/base",
				FrontendDistDir:        "web/app-dist",
				MaxLongURLLength:       4096,
				MaxInputSize:           DefaultMaxInputSize,
				MaxURLsPerField:        DefaultMaxURLsPerField,
				ShortLinkDBPath:        "tmp/short-links.sqlite3",
				ShortLinkCapacity:      2048,
			},
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
			name: "invalid managed template base url",
			env: map[string]string{
				EnvManagedTemplateBaseURL: "localhost:11200",
			},
			wantErr: "managed template base URL must include scheme and host",
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
			},
			wantErr: "frontend dist dir must not be empty",
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
			},
			wantErr: "public base URL must include scheme and host",
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
			},
			wantErr: "managed template base URL must include scheme and host",
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

	for key, value := range values {
		t.Setenv(key, value)
	}
}

func contains(s string, want string) bool {
	return want == "" || strings.Contains(s, want)
}
