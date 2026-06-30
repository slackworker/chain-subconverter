package service

import (
	"fmt"
	"sort"
)

type Message struct {
	Level   string         `json:"level"`
	Code    string         `json:"code"`
	Message string         `json:"message"`
	Context map[string]any `json:"context,omitempty"`
}

type BlockingError struct {
	Code      string         `json:"code"`
	Message   string         `json:"message"`
	Scope     string         `json:"scope"`
	Retryable *bool          `json:"retryable,omitempty"`
	Context   map[string]any `json:"context,omitempty"`
}

type Stage1ConvertResponse struct {
	Stage2Init     Stage2Init      `json:"stage2Init"`
	Messages       []Message       `json:"messages"`
	BlockingErrors []BlockingError `json:"blockingErrors"`
}

type GenerateRequest struct {
	Stage1Input    Stage1Input    `json:"stage1Input"`
	Stage2Snapshot Stage2Snapshot `json:"stage2Snapshot"`
}

type GenerateResponse struct {
	LongURL        string          `json:"longUrl"`
	Messages       []Message       `json:"messages"`
	BlockingErrors []BlockingError `json:"blockingErrors"`
}

type LongURLPayload struct {
	V              int            `json:"v"`
	Stage1Input    Stage1Input    `json:"stage1Input"`
	Stage2Snapshot Stage2Snapshot `json:"stage2Snapshot"`
}

type TemplateDiagnostics struct {
	EffectiveTemplateURL    string   `json:"effectiveTemplateURL,omitempty"`
	ManagedTemplateURL      string   `json:"managedTemplateURL,omitempty"`
	RecognizedRegionGroups  []string `json:"recognizedRegionGroups"`
	FullBaseProxyGroups     []string `json:"fullBaseProxyGroups"`
	MissingRecognizedGroups []string `json:"missingRecognizedGroups"`
}

func BuildStage1ConvertResponse(stage1Input Stage1Input, fixtures ConversionFixtures) (Stage1ConvertResponse, error) {
	stage1Input = NormalizeStage1Input(stage1Input)
	stage2Init, err := BuildStage2Init(stage1Input, fixtures)
	if err != nil {
		return Stage1ConvertResponse{}, err
	}
	messages := append([]Message{}, fixtures.Messages...)
	messages = buildStage1ConvertMessages(stage2Init, messages)

	return Stage1ConvertResponse{
		Stage2Init:     stage2Init,
		Messages:       messages,
		BlockingErrors: []BlockingError{},
	}, nil
}

func BuildGenerateResponse(publicBaseURL string, request GenerateRequest, fixtures ConversionFixtures, maxLongURLLength int) (GenerateResponse, error) {
	request.Stage1Input = NormalizeStage1Input(request.Stage1Input)
	request.Stage2Snapshot = NormalizeStage2Snapshot(request.Stage2Snapshot)
	if _, err := validateGenerateSnapshot(request.Stage1Input, request.Stage2Snapshot, fixtures); err != nil {
		return GenerateResponse{}, err
	}

	longURL, err := EncodeLongURL(publicBaseURL, BuildLongURLPayload(request.Stage1Input, request.Stage2Snapshot), maxLongURLLength)
	if err != nil {
		return GenerateResponse{}, err
	}
	messages := append([]Message{}, fixtures.Messages...)
	messages = append(messages, generateWorkflowMessages()...)

	return GenerateResponse{
		LongURL:        longURL,
		Messages:       messages,
		BlockingErrors: []BlockingError{},
	}, nil
}

func BuildLongURLPayload(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot) LongURLPayload {
	stage1Input = NormalizeStage1Input(stage1Input)
	stage2Snapshot = NormalizeStage2Snapshot(stage2Snapshot)
	return LongURLPayload{
		V:              longURLSchemaVersion,
		Stage1Input:    stage1Input,
		Stage2Snapshot: stage2Snapshot,
	}
}

