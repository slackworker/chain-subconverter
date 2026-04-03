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
			name: "invalid timeout",
			env: map[string]string{
				EnvSubconverterTimeout: "soon",
			},
			wantErr: "parse CHAIN_SUBCONVERTER_SUBCONVERTER_TIMEOUT",
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
