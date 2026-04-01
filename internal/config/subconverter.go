package config

import (
	"fmt"
	"os"
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
		cfg.BaseURL = value
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
	if cfg.Timeout <= 0 {
		return fmt.Errorf("subconverter timeout must be greater than zero")
	}
	if cfg.MaxInFlight <= 0 {
		return fmt.Errorf("subconverter maxInFlight must be greater than zero")
	}
	return nil
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
