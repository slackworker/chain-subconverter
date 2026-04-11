package main

import (
	"errors"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/slackworker/chain-subconverter/internal/api"
	"github.com/slackworker/chain-subconverter/internal/config"
	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

func main() {
	subconverterCfg, err := config.LoadSubconverterFromEnv()
	if err != nil {
		fmt.Fprintf(os.Stderr, "load subconverter config: %v\n", err)
		os.Exit(1)
	}

	serverCfg, err := config.LoadServerFromEnv()
	if err != nil {
		fmt.Fprintf(os.Stderr, "load server config: %v\n", err)
		os.Exit(1)
	}

	client, err := subconverter.NewClient(subconverterCfg)
	if err != nil {
		fmt.Fprintf(os.Stderr, "init subconverter client: %v\n", err)
		os.Exit(1)
	}

	templateStore := service.NewInMemoryTemplateContentStore()

	managedSource, err := service.NewManagedConversionSource(client, templateStore, serverCfg.ManagedTemplateBaseURL, subconverterCfg.Timeout)
	if err != nil {
		fmt.Fprintf(os.Stderr, "init managed conversion source: %v\n", err)
		os.Exit(1)
	}

	handler, err := api.NewHandler(managedSource, templateStore, serverCfg.PublicBaseURL, serverCfg.ManagedTemplateBaseURL, serverCfg.MaxLongURLLength, service.InputLimits{
		MaxInputSize:    serverCfg.MaxInputSize,
		MaxURLsPerField: serverCfg.MaxURLsPerField,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "init HTTP handler: %v\n", err)
		os.Exit(1)
	}

	server := &http.Server{
		Addr:              serverCfg.HTTPAddress,
		Handler:           handler,
		ReadHeaderTimeout: 5 * time.Second,
	}

	fmt.Printf(
		"chain-subconverter listening on %s (public base URL: %s, subconverter: %s)\n",
		serverCfg.HTTPAddress,
		serverCfg.PublicBaseURL,
		subconverterCfg.BaseURL,
	)

	if err := server.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintf(os.Stderr, "run HTTP server: %v\n", err)
		os.Exit(1)
	}
}
