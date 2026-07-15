package main

import (
	"context"
	"encoding/json"
	"flag"
	"fmt"
	"io"
	"net"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"github.com/slackworker/chain-subconverter/internal/config"
	"github.com/slackworker/chain-subconverter/internal/review"
	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
	"github.com/slackworker/chain-subconverter/internal/testfixtures"
)

const defaultPublicBaseURL = "http://localhost:11200"

var trackedStage1OutputArtifacts = map[string]struct{}{
	"stage1/output/landing-discovery.url.txt":   {},
	"stage1/output/landing-discovery.yaml":      {},
	"stage1/output/transit-discovery.url.txt":   {},
	"stage1/output/transit-discovery.yaml":      {},
	"stage1/output/full-base.url.txt":           {},
	"stage1/output/full-base.yaml":              {},
	"stage1/output/stage1-convert.request.json": {},
	"stage1/output/stage1-convert.response.json": {},
}

func main() {
	var repoRoot string
	var scenarioFilter string
	var stage1LiveBaseURL string
	var stage1LiveFixtureHost string

	flag.StringVar(&repoRoot, "repo-root", ".", "repository root")
	flag.StringVar(&scenarioFilter, "scenario", "", "only generate one scenario ID")
	flag.StringVar(&stage1LiveBaseURL, "stage1-live-base-url", "", "optional subconverter base URL used to rerecord review stage1 output fixtures")
	flag.StringVar(&stage1LiveFixtureHost, "stage1-live-fixture-host", "auto", "host exposed to subconverter for locally served transit/template fixtures (or 'auto')")
	flag.Parse()

	if err := run(repoRoot, scenarioFilter, stage1LiveBaseURL, stage1LiveFixtureHost); err != nil {
		fmt.Fprintln(os.Stderr, err)
		os.Exit(1)
	}
}

func run(repoRoot string, scenarioFilter string, stage1LiveBaseURL string, stage1LiveFixtureHost string) error {
	scenarioFiles, err := filepath.Glob(filepath.Join(repoRoot, "testdata", "canonical-scenarios", "*.stage1.json"))
	if err != nil {
		return fmt.Errorf("glob canonical scenarios: %w", err)
	}
	if len(scenarioFiles) == 0 {
		return fmt.Errorf("no canonical stage1 scenarios found under %s", filepath.Join(repoRoot, "testdata", "canonical-scenarios"))
	}

	generatedScenarioCount := 0
	for _, scenarioFile := range scenarioFiles {
		scenario, err := testfixtures.LoadStage1Scenario(scenarioFile)
		if err != nil {
			return err
		}
		if scenarioFilter != "" && scenario.ScenarioID != scenarioFilter {
			continue
		}

		renderedFiles, err := testfixtures.RenderReviewStage1InputFiles(scenario.Stage1Input)
		if err != nil {
			return fmt.Errorf("render review stage1 input files for %s: %w", scenario.ScenarioID, err)
		}

		scenarioDir := filepath.Join(repoRoot, "internal", "review", "testdata", scenario.ScenarioID)
		if err := writeRenderedStage1Inputs(filepath.Join(scenarioDir, "stage1", "input"), renderedFiles); err != nil {
			return fmt.Errorf("write review stage1 input files for %s: %w", scenario.ScenarioID, err)
		}
		if strings.TrimSpace(stage1LiveBaseURL) != "" {
			if err := writeStage1Outputs(context.Background(), scenario, scenarioDir, stage1LiveBaseURL, stage1LiveFixtureHost); err != nil {
				return err
			}
			generatedScenarioCount++
			continue
		}
		if err := writeStage2Outputs(context.Background(), scenario, scenarioDir); err != nil {
			return err
		}

		generatedScenarioCount++
	}

	if generatedScenarioCount == 0 {
		return fmt.Errorf("no canonical stage1 scenarios matched filter %q", scenarioFilter)
	}

	return nil
}

