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
	Files    []FileArtifact
	Snapshot service.Stage2Snapshot
}

const managedTemplateArtifactURLPlaceholder = "http://managed-template.invalid/internal/templates/managed-template.ini"

func BuildStage1Artifacts(ctx context.Context, source service.ConversionSource, testCase Case) (ArtifactBundle, error) {
	result, fixtures, err := loadStage1InitResult(ctx, source, testCase.Stage1Input)
	if err != nil {
		return ArtifactBundle{}, err
	}

	files := []FileArtifact{
		{RelativePath: "stage1/output/landing-discovery.url.raw.txt", Content: ensureTrailingNewline(result.LandingDiscovery.RequestURL)},
		{RelativePath: "stage1/output/landing-discovery.url.txt", Content: ensureTrailingNewline(normalizeManagedTemplateRequestURL(result.LandingDiscovery.RequestURL))},
		{RelativePath: "stage1/output/landing-discovery.yaml", Content: ensureTrailingNewline(result.LandingDiscovery.YAML)},
		{RelativePath: "stage1/output/transit-discovery.url.raw.txt", Content: ensureTrailingNewline(result.TransitDiscovery.RequestURL)},
		{RelativePath: "stage1/output/transit-discovery.url.txt", Content: ensureTrailingNewline(normalizeManagedTemplateRequestURL(result.TransitDiscovery.RequestURL))},
		{RelativePath: "stage1/output/transit-discovery.yaml", Content: ensureTrailingNewline(result.TransitDiscovery.YAML)},
		{RelativePath: "stage1/output/full-base.url.raw.txt", Content: ensureTrailingNewline(result.FullBase.RequestURL)},
		{RelativePath: "stage1/output/full-base.url.txt", Content: ensureTrailingNewline(normalizeManagedTemplateRequestURL(result.FullBase.RequestURL))},
		{RelativePath: "stage1/output/full-base.yaml", Content: ensureTrailingNewline(result.FullBase.YAML)},
		{RelativePath: "stage1/output/stage1-convert.request.json", Content: mustMarshalJSON(service.Stage1ConvertRequest{Stage1Input: testCase.Stage1Input})},
	}
	if strings.TrimSpace(fixtures.EffectiveTemplateURL) != "" {
		files = append(files, FileArtifact{RelativePath: "stage1/output/template-source.url.txt", Content: ensureTrailingNewline(fixtures.EffectiveTemplateURL)})
	}
	if strings.TrimSpace(fixtures.ManagedTemplateURL) != "" {
		files = append(files, FileArtifact{RelativePath: "stage1/output/template-managed.url.txt", Content: ensureTrailingNewline(fixtures.ManagedTemplateURL)})
	}
	if strings.TrimSpace(fixtures.TemplateConfig) != "" {
		files = append(files, FileArtifact{RelativePath: "stage1/output/template-config.ini", Content: ensureTrailingNewline(fixtures.TemplateConfig)})
	}
	if templateDiagnostics, err := service.BuildTemplateDiagnostics(fixtures); err == nil {
		files = append(files, FileArtifact{RelativePath: "stage1/output/template-diagnostics.json", Content: mustMarshalJSON(templateDiagnostics)})
	}

	stage1Response, err := service.BuildStage1ConvertResponse(testCase.Stage1Input, fixtures)
	if err != nil {
		files = append(files, FileArtifact{RelativePath: "stage1/output/stage1-convert.error.txt", Content: ensureTrailingNewline(err.Error())})
		return ArtifactBundle{Files: files}, err
	}
	defaultSnapshot := stage1Response.Stage2.Snapshot

	files = append(files,
		FileArtifact{RelativePath: "stage1/output/stage1-convert.response.json", Content: mustMarshalJSON(stage1Response)},
		FileArtifact{RelativePath: filepath.Join("stage2", "input", Stage2SnapshotFileName), Content: mustMarshalJSON(service.Stage2SnapshotFixture{Stage2Snapshot: defaultSnapshot})},
		FileArtifact{RelativePath: "stage1/output/review-summary.md", Content: buildSummaryMarkdown(testCase.Name, stage1Response.Stage2.Catalog)},
		FileArtifact{RelativePath: "stage1/output/autofill-pairs.txt", Content: buildAutofillPairsText(stage1Response.Stage2.Catalog)},
		FileArtifact{RelativePath: "stage1/output/chain-targets.txt", Content: buildChainTargetsText(stage1Response.Stage2.Catalog.ChainTargets)},
		FileArtifact{RelativePath: "stage1/output/forward-relays.txt", Content: buildForwardRelaysText(stage1Response.Stage2.Catalog.ForwardRelays)},
	)

	return ArtifactBundle{Files: files, Snapshot: defaultSnapshot}, nil
}

