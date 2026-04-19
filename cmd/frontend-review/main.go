package main

import (
	"context"
	"flag"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/slackworker/chain-subconverter/internal/config"
	"github.com/slackworker/chain-subconverter/internal/review"
	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
	"gopkg.in/yaml.v3"
)

type reviewOptions struct {
	CaseName      string
	CaseDir       string
	LandingURL    string
	TransitURL    string
	TemplateURL   string
	PublicBaseURL string
	OutputDir     string
}

type advancedOptionsFile struct {
	Config            *string  `yaml:"config,omitempty"`
	Include           []string `yaml:"include,omitempty"`
	Exclude           []string `yaml:"exclude,omitempty"`
	EnablePortForward bool     `yaml:"enablePortForward"`
}

type templateAccessRecorder struct {
	mu      sync.Mutex
	entries []string
}

const managedTemplateListenNetwork = "tcp4"

var managedTemplateServerPorts = []int{37950, 37951, 37952, 37953, 37954, 37955, 37956, 37957, 37958, 37959}

func (recorder *templateAccessRecorder) record(status int, request *http.Request, templateID string, found bool) {
	if recorder == nil {
		return
	}
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	recorder.entries = append(recorder.entries, fmt.Sprintf("%s status=%d path=%s template_id=%s found=%t remote=%s", time.Now().Format(time.RFC3339), status, request.URL.Path, templateID, found, request.RemoteAddr))
}

func (recorder *templateAccessRecorder) text() string {
	if recorder == nil {
		return ""
	}
	recorder.mu.Lock()
	defer recorder.mu.Unlock()
	if len(recorder.entries) == 0 {
		return "(no requests)\n"
	}
	return strings.Join(recorder.entries, "\n") + "\n"
}

func main() {
	options := parseFlags()

	if err := run(options); err != nil {
		fmt.Fprintf(os.Stderr, "frontend-review: %v\n", err)
		os.Exit(1)
	}
}

func parseFlags() reviewOptions {
	timestampName := "live-review-" + time.Now().Format("20060102-150405")

	options := reviewOptions{}
	flag.StringVar(&options.CaseName, "name", timestampName, "review case name")
	flag.StringVar(&options.CaseDir, "case-dir", "", "review case directory containing stage1/input files")
	flag.StringVar(&options.LandingURL, "landing-url", "", "landing subscription URL")
	flag.StringVar(&options.TransitURL, "transit-url", "", "transit or airport subscription URL")
	flag.StringVar(&options.TemplateURL, "template-url", "", "optional template URL override")
	flag.StringVar(&options.PublicBaseURL, "public-base-url", config.DefaultPublicBaseURL, "public base URL used when generating longUrl")
	flag.StringVar(&options.OutputDir, "output-dir", "", "optional output directory; defaults to case-dir when set, otherwise .tmp/review/live/<name>")
	flag.Parse()
	return options
}