func writeStage1Outputs(ctx context.Context, scenario testfixtures.Stage1Scenario, scenarioDir string, stage1LiveBaseURL string, stage1LiveFixtureHost string) error {
	testCase, err := review.LoadStage1Case(scenarioDir)
	if err != nil {
		return fmt.Errorf("load review stage1 case %s: %w", scenario.ScenarioID, err)
	}

	canonicalRequest := stage1InputToSubconverterRequest(testCase.Stage1Input)
	requestURLs, err := subconverter.BuildRequestURLs(stage1LiveBaseURL, canonicalRequest)
	if err != nil {
		return fmt.Errorf("build stage1 request URLs for %s: %w", scenario.ScenarioID, err)
	}

	liveStage1Input := testCase.Stage1Input
	liveTransitRawText, err := stage1LiveTransitRawText(scenario)
	if err != nil {
		return fmt.Errorf("load live transit fixtures for %s: %w", scenario.ScenarioID, err)
	}
	if strings.TrimSpace(liveTransitRawText) != "" {
		liveStage1Input.TransitRawText = liveTransitRawText
	}

	client, err := subconverter.NewClient(config.Subconverter{
		UpstreamBaseURL: stage1LiveBaseURL,
		Timeout:         config.DefaultSubconverterTimeout,
		MaxInFlight:     config.DefaultSubconverterMaxInFlight,
	})
	if err != nil {
		return fmt.Errorf("init live subconverter client for %s: %w", scenario.ScenarioID, err)
	}

	result, err := client.Convert(ctx, stage1InputToSubconverterRequest(liveStage1Input))
	if err != nil {
		return fmt.Errorf("rerecord review stage1 outputs for %s: %w", scenario.ScenarioID, err)
	}
	result.LandingDiscovery.RequestURL = requestURLs.LandingDiscovery
	result.TransitDiscovery.RequestURL = requestURLs.TransitDiscovery
	result.FullBase.RequestURL = requestURLs.FullBase

	source, err := newReviewFixtureSourceFromResult(scenario, result)
	if err != nil {
		return fmt.Errorf("prepare review fixture source for %s: %w", scenario.ScenarioID, err)
	}

	bundle, err := review.BuildStage1Artifacts(ctx, source, testCase)
	if err != nil {
		return fmt.Errorf("build stage1 artifacts for %s: %w", scenario.ScenarioID, err)
	}

	for _, file := range bundle.Files {
		if _, ok := trackedStage1OutputArtifacts[file.RelativePath]; !ok {
			continue
		}
		content := file.Content
		switch file.RelativePath {
		case "stage1/output/full-base.url.txt":
			content = ensureTrailingNewline(result.FullBase.RequestURL)
		case "stage1/output/full-base.yaml":
			content = ensureTrailingNewline(result.FullBase.YAML)
		}
		outputPath := filepath.Join(scenarioDir, filepath.FromSlash(file.RelativePath))
		if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
			return fmt.Errorf("create %s: %w", filepath.Dir(outputPath), err)
		}
		if err := os.WriteFile(outputPath, []byte(content), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", outputPath, err)
		}
		fmt.Println(outputPath)
	}
	stage2InitRows, foundStage2InitRows, err := stage2InitRowsFromBundle(bundle.Files)
	if err != nil {
		return fmt.Errorf("parse stage1 convert response for %s: %w", scenario.ScenarioID, err)
	}
	if foundStage2InitRows {
		if err := rewriteStage2SnapshotSourceLandingNames(scenarioDir, stage2InitRows); err != nil {
			return fmt.Errorf("rewrite stage2 snapshot source landing names for %s: %w", scenario.ScenarioID, err)
		}
	}

	return nil
}

func writeRenderedStage1Inputs(outputDir string, renderedFiles []testfixtures.RenderedFile) error {
	if err := os.MkdirAll(outputDir, 0o755); err != nil {
		return fmt.Errorf("create %s: %w", outputDir, err)
	}

	for _, renderedFile := range renderedFiles {
		outputPath := filepath.Join(outputDir, renderedFile.Name)
		if err := os.WriteFile(outputPath, []byte(renderedFile.Content), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", outputPath, err)
		}
		fmt.Println(outputPath)
	}

	return nil
}

type stage1LiveFixtureServer struct {
	server       *http.Server
	listener     net.Listener
	port         int
	transitPaths []string
	templatePath string
}

