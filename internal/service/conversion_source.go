package service

import (
	"context"
	"fmt"
	"net/url"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

type ConversionSource interface {
	Convert(context.Context, subconverter.Request) (subconverter.ThreePassResult, error)
}

type PreparedConversion struct {
	Request                    subconverter.Request
	TemplateConfig             string
	EffectiveTemplateURL       string
	ManagedTemplateURL         string
	RecognizedRegionGroupNames []string
	Cleanup                    func()
}

type TemplatePreparingSource interface {
	PrepareConversion(context.Context, Stage1Input) (PreparedConversion, error)
}

func BuildStage1ConvertResponseFromSource(ctx context.Context, source ConversionSource, stage1Input Stage1Input, limits InputLimits) (Stage1ConvertResponse, error) {
	stage1Input = NormalizeStage1Input(stage1Input)
	fixtures, err := LoadConversionFixtures(ctx, source, stage1Input, limits)
	if err != nil {
		return Stage1ConvertResponse{}, err
	}
	return BuildStage1ConvertResponse(stage1Input, fixtures)
}

func BuildGenerateResponseFromSource(ctx context.Context, publicBaseURL string, source ConversionSource, request GenerateRequest, maxLongURLLength int, limits InputLimits) (GenerateResponse, error) {
	request.Stage1Input = NormalizeStage1Input(request.Stage1Input)
	fixtures, err := LoadConversionFixtures(ctx, source, request.Stage1Input, limits)
	if err != nil {
		return GenerateResponse{}, err
	}
	return BuildGenerateResponse(publicBaseURL, request, fixtures, maxLongURLLength)
}

func RenderCompleteConfigFromSource(ctx context.Context, source ConversionSource, stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, limits InputLimits) (string, error) {
	return RenderCompleteConfigFromSourceWithExtraQuery(ctx, source, stage1Input, stage2Snapshot, limits, nil)
}

func RenderCompleteConfigFromSourceWithExtraQuery(ctx context.Context, source ConversionSource, stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, limits InputLimits, extraQuery url.Values) (string, error) {
	stage1Input = NormalizeStage1Input(stage1Input)
	fixtures, err := LoadConversionFixturesWithExtraQuery(ctx, source, stage1Input, limits, extraQuery)
	if err != nil {
		return "", err
	}
	return RenderCompleteConfig(stage1Input, stage2Snapshot, fixtures)
}

func LoadConversionFixtures(ctx context.Context, source ConversionSource, stage1Input Stage1Input, limits InputLimits) (ConversionFixtures, error) {
	return LoadConversionFixturesWithExtraQuery(ctx, source, stage1Input, limits, nil)
}

func LoadConversionFixturesWithExtraQuery(ctx context.Context, source ConversionSource, stage1Input Stage1Input, limits InputLimits, extraQuery url.Values) (ConversionFixtures, error) {
	_, fixtures, err := ExecuteConversionWithExtraQuery(ctx, source, stage1Input, limits, extraQuery)
	return fixtures, err
}

func ExecuteConversion(ctx context.Context, source ConversionSource, stage1Input Stage1Input, limits InputLimits) (subconverter.ThreePassResult, ConversionFixtures, error) {
	return ExecuteConversionWithExtraQuery(ctx, source, stage1Input, limits, nil)
}

func ExecuteConversionWithExtraQuery(ctx context.Context, source ConversionSource, stage1Input Stage1Input, limits InputLimits, extraQuery url.Values) (subconverter.ThreePassResult, ConversionFixtures, error) {
	stage1Input = NormalizeStage1Input(stage1Input)

	if err := ValidateStage1InputLimits(stage1Input, limits); err != nil {
		return subconverter.ThreePassResult{}, ConversionFixtures{}, err
	}

	prepared, err := prepareConversion(ctx, source, stage1Input)
	if err != nil {
		return subconverter.ThreePassResult{}, ConversionFixtures{}, err
	}
	if prepared.Cleanup != nil {
		defer prepared.Cleanup()
	}
	prepared.Request.ExtraQuery = mergeExtraQuery(prepared.Request.ExtraQuery, extraQuery)

	result, err := source.Convert(ctx, prepared.Request)
	if err != nil {
		return subconverter.ThreePassResult{}, ConversionFixtures{}, err
	}
	fixtures, err := ConversionFixturesFromResult(result)
	if err != nil {
		return subconverter.ThreePassResult{}, ConversionFixtures{}, err
	}
	fixtures.TemplateConfig = prepared.TemplateConfig
	fixtures.EffectiveTemplateURL = prepared.EffectiveTemplateURL
	fixtures.ManagedTemplateURL = prepared.ManagedTemplateURL
	fixtures.RecognizedRegionGroupNames = append([]string(nil), prepared.RecognizedRegionGroupNames...)
	return result, fixtures, nil
}

func ConversionFixturesFromResult(result subconverter.ThreePassResult) (ConversionFixtures, error) {
	fixtures := ConversionFixtures{
		LandingDiscoveryYAML: result.LandingDiscovery.YAML,
		TransitDiscoveryYAML: result.TransitDiscovery.YAML,
		FullBaseYAML:         result.FullBase.YAML,
	}

	landingProxies, err := parseInlineProxyList(fixtures.LandingDiscoveryYAML)
	if err != nil {
		return ConversionFixtures{}, subconverter.NewUnavailableError("parse landing-discovery result", err)
	}
	if len(landingProxies) == 0 {
		return ConversionFixtures{}, subconverter.NewUnavailableError(
			"parse landing-discovery result",
			fmt.Errorf("landing-discovery proxies list is empty"),
		)
	}

	transitProxies, err := parseInlineProxyList(fixtures.TransitDiscoveryYAML)
	if err != nil {
		return ConversionFixtures{}, subconverter.NewUnavailableError("parse transit-discovery result", err)
	}

	fullBaseProxies, err := parseInlineProxyList(fixtures.FullBaseYAML)
	if err != nil {
		return ConversionFixtures{}, subconverter.NewUnavailableError("parse full-base proxies", err)
	}
	if len(fullBaseProxies) == 0 {
		return ConversionFixtures{}, subconverter.NewUnavailableError(
			"parse full-base proxies",
			fmt.Errorf("full-base proxies list is empty"),
		)
	}

	fullBaseGroups, err := parseProxyGroups(fixtures.FullBaseYAML)
	if err != nil {
		return ConversionFixtures{}, subconverter.NewUnavailableError("parse full-base proxy-groups", err)
	}
	if len(fullBaseGroups) == 0 {
		return ConversionFixtures{}, subconverter.NewUnavailableError(
			"parse full-base proxy-groups",
			fmt.Errorf("full-base proxy-groups list is empty"),
		)
	}

	if _, err := resolveLandingDiscoveryProxies(landingProxies, fullBaseProxies); err != nil {
		return ConversionFixtures{}, err
	}
	if err := ensureDiscoveryNamesResolvable(transitProxies, fullBaseProxies, "transit"); err != nil {
		return ConversionFixtures{}, err
	}

	return fixtures, nil
}

func prepareConversion(ctx context.Context, source ConversionSource, stage1Input Stage1Input) (PreparedConversion, error) {
	if preparer, ok := source.(TemplatePreparingSource); ok {
		return preparer.PrepareConversion(ctx, stage1Input)
	}
	return PreparedConversion{
		Request: toSubconverterRequest(stage1Input),
	}, nil
}

func mergeExtraQuery(base url.Values, overlay url.Values) url.Values {
	if len(base) == 0 && len(overlay) == 0 {
		return nil
	}

	merged := make(url.Values)
	for name, values := range base {
		copied := append([]string(nil), values...)
		merged[name] = copied
	}
	for name, values := range overlay {
		for _, value := range values {
			merged.Add(name, value)
		}
	}
	if len(merged) == 0 {
		return nil
	}
	return merged
}

func toSubconverterRequest(stage1Input Stage1Input) subconverter.Request {
	return subconverter.Request{
		LandingRawText: stage1Input.LandingRawText,
		TransitRawText: stage1Input.TransitRawText,
		Options: subconverter.AdvancedOptions{
			Emoji:          stage1Input.AdvancedOptions.Emoji,
			UDP:            stage1Input.AdvancedOptions.UDP,
			SkipCertVerify: stage1Input.AdvancedOptions.SkipCertVerify,
			Config:         stage1Input.AdvancedOptions.Config,
			Include:        stage1Input.AdvancedOptions.Include,
			Exclude:        stage1Input.AdvancedOptions.Exclude,
		},
	}
}

func ensureDiscoveryNamesResolvable(discoveryProxies []inlineProxy, fullBaseProxies []inlineProxy, label string) error {
	fullBaseNames := make(map[string]struct{}, len(fullBaseProxies))
	for _, proxy := range fullBaseProxies {
		fullBaseNames[proxy.Name] = struct{}{}
	}

	for _, proxy := range discoveryProxies {
		if _, ok := fullBaseNames[proxy.Name]; ok {
			continue
		}
		return subconverter.NewUnavailableError(
			fmt.Sprintf("validate %s-discovery names", label),
			fmt.Errorf("proxy %q is missing from full-base result", proxy.Name),
		)
	}

	return nil
}
