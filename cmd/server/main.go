package main

import (
	"errors"
	"fmt"
	"net"
	"net/http"
	"os"
	"time"

	"github.com/slackworker/chain-subconverter/internal/api"
	"github.com/slackworker/chain-subconverter/internal/config"
	"github.com/slackworker/chain-subconverter/internal/service"
	shortlinkstore "github.com/slackworker/chain-subconverter/internal/store"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

const (
	httpListenNetwork = "tcp4"
	readHeaderTimeout = 5 * time.Second
	readTimeout       = 15 * time.Second
	writeTimeout      = 30 * time.Second
	idleTimeout       = 60 * time.Second
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
	shortLinkStore, err := shortlinkstore.NewSQLiteShortLinkStore(serverCfg.ShortLinkDBPath, serverCfg.ShortLinkCapacity)
	if err != nil {
		fmt.Fprintf(os.Stderr, "init short link store: %v\n", err)
		os.Exit(1)
	}
	defer shortLinkStore.Close()

	managedSource, err := service.NewManagedConversionSource(client, templateStore, serverCfg.ManagedTemplateBaseURL, subconverterCfg.Timeout, service.ManagedConversionSourceOptions{
		DefaultTemplateURL:           serverCfg.DefaultTemplateURL,
		DefaultTemplateFetchCacheTTL: serverCfg.DefaultTemplateFetchCacheTTL,
		TemplateFetchCacheTTL:        serverCfg.TemplateFetchCacheTTL,
		AllowPrivateNetworks:         serverCfg.TemplateAllowPrivateNetworks,
	})
	if err != nil {
		fmt.Fprintf(os.Stderr, "init managed conversion source: %v\n", err)
		os.Exit(1)
	}

	handler, err := api.NewHandler(managedSource, templateStore, shortLinkStore, serverCfg.PublicBaseURL, serverCfg.ManagedTemplateBaseURL, serverCfg.MaxLongURLLength, service.InputLimits{
		MaxRequestURLLength: serverCfg.MaxUpstreamRequestURLLength,
		MaxURLsPerField:     serverCfg.MaxURLsPerField,
		SubconverterBaseURL: subconverterCfg.BaseURL,
	}, api.WithWriteRequestsPerMinute(serverCfg.WriteRequestsPerMinute))
	if err != nil {
		fmt.Fprintf(os.Stderr, "init HTTP handler: %v\n", err)
		os.Exit(1)
	}

	server := &http.Server{
		Handler:           api.WithFrontendAssets(handler, serverCfg.FrontendDistDir),
		ReadHeaderTimeout: readHeaderTimeout,
		ReadTimeout:       readTimeout,
		WriteTimeout:      writeTimeout,
		IdleTimeout:       idleTimeout,
	}

	listener, err := listenHTTPServer(serverCfg.HTTPAddress)
	if err != nil {
		fmt.Fprintf(os.Stderr, "listen HTTP server: %v\n", err)
		os.Exit(1)
	}

	fmt.Printf(
		"chain-subconverter listening on %s (public base URL: %s, frontend dist: %s, subconverter: %s)\n",
		listener.Addr().String(),
		serverCfg.PublicBaseURL,
		serverCfg.FrontendDistDir,
		subconverterCfg.BaseURL,
	)

	if err := server.Serve(listener); err != nil && !errors.Is(err, http.ErrServerClosed) {
		fmt.Fprintf(os.Stderr, "run HTTP server: %v\n", err)
		os.Exit(1)
	}
}

func listenHTTPServer(listenAddress string) (net.Listener, error) {
	return net.Listen(httpListenNetwork, listenAddress)
}
