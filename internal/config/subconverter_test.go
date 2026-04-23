package config

import (
	"testing"
	"time"
)

func TestLoadSubconverterFromEnv(t *testing.T) {
	tests := []struct {
		name    string
		env     map[string]string
		want    Subconverter
		wantErr string
	}{
		{
			name: "defaults when env is blank",
			env: map[string]string{
				EnvSubconverterBaseURL:     " ",
				EnvSubconverterTimeout:     "",
				EnvSubconverterMaxInFlight: "\n",
			},
			want: DefaultSubconverter(),
		},
		{
			name: "trimmed overrides",
			env: map[string]string{
				EnvSubconverterBaseURL:     "  http://localhost:25500/sub?target=clash  ",
				EnvSubconverterTimeout:     " 20s ",
				EnvSubconverterMaxInFlight: " 32 ",
			},
			want: Subconverter{
				BaseURL:     "http://localhost:25500/sub?target=clash",
				Timeout:     20 * time.Second,
				MaxInFlight: 32,
			},
		},
		{
			name: "normalizes missing scheme and path",
			env: map[string]string{
				EnvSubconverterBaseURL: "  localhost:25500  ",
			},
			want: Subconverter{
				BaseURL:     "http://localhost:25500/sub",
				Timeout:     DefaultSubconverterTimeout,
				MaxInFlight: DefaultSubconverterMaxInFlight,
			},
		},
		{
			name: "normalizes custom prefix path",
			env: map[string]string{
				EnvSubconverterBaseURL: "https://sub.example.internal/proxy",
			},
			want: Subconverter{
				BaseURL:     "https://sub.example.internal/proxy/sub",
				Timeout:     DefaultSubconverterTimeout,
				MaxInFlight: DefaultSubconverterMaxInFlight,
			},
		},
		{
			name: "invalid timeout",
			env: map[string]string{
				EnvSubconverterTimeout: "soon",
			},
			wantErr: "parse CHAIN_SUBCONVERTER_SUBCONVERTER_TIMEOUT",
		},
		{
			name: "invalid scheme",
			env: map[string]string{
				EnvSubconverterBaseURL: "ftp://localhost:25500/sub",
			},
			wantErr: "normalize CHAIN_SUBCONVERTER_SUBCONVERTER_BASE_URL: subconverter base URL must use http or https",
		},
		{
			name: "invalid max in flight",
			env: map[string]string{
				EnvSubconverterMaxInFlight: "many",
			},
			wantErr: "parse CHAIN_SUBCONVERTER_SUBCONVERTER_MAX_IN_FLIGHT",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			setSubconverterEnv(t, tt.env)

			got, err := LoadSubconverterFromEnv()
			if tt.wantErr != "" {
				if err == nil {
					t.Fatalf("LoadSubconverterFromEnv() error = nil, want substring %q", tt.wantErr)
				}
				if got != (Subconverter{}) {
					t.Fatalf("LoadSubconverterFromEnv() cfg = %#v, want zero value on error", got)
				}
				if !contains(err.Error(), tt.wantErr) {
					t.Fatalf("LoadSubconverterFromEnv() error = %v, want substring %q", err, tt.wantErr)
				}
				return
			}

			if err != nil {
				t.Fatalf("LoadSubconverterFromEnv() error = %v", err)
			}
			if got != tt.want {
				t.Fatalf("LoadSubconverterFromEnv() = %#v, want %#v", got, tt.want)
			}
		})
	}
}

func TestSubconverterValidate(t *testing.T) {
	tests := []struct {
		name    string
		cfg     Subconverter
		wantErr string
	}{
		{
			name: "valid default config",
			cfg:  DefaultSubconverter(),
		},
		{
			name: "empty base url",
			cfg: Subconverter{
				BaseURL:     " ",
				Timeout:     DefaultSubconverterTimeout,
				MaxInFlight: DefaultSubconverterMaxInFlight,
			},
			wantErr: "subconverter base URL must not be empty",
		},
		{
			name: "non-positive timeout",
			cfg: Subconverter{
				BaseURL:     DefaultSubconverterBaseURL,
				Timeout:     0,
				MaxInFlight: DefaultSubconverterMaxInFlight,
			},
			wantErr: "subconverter timeout must be greater than zero",
		},
		{
			name: "non-positive max in flight",
			cfg: Subconverter{
				BaseURL:     DefaultSubconverterBaseURL,
				Timeout:     DefaultSubconverterTimeout,
				MaxInFlight: -1,
			},
			wantErr: "subconverter maxInFlight must be greater than zero",
		},
		{
			name: "missing host after normalization",
			cfg: Subconverter{
				BaseURL:     "http:///sub",
				Timeout:     DefaultSubconverterTimeout,
				MaxInFlight: DefaultSubconverterMaxInFlight,
			},
			wantErr: "subconverter base URL must include host",
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

func setSubconverterEnv(t *testing.T, values map[string]string) {
	t.Helper()

	t.Setenv(EnvSubconverterBaseURL, "")
	t.Setenv(EnvSubconverterTimeout, "")
	t.Setenv(EnvSubconverterMaxInFlight, "")

	for key, value := range values {
		t.Setenv(key, value)
	}
}