func RenderCompleteConfig(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, fixtures ConversionFixtures) (string, error) {
	stage1Input = NormalizeStage1Input(stage1Input)
	stage2Snapshot = NormalizeStage2Snapshot(stage2Snapshot)
	landingProxies, err := validateGenerateSnapshot(stage1Input, stage2Snapshot, fixtures)
	if err != nil {
		return "", err
	}
	regionMatchers, err := loadRegionMatchers(fixtures.TemplateConfig)
	if err != nil {
		return "", newInternalResponseError("failed to load region matchers", fmt.Errorf("load region matchers: %w", err))
	}

	landingNames := make(map[string]struct{}, len(landingProxies))
	for _, landing := range landingProxies {
		landingNames[landing.Name] = struct{}{}
	}
	regionGroupNames := make(map[string]struct{}, len(regionMatchers))
	for _, matcher := range regionMatchers {
		regionGroupNames[matcher.TargetName] = struct{}{}
	}

	stage2Init, err := BuildStage2Init(stage1Input, fixtures)
	if err != nil {
		return "", newInternalResponseError("failed to build stage2 init", fmt.Errorf("build stage2 init: %w", err))
	}

	rendered, err := renderCompleteConfigYAML(
		fixtures.FullBaseYAML,
		stage2Snapshot,
		landingNames,
		regionGroupNames,
		proxyGroupChainTargetNameSet(stage2Init),
	)
	if err != nil {
		return "", err
	}
	rendered, err = appendServerAggregationGroupsToCompleteConfigYAML(rendered, stage2Snapshot)
	if err != nil {
		return "", err
	}

	return unescapeYAMLUnicodeEscapes(rendered), nil
}

func NormalizeStage2Snapshot(snapshot Stage2Snapshot) Stage2Snapshot {
	if snapshot.Rows == nil {
		snapshot.Rows = []Stage2Row{}
	} else {
		snapshot.Rows = normalizeStage2Rows(snapshot.Rows)
	}
	if snapshot.ServerAggregationGroups == nil {
		snapshot.ServerAggregationGroups = []ServerAggregationGroup{}
	}
	return snapshot
}

func BuildTemplateDiagnostics(fixtures ConversionFixtures) (TemplateDiagnostics, error) {
	diagnostics := TemplateDiagnostics{
		EffectiveTemplateURL: fixtures.EffectiveTemplateURL,
		ManagedTemplateURL:   fixtures.ManagedTemplateURL,
	}

	recognizedGroups := append([]string(nil), fixtures.RecognizedRegionGroupNames...)
	if len(recognizedGroups) == 0 {
		regionMatchers, err := loadRegionMatchers(fixtures.TemplateConfig)
		if err != nil {
			return TemplateDiagnostics{}, newInternalResponseError("failed to load region matchers", fmt.Errorf("load region matchers: %w", err))
		}
		recognizedGroups = make([]string, 0, len(regionMatchers))
		for _, matcher := range regionMatchers {
			recognizedGroups = append(recognizedGroups, matcher.TargetName)
		}
	}
	diagnostics.RecognizedRegionGroups = recognizedGroups

	fullBaseGroups, err := parseProxyGroups(fixtures.FullBaseYAML)
	if err != nil {
		return TemplateDiagnostics{}, newInternalResponseError("failed to parse full-base proxy-groups", fmt.Errorf("parse full-base proxy-groups: %w", err))
	}

	fullBaseProxyGroups := make([]string, 0, len(fullBaseGroups))
	for name := range fullBaseGroups {
		fullBaseProxyGroups = append(fullBaseProxyGroups, name)
	}
	sort.Strings(fullBaseProxyGroups)
	diagnostics.FullBaseProxyGroups = fullBaseProxyGroups

	missingGroups := make([]string, 0)
	for _, name := range recognizedGroups {
		if _, ok := fullBaseGroups[name]; ok {
			continue
		}
		missingGroups = append(missingGroups, name)
	}
	diagnostics.MissingRecognizedGroups = missingGroups

	return diagnostics, nil
}
