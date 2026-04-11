package main

import (
	"context"
	"flag"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/slackworker/chain-subconverter/internal/config"
	"github.com/slackworker/chain-subconverter/internal/review"
	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

func main() {
	action, caseDir, publicBaseURL, maxLongURLLength, err := parseArgs(os.Args[1:])
	if err != nil {
		fmt.Fprintf(os.Stderr, "frontend review: %v\n", err)
		os.Exit(1)
	}

	if err := run(context.Background(), action, caseDir, publicBaseURL, maxLongURLLength); err != nil {
		fmt.Fprintf(os.Stderr, "frontend review: %v\n", err)
		os.Exit(1)
	}
}

func parseArgs(args []string) (string, string, string, int, error) {
	if len(args) == 0 {
		return "", "", "", 0, fmt.Errorf("usage: frontend-review <stage1|stage2> [flags]")
	}
	action := strings.TrimSpace(args[0])
	if action != "stage1" && action != "stage2" {
		return "", "", "", 0, fmt.Errorf("unsupported action %q", action)
	}

	flagSet := flag.NewFlagSet("frontend-review", flag.ContinueOnError)
	flagSet.SetOutput(io.Discard)
	caseDir := flagSet.String("case-dir", "review/cases/3pass-ss2022-test-subscription", "review case directory")
	publicBaseURL := flagSet.String("public-base-url", envOrDefault("CHAIN_SUBCONVERTER_FRONTEND_REVIEW_PUBLIC_BASE_URL", "http://localhost:11200"), "public base URL for generate output")
	maxLongURLLength := flagSet.Int("max-long-url-length", 2048, "maximum long URL length")
	if err := flagSet.Parse(args[1:]); err != nil {
		return "", "", "", 0, err
	}

	return action, *caseDir, *publicBaseURL, *maxLongURLLength, nil
}

func run(ctx context.Context, action string, caseDir string, publicBaseURL string, maxLongURLLength int) error {
	absCaseDir, err := filepath.Abs(caseDir)
	if err != nil {
		return fmt.Errorf("resolve case dir: %w", err)
	}

	subconverterCfg, err := config.LoadSubconverterFromEnv()
	if err != nil {
		return fmt.Errorf("load subconverter config: %w", err)
	}

	client, err := subconverter.NewClient(subconverterCfg)
	if err != nil {
		return fmt.Errorf("init subconverter client: %w", err)
	}
	source, cleanup, err := newReviewConversionSource(client, subconverterCfg.Timeout)
	if err != nil {
		return err
	}
	defer cleanup()

	actionOutputDir := actionOutputDir(absCaseDir, action)
	if err := os.RemoveAll(actionOutputDir); err != nil {
		return fmt.Errorf("clean %s output dir: %w", action, err)
	}

	var testCase review.Case
	var bundle review.ArtifactBundle
	switch action {
	case "stage1":
		testCase, err = review.LoadStage1Case(absCaseDir)
		if err != nil {
			return err
		}
		bundle, err = review.BuildStage1Artifacts(ctx, source, testCase)
	case "stage2":
		testCase, err = review.LoadCase(absCaseDir)
		if err != nil {
			return err
		}
		bundle, err = review.BuildStage2Artifacts(ctx, source, testCase, publicBaseURL, maxLongURLLength)
	default:
		return fmt.Errorf("unsupported action %q", action)
	}
	if err != nil {
		return err
	}

	if err := writeArtifacts(absCaseDir, bundle.Files); err != nil {
		return err
	}

	fmt.Printf("Frontend review %s artifacts written to %s\n", action, actionOutputDir)
	if action == "stage1" {
		fmt.Printf("Stage2 snapshot refreshed at %s\n", filepath.Join(absCaseDir, "stage2", "input", review.Stage2SnapshotFileName))
	}
	for _, row := range bundle.Rows {
		fmt.Printf("- %s => %s", row.LandingNodeName, row.Mode)
		if row.TargetName != nil {
			fmt.Printf(" => %s", *row.TargetName)
		}
		fmt.Println()
	}

	return nil
}

func envOrDefault(key string, fallback string) string {
	value := strings.TrimSpace(os.Getenv(key))
	if value == "" {
		return fallback
	}
	return value
}

func newReviewConversionSource(client *subconverter.Client, templateTimeout time.Duration) (service.ConversionSource, func(), error) {
	templateStore := service.NewInMemoryTemplateContentStore()

	server := httptest.NewServer(http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		id := strings.TrimPrefix(request.URL.Path, "/internal/templates/")
		id = strings.TrimSuffix(id, ".ini")
		id = strings.TrimSpace(id)
		if id == "" || strings.Contains(id, "/") {
			http.NotFound(writer, request)
			return
		}

		content, ok := templateStore.Load(id)
		if !ok {
			http.NotFound(writer, request)
			return
		}

		writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
		writer.WriteHeader(http.StatusOK)
		_, _ = writer.Write([]byte(content))
	}))

	source, err := service.NewManagedConversionSource(client, templateStore, server.URL, templateTimeout)
	if err != nil {
		server.Close()
		return nil, nil, fmt.Errorf("init managed conversion source: %w", err)
	}

	return source, server.Close, nil
}

func writeArtifacts(outputDir string, artifacts []review.FileArtifact) error {
	for _, artifact := range artifacts {
		filePath := filepath.Join(outputDir, artifact.RelativePath)
		if err := os.MkdirAll(filepath.Dir(filePath), 0o755); err != nil {
			return fmt.Errorf("create artifact dir for %s: %w", artifact.RelativePath, err)
		}
		if err := os.WriteFile(filePath, []byte(artifact.Content), 0o644); err != nil {
			return fmt.Errorf("write %s: %w", artifact.RelativePath, err)
		}
	}

	return nil
}

func actionOutputDir(caseDir string, action string) string {
	return filepath.Join(caseDir, action, "output")
}