func newStage1LiveFixtureServer(scenario testfixtures.Stage1Scenario) (*stage1LiveFixtureServer, error) {
	mux := http.NewServeMux()
	listener, err := net.Listen("tcp4", "0.0.0.0:0")
	if err != nil {
		return nil, fmt.Errorf("listen for local fixtures: %w", err)
	}

	server := &http.Server{Handler: mux}
	go func() {
		_ = server.Serve(listener)
	}()

	port := listener.Addr().(*net.TCPAddr).Port

	transitPaths := make([]string, 0, len(scenario.TransitFixtures))
	for index, fixture := range scenario.TransitFixtures {
		content, err := scenario.ReadRelativeFile(fixture.URIContentFile)
		if err != nil {
			_ = server.Shutdown(context.Background())
			return nil, fmt.Errorf("read transit fixture %s: %w", fixture.URIContentFile, err)
		}
		path := fmt.Sprintf("/transit/%d.txt", index)
		contentCopy := ensureTrailingNewline(content)
		mux.HandleFunc(path, func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = io.WriteString(w, contentCopy)
		})
		transitPaths = append(transitPaths, path)
	}

	var templatePath string
	if scenario.TemplateFixture != nil {
		content, err := scenario.ReadRelativeFile(scenario.TemplateFixture.ContentFile)
		if err != nil {
			_ = server.Shutdown(context.Background())
			return nil, fmt.Errorf("read template fixture %s: %w", scenario.TemplateFixture.ContentFile, err)
		}
		path := "/template/config.ini"
		contentCopy := ensureTrailingNewline(content)
		mux.HandleFunc(path, func(w http.ResponseWriter, _ *http.Request) {
			w.Header().Set("Content-Type", "text/plain; charset=utf-8")
			_, _ = io.WriteString(w, contentCopy)
		})
		templatePath = path
	}

	return &stage1LiveFixtureServer{
		server:       server,
		listener:     listener,
		port:         port,
		transitPaths: transitPaths,
		templatePath: templatePath,
	}, nil
}

func (server *stage1LiveFixtureServer) transitURLsForHost(host string) []string {
	if len(server.transitPaths) == 0 {
		return nil
	}
	baseURL := server.baseURL(host)
	urls := make([]string, 0, len(server.transitPaths))
	for _, path := range server.transitPaths {
		urls = append(urls, baseURL+path)
	}
	return urls
}

func (server *stage1LiveFixtureServer) templateURLForHost(host string) *string {
	if server.templatePath == "" {
		return nil
	}
	url := server.baseURL(host) + server.templatePath
	return &url
}

func (server *stage1LiveFixtureServer) baseURL(host string) string {
	trimmedHost := strings.TrimSpace(host)
	if trimmedHost == "" {
		trimmedHost = "127.0.0.1"
	}
	return "http://" + net.JoinHostPort(trimmedHost, strconv.Itoa(server.port))
}

func (server *stage1LiveFixtureServer) Close() {
	if server == nil || server.server == nil {
		return
	}
	shutdownCtx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancel()
	_ = server.server.Shutdown(shutdownCtx)
	if server.listener != nil {
		_ = server.listener.Close()
	}
}

func stage1InputToSubconverterRequest(stage1Input service.Stage1Input) subconverter.Request {
	return subconverter.Request{
		LandingRawText: stage1Input.LandingRawText,
		TransitRawText: stage1Input.TransitRawText,
		Options: subconverter.AdvancedOptions{
			Emoji:          stage1Input.AdvancedOptions.Emoji,
			UDP:            stage1Input.AdvancedOptions.UDP,
			SkipCertVerify: stage1Input.AdvancedOptions.SkipCertVerify,
			Config:         stage1Input.AdvancedOptions.Config,
			Include:        append([]string(nil), stage1Input.AdvancedOptions.Include...),
			Exclude:        append([]string(nil), stage1Input.AdvancedOptions.Exclude...),
		},
	}
}

func ensureTrailingNewline(content string) string {
	trimmed := strings.ReplaceAll(content, "\r\n", "\n")
	if strings.HasSuffix(trimmed, "\n") {
		return trimmed
	}
	return trimmed + "\n"
}

func stringPtr(value string) *string {
	return &value
}

func stage1LiveTransitRawText(scenario testfixtures.Stage1Scenario) (string, error) {
	if len(scenario.TransitFixtures) == 0 {
		return "", nil
	}

	sections := make([]string, 0, len(scenario.TransitFixtures))
	for _, fixture := range scenario.TransitFixtures {
		content, err := scenario.ReadRelativeFile(fixture.URIContentFile)
		if err != nil {
			return "", fmt.Errorf("read %s: %w", fixture.URIContentFile, err)
		}
		normalized := strings.TrimSpace(strings.ReplaceAll(content, "\r\n", "\n"))
		if normalized == "" {
			continue
		}
		sections = append(sections, normalized)
	}
	return strings.Join(sections, "\n"), nil
}

