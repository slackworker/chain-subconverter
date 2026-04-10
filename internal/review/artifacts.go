package review

import (
	"context"
	"encoding/json"
	"fmt"
	"net/url"
	"path/filepath"
	"sort"
	"strings"

	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

type FileArtifact struct {
	RelativePath string
	Content      string
}

type ArtifactBundle struct {
	Files []FileArtifact
	Rows  []service.Stage2Row
}

const managedTemplateArtifactURLPlaceholder = "http://managed-template.invalid/internal/templates/managed-template.ini"

func BuildStage1Artifacts(ctx context.Context, source service.ConversionSource, testCase Case) (ArtifactBundle, error) {
	result, fixtures, err := loadConversionResult(ctx, source, testCase.Stage1Input)
	if err != nil {
		return ArtifactBundle{}, err
	}

	stage1Response, err := service.BuildStage1ConvertResponse(testCase.Stage1Input, fixtures)
	if err != nil {
		return ArtifactBundle{}, err
	}
	defaultSnapshot := service.Stage2Snapshot{Rows: cloneRows(stage1Response.Stage2Init.Rows)}

	files := []FileArtifact{
		{RelativePath: "stage1/output/landing-discovery.url.txt", Content: ensureTrailingNewline(normalizeManagedTemplateRequestURL(result.LandingDiscovery.RequestURL))},
		{RelativePath: "stage1/output/landing-discovery.yaml", Content: ensureTrailingNewline(result.LandingDiscovery.YAML)},
		{RelativePath: "stage1/output/transit-discovery.url.txt", Content: ensureTrailingNewline(normalizeManagedTemplateRequestURL(result.TransitDiscovery.RequestURL))},
		{RelativePath: "stage1/output/transit-discovery.yaml", Content: ensureTrailingNewline(result.TransitDiscovery.YAML)},
		{RelativePath: "stage1/output/full-base.url.txt", Content: ensureTrailingNewline(normalizeManagedTemplateRequestURL(result.FullBase.RequestURL))},
		{RelativePath: "stage1/output/full-base.yaml", Content: ensureTrailingNewline(result.FullBase.YAML)},
		{RelativePath: "stage1/output/stage1-convert.request.json", Content: mustMarshalJSON(service.Stage1ConvertRequest{Stage1Input: testCase.Stage1Input})},
		{RelativePath: "stage1/output/stage1-convert.response.json", Content: mustMarshalJSON(stage1Response)},
		{RelativePath: filepath.Join("stage2", "input", Stage2SnapshotFileName), Content: mustMarshalJSON(service.Stage2SnapshotFixture{Stage2Snapshot: defaultSnapshot})},
		{RelativePath: "stage1/output/review-summary.md", Content: buildSummaryMarkdown(testCase.Name, stage1Response.Stage2Init)},
		{RelativePath: "stage1/output/autofill-pairs.txt", Content: buildAutofillPairsText(stage1Response.Stage2Init.Rows)},
		{RelativePath: "stage1/output/chain-targets.txt", Content: buildChainTargetsText(stage1Response.Stage2Init.ChainTargets)},
		{RelativePath: "stage1/output/forward-relays.txt", Content: buildForwardRelaysText(stage1Response.Stage2Init.ForwardRelays)},
	}

	return ArtifactBundle{Files: files, Rows: cloneRows(stage1Response.Stage2Init.Rows)}, nil
}

func BuildStage2Artifacts(ctx context.Context, source service.ConversionSource, testCase Case, publicBaseURL string, maxLongURLLength int) (ArtifactBundle, error) {
	_, fixtures, err := loadConversionResult(ctx, source, testCase.Stage1Input)
	if err != nil {
		return ArtifactBundle{}, err
	}

	request := service.GenerateRequest{
		Stage1Input:    testCase.Stage1Input,
		Stage2Snapshot: testCase.Stage2Input,
	}
	response, err := service.BuildGenerateResponse(publicBaseURL, request, fixtures, maxLongURLLength)
	if err != nil {
		return ArtifactBundle{}, err
	}
	renderedConfig, err := service.RenderCompleteConfig(testCase.Stage1Input, testCase.Stage2Input, fixtures)
	if err != nil {
		return ArtifactBundle{}, err
	}

	files := []FileArtifact{
		{RelativePath: "stage2/output/generate.request.json", Content: mustMarshalJSON(request)},
		{RelativePath: "stage2/output/generate.response.json", Content: mustMarshalJSON(response)},
		{RelativePath: "stage2/output/long-url.payload.json", Content: mustMarshalJSON(service.BuildLongURLPayload(testCase.Stage1Input, testCase.Stage2Input))},
		{RelativePath: "stage2/output/complete-config.chain.yaml", Content: ensureTrailingNewline(renderedConfig)},
	}

	return ArtifactBundle{Files: files, Rows: cloneRows(testCase.Stage2Input.Rows)}, nil
}

func cloneRows(rows []service.Stage2Row) []service.Stage2Row {
	cloned := make([]service.Stage2Row, 0, len(rows))
	for _, row := range rows {
		cloned = append(cloned, row)
	}
	return cloned
}

func loadConversionResult(ctx context.Context, source service.ConversionSource, stage1Input service.Stage1Input) (subconverter.ThreePassResult, service.ConversionFixtures, error) {
	return service.ExecuteConversion(ctx, source, stage1Input)
}

func mustMarshalJSON(value any) string {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		panic(err)
	}
	return string(data) + "\n"
}

