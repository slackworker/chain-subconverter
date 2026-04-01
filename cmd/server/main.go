package main

import (
	"fmt"
	"os"

	"github.com/slackworker/chain-subconverter/internal/config"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

func main() {
	cfg, err := config.LoadSubconverterFromEnv()
	if err != nil {
		fmt.Fprintf(os.Stderr, "load subconverter config: %v\n", err)
		os.Exit(1)
	}

	if _, err := subconverter.NewClient(cfg); err != nil {
		fmt.Fprintf(os.Stderr, "init subconverter client: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf("chain-subconverter server wiring placeholder; subconverter client ready for %s\n", cfg.BaseURL)
}