func BuildStage2Artifacts(ctx context.Context, source service.ConversionSource, testCase Case, publicBaseURL string, maxLongURLLength int) (ArtifactBundle, error) {
	request := service.GenerateRequest{
		Stage1Input: testCase.Stage1Input,
		Stage2:      service.GenerateRequestStage2{Snapshot: testCase.Stage2Input},
	}
	response, err := service.BuildGenerateResponseFromSource(
		ctx,
		publicBaseURL,
		source,
		request,
		maxLongURLLength,
		service.InputLimits{},
	)
	if err != nil {
		return ArtifactBundle{}, err
	}
	shortLinkRequest := service.ShortLinkRequest{LongURL: response.LongURL}
	shortLinkResponse, err := service.BuildShortLinkResponse(
		ctx,
		publicBaseURL,
		service.NewInMemoryShortLinkStore(),
		response.LongURL,
		maxLongURLLength,
		service.InputLimits{},
	)
	if err != nil {
		return ArtifactBundle{}, err
	}
	longURLPayload, err := service.DecodeLongURLPayload(response.LongURL, service.InputLimits{})
	if err != nil {
		return ArtifactBundle{}, err
	}
	renderedConfig, err := service.RenderCompleteConfigFromSource(
		ctx,
		source,
		testCase.Stage1Input,
		testCase.Stage2Input,
		service.InputLimits{},
	)
	if err != nil {
		return ArtifactBundle{}, err
	}

	files := []FileArtifact{
		{RelativePath: "stage2/output/generate.request.json", Content: mustMarshalJSON(request)},
		{RelativePath: "stage2/output/generate.response.json", Content: mustMarshalJSON(response)},
		{RelativePath: "stage2/output/short-links.request.json", Content: mustMarshalJSON(shortLinkRequest)},
		{RelativePath: "stage2/output/short-links.response.json", Content: mustMarshalJSON(shortLinkResponse)},
		{RelativePath: "stage2/output/long-url.payload.json", Content: mustMarshalJSON(longURLPayload)},
		{RelativePath: "stage2/output/complete-config.chain.yaml", Content: ensureTrailingNewline(renderedConfig)},
	}

	return ArtifactBundle{Files: files, Snapshot: testCase.Stage2Input}, nil
}

func loadStage1InitResult(ctx context.Context, source service.ConversionSource, stage1Input service.Stage1Input) (subconverter.ThreePassResult, service.ConversionFixtures, error) {
	if _, ok := source.(service.PlannedConversionSource); ok {
		return service.ExecuteStage1InitConversion(ctx, source, stage1Input, service.InputLimits{})
	}
	return service.ExecuteConversion(ctx, source, stage1Input, service.InputLimits{})
}

func mustMarshalJSON(value any) string {
	data, err := json.MarshalIndent(value, "", "  ")
	if err != nil {
		panic(err)
	}
	return string(data) + "\n"
}

func buildSummaryMarkdown(scenarioName string, catalog service.Stage2Catalog) string {
	var builder strings.Builder
	builder.WriteString("# Fixture Summary\n\n")
	builder.WriteString("- Case: ")
	builder.WriteString(scenarioName)
	builder.WriteString("\n")
	sourceCount := 0
	for _, server := range catalog.Servers {
		sourceCount += len(server.Sources)
	}
	builder.WriteString("- Landing sources: ")
	builder.WriteString(fmt.Sprintf("%d", sourceCount))
	builder.WriteString("\n")
	builder.WriteString("- Chain targets: ")
	builder.WriteString(fmt.Sprintf("%d", len(catalog.ChainTargets)))
	builder.WriteString("\n")
	builder.WriteString("- Forward relays: ")
	builder.WriteString(fmt.Sprintf("%d", len(catalog.ForwardRelays)))
	builder.WriteString("\n\n")
	builder.WriteString("## Available Modes\n\n")
	for _, mode := range catalog.AvailableModes {
		builder.WriteString("- ")
		builder.WriteString(mode)
		builder.WriteString("\n")
	}
	builder.WriteString("\n## Default Autofill\n\n")
	builder.WriteString("| Landing Node | Type | Mode | Target |\n")
	builder.WriteString("| --- | --- | --- | --- |\n")
	for _, server := range catalog.Servers {
		for _, source := range server.Sources {
			targetName := ""
			if source.DefaultTargetName != nil {
				targetName = *source.DefaultTargetName
			}
			builder.WriteString("| ")
			builder.WriteString(source.DefaultProxyName)
			builder.WriteString(" | ")
			builder.WriteString(source.LandingNodeType)
			builder.WriteString(" | ")
			builder.WriteString(source.DefaultMode)
			builder.WriteString(" | ")
			builder.WriteString(targetName)
			builder.WriteString(" |\n")
		}
	}
	return builder.String()
}

func buildAutofillPairsText(catalog service.Stage2Catalog) string {
	lines := make([]string, 0)
	for _, server := range catalog.Servers {
		for _, source := range server.Sources {
			line := source.DefaultProxyName + " | " + source.LandingNodeType + " | " + source.DefaultMode
			if source.DefaultTargetName != nil {
				line += " | " + *source.DefaultTargetName
			}
			lines = append(lines, line)
		}
	}
	if len(lines) == 0 {
		return "(none)\n"
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
	return strings.Join(lines, "\n") + "\n"
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

func ensureTrailingNewline(value string) string {
	if strings.HasSuffix(value, "\n") {
		return value
	}
	return value + "\n"
}

func normalizeManagedTemplateRequestURL(rawURL string) string {
	parsed, err := url.Parse(rawURL)
	if err != nil {
		return rawURL
	}
	query := parsed.Query()
	if query.Get("config") == "" {
		return rawURL
	}
	query.Set("config", managedTemplateArtifactURLPlaceholder)
	parsed.RawQuery = query.Encode()
	return parsed.String()
}