func buildSummaryMarkdown(scenarioName string, stage2Init service.Stage2Init) string {
	var builder strings.Builder
	builder.WriteString("# Frontend Review Summary\n\n")
	builder.WriteString("- Scenario: ")
	builder.WriteString(scenarioName)
	builder.WriteString("\n")
	builder.WriteString("- Landing rows: ")
	builder.WriteString(fmt.Sprintf("%d", len(stage2Init.Rows)))
	builder.WriteString("\n")
	builder.WriteString("- Chain targets: ")
	builder.WriteString(fmt.Sprintf("%d", len(stage2Init.ChainTargets)))
	builder.WriteString("\n")
	builder.WriteString("- Forward relays: ")
	builder.WriteString(fmt.Sprintf("%d", len(stage2Init.ForwardRelays)))
	builder.WriteString("\n\n")
	builder.WriteString("## Available Modes\n\n")
	for _, mode := range stage2Init.AvailableModes {
		builder.WriteString("- ")
		builder.WriteString(mode)
		builder.WriteString("\n")
	}
	builder.WriteString("\n## Default Autofill\n\n")
	for _, row := range stage2Init.Rows {
		builder.WriteString("- ")
		builder.WriteString(row.LandingNodeName)
		builder.WriteString(" => ")
		builder.WriteString(row.Mode)
		if row.TargetName != nil {
			builder.WriteString(" => ")
			builder.WriteString(*row.TargetName)
		}
		builder.WriteString("\n")
	}
	return builder.String()
}

func buildAutofillPairsText(rows []service.Stage2Row) string {
	if len(rows) == 0 {
		return "(none)\n"
	}

	lines := make([]string, 0, len(rows))
	for _, row := range rows {
		line := row.LandingNodeName + " => " + row.Mode
		if row.TargetName != nil {
			line += " => " + *row.TargetName
		}
		lines = append(lines, line)
	}
	return strings.Join(lines, "\n") + "\n"
}

func buildChainTargetsText(targets []service.ChainTarget) string {
	if len(targets) == 0 {
		return "(none)\n"
	}

	grouped := map[string][]string{}
	for _, target := range targets {
		grouped[target.Kind] = append(grouped[target.Kind], target.Name)
	}

	kinds := make([]string, 0, len(grouped))
	for kind := range grouped {
		kinds = append(kinds, kind)
	}
	sort.Strings(kinds)

	lines := make([]string, 0, len(targets)+len(kinds))
	for _, kind := range kinds {
		lines = append(lines, "["+kind+"]")
		for _, name := range grouped[kind] {
			lines = append(lines, name)
		}
		lines = append(lines, "")
	}
	return strings.TrimRight(strings.Join(lines, "\n"), "\n") + "\n"
}

func buildForwardRelaysText(relays []service.ForwardRelay) string {
	if len(relays) == 0 {
		return "(none)\n"
	}

	lines := make([]string, 0, len(relays))
	for _, relay := range relays {
		lines = append(lines, relay.Name)
	}
	return strings.Join(lines, "\n") + "\n"
}

func ensureTrailingNewline(content string) string {
	if strings.HasSuffix(content, "\n") {
		return content
	}
	return content + "\n"
}

func normalizeManagedTemplateRequestURL(rawURL string) string {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	if parsedURL.RawQuery == "" {
		return rawURL
	}

	parts := strings.Split(parsedURL.RawQuery, "&")
	changed := false
	for index, part := range parts {
		name, value, ok := strings.Cut(part, "=")
		if !ok || name != "config" {
			continue
		}
		decodedValue, err := url.QueryUnescape(value)
		if err != nil || !isManagedTemplateConfigURL(decodedValue) {
			continue
		}
		parts[index] = name + "=" + url.QueryEscape(managedTemplateArtifactURLPlaceholder)
		changed = true
	}
	if !changed {
		return rawURL
	}

	normalizedURL := *parsedURL
	normalizedURL.RawQuery = strings.Join(parts, "&")
	return normalizedURL.String()
}

func isManagedTemplateConfigURL(rawURL string) bool {
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return false
	}
	trimmedPath := strings.TrimSpace(parsedURL.EscapedPath())
	if !strings.Contains(trimmedPath, "/internal/templates/") {
		return false
	}
	lastSegment := trimmedPath[strings.LastIndex(trimmedPath, "/")+1:]
	return strings.HasSuffix(lastSegment, ".ini") && lastSegment != ".ini"
}