func run(options reviewOptions) error {
	reviewCase, err := resolveReviewCase(options)
	if err != nil {
		return err
	}

	outputDir, err := resolveOutputDirectory(options)
	if err != nil {
		return err
	}
	reviewCase.Directory = outputDir

	if err := clearReviewArtifacts(outputDir); err != nil {
		return err
	}

	subconverterCfg, err := config.LoadSubconverterFromEnv()
	if err != nil {
		return fmt.Errorf("load subconverter config: %w", err)
	}
	subconverterCfg = preferLocalhostSubconverter(subconverterCfg)
	client, err := subconverter.NewClient(subconverterCfg)
	if err != nil {
		return fmt.Errorf("init subconverter client: %w", err)
	}

	templateStore := service.NewInMemoryTemplateContentStore()
	managedTemplateBaseURL, templateAccess, shutdownTemplateServer, err := startTemplateServer(subconverterCfg, templateStore)
	if err != nil {
		return err
	}
	defer shutdownTemplateServer()

	source, err := service.NewManagedConversionSource(client, templateStore, managedTemplateBaseURL, subconverterCfg.Timeout)
	if err != nil {
		return fmt.Errorf("init managed conversion source: %w", err)
	}

	ctx, cancel := context.WithTimeout(context.Background(), subconverterCfg.Timeout*4)
	defer cancel()

	stage1Bundle, err := review.BuildStage1Artifacts(ctx, source, reviewCase)
	if err := writeInputs(outputDir, reviewCase.Stage1Input); err != nil {
		return err
	}
	if err := writeArtifacts(outputDir, stage1Bundle.Files); err != nil {
		return err
	}
	if err := writeTextFile(filepath.Join(outputDir, "stage1", "output", "template-server-access.log"), templateAccess.text()); err != nil {
		return err
	}
	if err != nil {
		fmt.Printf("review artifacts written to %s\n", outputDir)
		fmt.Printf("- %s\n", filepath.Join(outputDir, "stage1", "output", "stage1-convert.error.txt"))
		fmt.Printf("- %s\n", filepath.Join(outputDir, "stage1", "output", "landing-discovery.url.txt"))
		fmt.Printf("- %s\n", filepath.Join(outputDir, "stage1", "output", "full-base.yaml"))
		return fmt.Errorf("build stage1 artifacts: %w", err)
	}

	reviewCase.Stage2Input = service.Stage2Snapshot{Rows: stage1Bundle.Rows}
	stage2Bundle, err := review.BuildStage2Artifacts(ctx, source, reviewCase, options.PublicBaseURL, config.DefaultMaxLongURLLength)
	if err != nil {
		return fmt.Errorf("build stage2 artifacts: %w", err)
	}

	if err := writeArtifacts(outputDir, stage2Bundle.Files); err != nil {
		return err
	}

	fmt.Printf("review artifacts written to %s\n", outputDir)
	fmt.Printf("- %s\n", filepath.Join(outputDir, "stage1", "output", "review-summary.md"))
	fmt.Printf("- %s\n", filepath.Join(outputDir, "stage1", "output", "stage1-convert.response.json"))
	fmt.Printf("- %s\n", filepath.Join(outputDir, "stage2", "output", "generate.response.json"))
	fmt.Printf("- %s\n", filepath.Join(outputDir, "stage2", "output", "complete-config.chain.yaml"))

	return nil
}

func buildStage1Input(options reviewOptions) (service.Stage1Input, error) {
	if strings.TrimSpace(options.CaseDir) != "" {
		return service.Stage1Input{}, fmt.Errorf("case-dir cannot be combined with landing-url/transit-url input")
	}

	landingURL := strings.TrimSpace(options.LandingURL)
	transitURL := strings.TrimSpace(options.TransitURL)

	if landingURL == "" {
		return service.Stage1Input{}, fmt.Errorf("landing-url must not be empty")
	}
	if transitURL == "" {
		return service.Stage1Input{}, fmt.Errorf("transit-url must not be empty")
	}

	stage1Input := service.Stage1Input{
		LandingRawText:    landingURL,
		TransitRawText:    transitURL,
		ForwardRelayItems: []string{},
		AdvancedOptions: service.AdvancedOptions{
			EnablePortForward: false,
		},
	}

	if trimmedTemplateURL := strings.TrimSpace(options.TemplateURL); trimmedTemplateURL != "" {
		stage1Input.AdvancedOptions.Config = &trimmedTemplateURL
	}

	return stage1Input, nil
}

func resolveReviewCase(options reviewOptions) (review.Case, error) {
	if trimmedCaseDir := strings.TrimSpace(options.CaseDir); trimmedCaseDir != "" {
		reviewCase, err := review.LoadStage1Case(trimmedCaseDir)
		if err != nil {
			return review.Case{}, fmt.Errorf("load case dir: %w", err)
		}
		if trimmedName := strings.TrimSpace(options.CaseName); trimmedName != "" {
			reviewCase.Name = sanitizeName(trimmedName)
		} else {
			reviewCase.Name = sanitizeName(reviewCase.Name)
		}
		return reviewCase, nil
	}

	stage1Input, err := buildStage1Input(options)
	if err != nil {
		return review.Case{}, err
	}

	return review.Case{
		Name:        sanitizeName(options.CaseName),
		Stage1Input: stage1Input,
	}, nil
}