func stage2InitRowsFromBundle(files []review.FileArtifact) ([]service.Stage2CatalogSource, bool, error) {
	for _, file := range files {
		if file.RelativePath != "stage1/output/stage1-convert.response.json" {
			continue
		}
		var response service.Stage1ConvertResponse
		if err := json.Unmarshal([]byte(file.Content), &response); err != nil {
			return nil, false, err
		}
		sources := make([]service.Stage2CatalogSource, 0)
		for _, server := range response.Stage2.Catalog.Servers {
			sources = append(sources, server.Sources...)
		}
		return sources, true, nil
	}
	return nil, false, nil
}

func rewriteStage2SnapshotSourceLandingNames(scenarioDir string, stage2InitRows []service.Stage2CatalogSource) error {
	snapshotPath := filepath.Join(scenarioDir, "stage2", "input", review.Stage2SnapshotFileName)
	snapshotData, err := os.ReadFile(snapshotPath)
	if err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	var fixture service.Stage2SnapshotFixture
	if err := json.Unmarshal(snapshotData, &fixture); err != nil {
		return err
	}

	if !normalizeStage2SnapshotSourceLandingNames(&fixture.Stage2Snapshot, stage2InitRows) {
		return nil
	}

	rendered, err := json.MarshalIndent(fixture, "", "  ")
	if err != nil {
		return err
	}
	rendered = append(rendered, '\n')
	if err := os.WriteFile(snapshotPath, rendered, 0o644); err != nil {
		return err
	}
	fmt.Println(snapshotPath)
	return nil
}

func stage1LiveFixtureHosts(rawHost string) []string {
	trimmedHost := strings.TrimSpace(rawHost)
	if trimmedHost != "" && !strings.EqualFold(trimmedHost, "auto") {
		return []string{trimmedHost}
	}

	seen := map[string]struct{}{}
	candidates := make([]string, 0, 3)
	for _, candidate := range []string{"host.docker.internal", "172.17.0.1", "127.0.0.1"} {
		if _, ok := seen[candidate]; ok {
			continue
		}
		seen[candidate] = struct{}{}
		candidates = append(candidates, candidate)
	}
	return candidates
}

func writeStage2Outputs(ctx context.Context, scenario testfixtures.Stage1Scenario, scenarioDir string) error {
	if scenario.TemplateFixture == nil {
		return nil
	}

	snapshotPath := filepath.Join(scenarioDir, "stage2", "input", review.Stage2SnapshotFileName)
	if _, err := os.Stat(snapshotPath); err != nil {
		if os.IsNotExist(err) {
			return nil
		}
		return fmt.Errorf("stat %s: %w", snapshotPath, err)
	}

	testCase, err := review.LoadCase(scenarioDir)
	if err != nil {
		return fmt.Errorf("load review case %s: %w", scenario.ScenarioID, err)
	}

	source, err := newReviewFixtureSource(scenario, scenarioDir)
	if err != nil {
		return fmt.Errorf("prepare review fixture source for %s: %w", scenario.ScenarioID, err)
	}

	bundle, err := review.BuildStage2Artifacts(ctx, source, testCase, defaultPublicBaseURL, 0)
	if err != nil {
		return fmt.Errorf("build stage2 artifacts for %s: %w", scenario.ScenarioID, err)
	}

	for _, file := range bundle.Files {
		outputPath := filepath.Join(scenarioDir, filepath.FromSlash(file.RelativePath))
		if err := os.MkdirAll(filepath.Dir(outputPath), 0o755); err != nil {
			return fmt.Errorf("create %s: %w", filepath.Dir(outputPath), err)
		}
		if err := os.WriteFile(outputPath, []byte(file.Content), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", outputPath, err)
		}
		fmt.Println(outputPath)
	}

	return nil
}

type reviewFixtureSource struct {
	result               subconverter.ThreePassResult
	templateConfig       string
	effectiveTemplateURL string
	managedTemplateURL   string
}

func newReviewFixtureSource(scenario testfixtures.Stage1Scenario, scenarioDir string) (*reviewFixtureSource, error) {
	result, err := loadThreePassResultFromDirectory(scenarioDir)
	if err != nil {
		return nil, err
	}

	return newReviewFixtureSourceFromResult(scenario, result)
}

func newReviewFixtureSourceFromResult(scenario testfixtures.Stage1Scenario, result subconverter.ThreePassResult) (*reviewFixtureSource, error) {

	source := &reviewFixtureSource{result: result}
	if scenario.TemplateFixture == nil {
		return source, nil
	}

	content, err := scenario.ReadRelativeFile(scenario.TemplateFixture.ContentFile)
	if err != nil {
		return nil, fmt.Errorf("read template fixture %s: %w", scenario.TemplateFixture.ContentFile, err)
	}
	source.templateConfig = content
	source.effectiveTemplateURL = scenario.TemplateFixture.InputURL
	source.managedTemplateURL = fmt.Sprintf("http://managed-template.invalid/internal/templates/%s.ini", scenario.ScenarioID)
	return source, nil
}

func (source *reviewFixtureSource) Convert(_ context.Context, _ subconverter.Request) (subconverter.ThreePassResult, error) {
	return source.result, nil
}

func (source *reviewFixtureSource) ConvertWithPlan(_ context.Context, _ subconverter.Request, plan subconverter.ConvertPlan) (subconverter.ThreePassResult, error) {
	result := source.result
	if !plan.IncludeFullBase {
		result.FullBase = subconverter.PassResult{}
	}
	return result, nil
}

func (source *reviewFixtureSource) PrepareConversion(_ context.Context, stage1Input service.Stage1Input) (service.PreparedConversion, error) {
	normalized := service.NormalizeStage1Input(stage1Input)
	return service.PreparedConversion{
		Request: subconverter.Request{
			LandingRawText: normalized.LandingRawText,
			TransitRawText: normalized.TransitRawText,
			Options: subconverter.AdvancedOptions{
				Emoji:          normalized.AdvancedOptions.Emoji,
				UDP:            normalized.AdvancedOptions.UDP,
				SkipCertVerify: normalized.AdvancedOptions.SkipCertVerify,
				Config:         normalized.AdvancedOptions.Config,
				Include:        append([]string(nil), normalized.AdvancedOptions.Include...),
				Exclude:        append([]string(nil), normalized.AdvancedOptions.Exclude...),
			},
		},
		TemplateConfig:       source.templateConfig,
		EffectiveTemplateURL: source.effectiveTemplateURL,
		ManagedTemplateURL:   source.managedTemplateURL,
	}, nil
}

func loadThreePassResultFromDirectory(fixtureDir string) (subconverter.ThreePassResult, error) {
	landingRequestURL, err := readFixtureText(filepath.Join(fixtureDir, "stage1", "output", "landing-discovery.url.txt"))
	if err != nil {
		return subconverter.ThreePassResult{}, err
	}
	landingYAML, err := readFixtureText(filepath.Join(fixtureDir, "stage1", "output", "landing-discovery.yaml"))
	if err != nil {
		return subconverter.ThreePassResult{}, err
	}
	transitRequestURL, err := readFixtureText(filepath.Join(fixtureDir, "stage1", "output", "transit-discovery.url.txt"))
	if err != nil {
		return subconverter.ThreePassResult{}, err
	}
	transitYAML, err := readFixtureText(filepath.Join(fixtureDir, "stage1", "output", "transit-discovery.yaml"))
	if err != nil {
		return subconverter.ThreePassResult{}, err
	}
	fullBaseRequestURL, err := readFixtureText(filepath.Join(fixtureDir, "stage1", "output", "full-base.url.txt"))
	if err != nil {
		return subconverter.ThreePassResult{}, err
	}
	fullBaseYAML, err := readFixtureText(filepath.Join(fixtureDir, "stage1", "output", "full-base.yaml"))
	if err != nil {
		return subconverter.ThreePassResult{}, err
	}

	return subconverter.ThreePassResult{
		LandingDiscovery: subconverter.PassResult{RequestURL: landingRequestURL, YAML: landingYAML},
		TransitDiscovery: subconverter.PassResult{RequestURL: transitRequestURL, YAML: transitYAML},
		FullBase:         subconverter.PassResult{RequestURL: fullBaseRequestURL, YAML: fullBaseYAML},
	}, nil
}

func readFixtureText(path string) (string, error) {
	data, err := os.ReadFile(path)
	if err != nil {
		return "", fmt.Errorf("read %s: %w", path, err)
	}
	return strings.ReplaceAll(string(data), "\r\n", "\n"), nil
}