func resolveOutputDirectory(options reviewOptions) (string, error) {
	if trimmedOutputDir := strings.TrimSpace(options.OutputDir); trimmedOutputDir != "" {
		return filepath.Abs(trimmedOutputDir)
	}
	if trimmedCaseDir := strings.TrimSpace(options.CaseDir); trimmedCaseDir != "" {
		return filepath.Abs(trimmedCaseDir)
	}

	baseDir := filepath.Join(".tmp", "review", "live", sanitizeName(options.CaseName))
	absBaseDir, err := filepath.Abs(baseDir)
	if err != nil {
		return "", fmt.Errorf("resolve output dir: %w", err)
	}
	return absBaseDir, nil
}

func sanitizeName(value string) string {
	trimmed := strings.TrimSpace(value)
	if trimmed == "" {
		return "live-review"
	}

	replacer := strings.NewReplacer("/", "-", "\\", "-", " ", "-", ":", "-")
	sanitized := replacer.Replace(trimmed)
	if sanitized == "" {
		return "live-review"
	}
	return sanitized
}

func clearReviewArtifacts(outputDir string) error {
	paths := []string{
		filepath.Join(outputDir, "stage1", "output"),
		filepath.Join(outputDir, "stage2"),
	}

	for _, path := range paths {
		if err := os.RemoveAll(path); err != nil {
			return fmt.Errorf("clear %s: %w", path, err)
		}
	}

	return nil
}

func startTemplateServer(subconverterCfg config.Subconverter, templateStore service.TemplateContentReader) (string, *templateAccessRecorder, func(), error) {
	listenAddress, publicBaseURL, err := resolveManagedTemplateServer(subconverterCfg)
	if err != nil {
		return "", nil, nil, err
	}
	recorder := &templateAccessRecorder{}

	mux := http.NewServeMux()
	mux.HandleFunc("/internal/templates/{id}", func(writer http.ResponseWriter, request *http.Request) {
		if request.Method != http.MethodGet && request.Method != http.MethodHead {
			recorder.record(http.StatusMethodNotAllowed, request, "", false)
			http.Error(writer, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		id := strings.TrimSpace(strings.TrimSuffix(request.PathValue("id"), ".ini"))
		if id == "" || strings.Contains(id, "/") {
			recorder.record(http.StatusNotFound, request, id, false)
			http.NotFound(writer, request)
			return
		}

		content, ok := templateStore.Load(id)
		if !ok {
			recorder.record(http.StatusNotFound, request, id, false)
			http.NotFound(writer, request)
			return
		}

		writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
		writer.WriteHeader(http.StatusOK)
		if request.Method == http.MethodHead {
			recorder.record(http.StatusOK, request, id, true)
			return
		}
		_, _ = writer.Write([]byte(content))
		recorder.record(http.StatusOK, request, id, true)
	})

	listener, err := listenManagedTemplateServer(listenAddress)
	if err != nil {
		return "", nil, nil, fmt.Errorf("listen template server: %w", err)
	}

	server := &http.Server{
		Handler:           mux,
		ReadHeaderTimeout: 5 * time.Second,
	}

	go func() {
		_ = server.Serve(listener)
	}()

	shutdown := func() {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		_ = server.Shutdown(ctx)
	}

	return fmt.Sprintf("%s:%d", publicBaseURL, listener.Addr().(*net.TCPAddr).Port), recorder, shutdown, nil
}

func resolveManagedTemplateServer(subconverterCfg config.Subconverter) (string, string, error) {
	if resolvesOnHost("host.docker.internal") {
		return "0.0.0.0:0", "http://host.docker.internal", nil
	}

	parsedBaseURL, err := url.Parse(strings.TrimSpace(subconverterCfg.BaseURL))
	if err != nil {
		return "", "", fmt.Errorf("parse subconverter base URL: %w", err)
	}
	if parsedBaseURL.Scheme != "http" && parsedBaseURL.Scheme != "https" {
		return "", "", fmt.Errorf("subconverter base URL must include http or https scheme")
	}

	return "127.0.0.1:0", "http://127.0.0.1", nil
}

func resolvesOnHost(host string) bool {
	addrs, err := net.LookupHost(host)
	if err != nil {
		return false
	}
	return len(addrs) > 0
}

func listenManagedTemplateServer(listenAddress string) (net.Listener, error) {
	if strings.HasSuffix(listenAddress, ":0") {
		// Prefer a fresh OS-assigned IPv4 port so WSL/Docker Desktop does not
		// repeatedly reuse a stale forwarded port from a previous live review run.
		listener, err := net.Listen(managedTemplateListenNetwork, listenAddress)
		if err == nil {
			return listener, nil
		}

		host := strings.TrimSuffix(listenAddress, ":0")
		for _, port := range managedTemplateServerPorts {
			listener, err := net.Listen(managedTemplateListenNetwork, fmt.Sprintf("%s:%d", host, port))
			if err == nil {
				return listener, nil
			}
		}
	}

	return net.Listen(managedTemplateListenNetwork, listenAddress)
}

func writeInputs(outputDir string, stage1Input service.Stage1Input) error {
	if err := writeTextFile(filepath.Join(outputDir, "stage1", "input", review.LandingFileName), stage1Input.LandingRawText+"\n"); err != nil {
		return err
	}
	if err := writeTextFile(filepath.Join(outputDir, "stage1", "input", review.TransitFileName), stage1Input.TransitRawText+"\n"); err != nil {
		return err
	}

	forwardRelaysContent := ""
	if len(stage1Input.ForwardRelayItems) > 0 {
		forwardRelaysContent = strings.Join(stage1Input.ForwardRelayItems, "\n") + "\n"
	}
	if err := writeTextFile(filepath.Join(outputDir, "stage1", "input", review.ForwardRelaysFileName), forwardRelaysContent); err != nil {
		return err
	}

	advancedOptionsContent, err := marshalAdvancedOptions(stage1Input.AdvancedOptions)
	if err != nil {
		return fmt.Errorf("marshal advanced options: %w", err)
	}
	return writeTextFile(filepath.Join(outputDir, "stage1", "input", review.AdvancedOptionsFileName), advancedOptionsContent)
}

func marshalAdvancedOptions(options service.AdvancedOptions) (string, error) {
	fileOptions := advancedOptionsFile{
		Config:            options.Config,
		Include:           options.Include,
		Exclude:           options.Exclude,
		EnablePortForward: options.EnablePortForward,
	}

	data, err := yaml.Marshal(fileOptions)
	if err != nil {
		return "", err
	}
	if len(data) == 0 {
		return "enablePortForward: false\n", nil
	}
	return string(data), nil
}

func writeArtifacts(outputDir string, artifacts []review.FileArtifact) error {
	for _, artifact := range artifacts {
		if err := writeTextFile(filepath.Join(outputDir, artifact.RelativePath), artifact.Content); err != nil {
			return err
		}
	}
	return nil
}

func writeTextFile(filePath string, content string) error {
	if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
		return fmt.Errorf("mkdir %s: %w", filepath.Dir(filePath), err)
	}
	if err := os.WriteFile(filePath, []byte(content), 0o644); err != nil {
		return fmt.Errorf("write %s: %w", filePath, err)
	}
	return nil
}

func preferLocalhostSubconverter(cfg config.Subconverter) config.Subconverter {
	if _, ok := os.LookupEnv(config.EnvSubconverterBaseURL); ok {
		return cfg
	}

	localhostBaseURL := "http://127.0.0.1:25500/sub?"
	client := &http.Client{Timeout: 2 * time.Second}
	req, err := http.NewRequest(http.MethodGet, "http://127.0.0.1:25500/version", nil)
	if err != nil {
		return cfg
	}

	resp, err := client.Do(req)
	if err != nil {
		return cfg
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return cfg
	}

	cfg.BaseURL = localhostBaseURL
	return cfg
}
