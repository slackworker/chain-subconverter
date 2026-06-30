package service

import (
	"context"
	"fmt"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

// CorePipeline unifies convert/generate/resolve/sub orchestration
// around one normalized stage input/snapshot pipeline.
type CorePipeline struct {
	ctx               context.Context
	source            ConversionSource
	limits            InputLimits
	stage1Input       Stage1Input
	stage2Snapshot    Stage2Snapshot
	hasStage2Snapshot bool
}

type managedPass3Prepared struct {
	prepared                      PreparedConversion
	fixtures                      ConversionFixtures
	fixturesForSnapshotValidation ConversionFixtures
	landingProxies                []resolvedLandingProxy
	managedLandingYAML            string
	managedTransitProxiesYAML     string
}

func NewCorePipeline(ctx context.Context, source ConversionSource, stage1Input Stage1Input, limits InputLimits) *CorePipeline {
	return &CorePipeline{
		ctx:         ctx,
		source:      source,
		limits:      limits,
		stage1Input: NormalizeStage1Input(stage1Input),
	}
}

func (pipeline *CorePipeline) WithStage2Snapshot(stage2Snapshot Stage2Snapshot) *CorePipeline {
	pipeline.stage2Snapshot = NormalizeStage2Snapshot(stage2Snapshot)
	pipeline.hasStage2Snapshot = true
	return pipeline
}

func (pipeline *CorePipeline) BuildStage1ConvertResponse() (Stage1ConvertResponse, error) {
	fixtures, err := pipeline.LoadStage1InitFixtures()
	if err != nil {
		return Stage1ConvertResponse{}, err
	}
	return BuildStage1ConvertResponse(pipeline.stage1Input, fixtures)
}

func (pipeline *CorePipeline) BuildGenerateResponse(publicBaseURL string, maxLongURLLength int) (GenerateResponse, error) {
	if !pipeline.hasStage2Snapshot {
		return GenerateResponse{}, fmt.Errorf("stage2 snapshot is required for generate pipeline")
	}
	fixtures, err := pipeline.LoadGenerateValidationFixtures()
	if err != nil {
		return GenerateResponse{}, err
	}
	return BuildGenerateResponse(publicBaseURL, GenerateRequest{
		Stage1Input:    pipeline.stage1Input,
		Stage2Snapshot: pipeline.stage2Snapshot,
	}, fixtures, maxLongURLLength)
}

func (pipeline *CorePipeline) BuildStage2ResetResponse(reset Stage2ResetAction) (Stage2ResetResponse, error) {
	resetScope := reset.Scope
	if resetScope != "all" && resetScope != "row" {
		return Stage2ResetResponse{}, fmt.Errorf("unsupported reset scope %q", reset.Scope)
	}

	fixtures, err := pipeline.LoadStage1InitFixtures()
	if err != nil {
		return Stage2ResetResponse{}, err
	}
	stage2Init, err := BuildStage2Init(pipeline.stage1Input, fixtures)
	if err != nil {
		return Stage2ResetResponse{}, err
	}

	initialSnapshot := stage2InitToSnapshot(stage2Init)
	nextSnapshot := initialSnapshot
	switch resetScope {
	case "all":
		nextSnapshot = initialSnapshot
	case "row":
		nextSnapshot, err = resetSingleStage2Row(pipeline.stage2Snapshot, stage2Init, reset.RowID)
		if err != nil {
			return Stage2ResetResponse{}, err
		}
	}

	messages := append([]Message{}, fixtures.Messages...)
	messages = append(messages, stage2ResetWorkflowMessage(resetScope))
	return Stage2ResetResponse{
		Stage2Init:     stage2Init,
		Stage2Snapshot: nextSnapshot,
		Messages:       messages,
		BlockingErrors: []BlockingError{},
	}, nil
}

func (pipeline *CorePipeline) LoadStage1InitFixtures() (ConversionFixtures, error) {
	return LoadStage1InitFixtures(pipeline.ctx, pipeline.source, pipeline.stage1Input, pipeline.limits)
}

func (pipeline *CorePipeline) LoadGenerateValidationFixtures() (ConversionFixtures, error) {
	if !pipeline.hasStage2Snapshot {
		return ConversionFixtures{}, fmt.Errorf("stage2 snapshot is required for validation pipeline")
	}
	if snapshotSource, ok := pipeline.source.(SnapshotPass3RenderingSource); ok {
		return pipeline.loadManagedPass3ValidationFixtures(snapshotSource)
	}
	return LoadConversionFixtures(pipeline.ctx, pipeline.source, pipeline.stage1Input, pipeline.limits)
}

func (pipeline *CorePipeline) RenderCompleteConfig() (string, error) {
	if !pipeline.hasStage2Snapshot {
		return "", fmt.Errorf("stage2 snapshot is required for render pipeline")
	}
	if snapshotSource, ok := pipeline.source.(SnapshotPass3RenderingSource); ok {
		return pipeline.renderCompleteConfigViaManagedPass3(snapshotSource)
	}
	fixtures, err := LoadConversionFixtures(pipeline.ctx, pipeline.source, pipeline.stage1Input, pipeline.limits)
	if err != nil {
		return "", err
	}
	return RenderCompleteConfig(pipeline.stage1Input, pipeline.stage2Snapshot, fixtures)
}

func (pipeline *CorePipeline) DetermineRestoreStatus(fixtures ConversionFixtures) (string, []Message, error) {
	return DetermineRestoreStatus(pipeline.stage1Input, pipeline.stage2Snapshot, fixtures)
}

func (pipeline *CorePipeline) prepareManagedPass3Render() (managedPass3Prepared, error) {
	if !pipeline.hasStage2Snapshot {
		return managedPass3Prepared{}, fmt.Errorf("stage2 snapshot is required for managed pass3 pipeline")
	}
	if err := ValidateStage1InputLimits(pipeline.stage1Input, pipeline.limits); err != nil {
		return managedPass3Prepared{}, err
	}

	prepared, err := prepareConversion(pipeline.ctx, pipeline.source, pipeline.stage1Input)
	if err != nil {
		return managedPass3Prepared{}, err
	}

	result, err := executeSourceConvertWithPlan(pipeline.ctx, pipeline.source, prepared.Request, subconverter.Stage1InitConvertPlan())
	if err != nil {
		if prepared.Cleanup != nil {
			prepared.Cleanup()
		}
		return managedPass3Prepared{}, err
	}

	fixtures, err := stage1InitFixturesFromResult(result)
	if err != nil {
		if prepared.Cleanup != nil {
			prepared.Cleanup()
		}
		return managedPass3Prepared{}, err
	}
	fixtures.TemplateConfig = prepared.TemplateConfig
	fixtures.EffectiveTemplateURL = prepared.EffectiveTemplateURL
	fixtures.ManagedTemplateURL = prepared.ManagedTemplateURL
	fixtures.RecognizedRegionGroupNames = append([]string(nil), prepared.RecognizedRegionGroupNames...)
	fixtures.Messages = append([]Message(nil), prepared.Messages...)

	fixturesForSnapshotValidation := fixtures
	// Managed pass3 rewrites landing proxy names based on stage2 rows.
	// Snapshot validation must keep Stage1 discovery identity as source of truth.
	fixturesForSnapshotValidation.FullBaseYAML = ""

	landingProxies, err := validateGenerateSnapshot(pipeline.stage1Input, pipeline.stage2Snapshot, fixturesForSnapshotValidation)
	if err != nil {
		if prepared.Cleanup != nil {
			prepared.Cleanup()
		}
		return managedPass3Prepared{}, err
	}

	managedLandingYAML, err := buildManagedLandingConfigYAML(fixtures.LandingDiscoveryYAML, pipeline.stage2Snapshot.Rows)
	if err != nil {
		if prepared.Cleanup != nil {
			prepared.Cleanup()
		}
		return managedPass3Prepared{}, newInternalResponseError("failed to build managed landing config", err)
	}

	emojiProcessor, _, err := buildChainEmojiProcessor(prepared.TemplateConfig, pipeline.stage1Input.AdvancedOptions)
	if err != nil {
		if prepared.Cleanup != nil {
			prepared.Cleanup()
		}
		return managedPass3Prepared{}, newInternalResponseError("failed to build chain emoji processor", fmt.Errorf("build chain emoji processor: %w", err))
	}
	managedTransitProxiesYAML, err := buildManagedTransitProxiesYAML(fixtures.TransitDiscoveryYAML, emojiProcessor)
	if err != nil {
		if prepared.Cleanup != nil {
			prepared.Cleanup()
		}
		return managedPass3Prepared{}, newInternalResponseError("failed to build managed transit proxies", err)
	}

	return managedPass3Prepared{
		prepared:                      prepared,
		fixtures:                      fixtures,
		fixturesForSnapshotValidation: fixturesForSnapshotValidation,
		landingProxies:                landingProxies,
		managedLandingYAML:            managedLandingYAML,
		managedTransitProxiesYAML:     managedTransitProxiesYAML,
	}, nil
}

func (pipeline *CorePipeline) loadManagedPass3ValidationFixtures(snapshotSource SnapshotPass3RenderingSource) (ConversionFixtures, error) {
	preparedRender, err := pipeline.prepareManagedPass3Render()
	if err != nil {
		return ConversionFixtures{}, err
	}
	if preparedRender.prepared.Cleanup != nil {
		defer preparedRender.prepared.Cleanup()
	}

	if _, err := snapshotSource.RenderManagedPass3(
		pipeline.ctx,
		preparedRender.prepared,
		preparedRender.managedLandingYAML,
		preparedRender.managedTransitProxiesYAML,
	); err != nil {
		return ConversionFixtures{}, err
	}

	return preparedRender.fixturesForSnapshotValidation, nil
}

func (pipeline *CorePipeline) renderCompleteConfigViaManagedPass3(snapshotSource SnapshotPass3RenderingSource) (string, error) {
	preparedRender, err := pipeline.prepareManagedPass3Render()
	if err != nil {
		return "", err
	}
	if preparedRender.prepared.Cleanup != nil {
		defer preparedRender.prepared.Cleanup()
	}

	fullBaseYAML, err := snapshotSource.RenderManagedPass3(
		pipeline.ctx,
		preparedRender.prepared,
		preparedRender.managedLandingYAML,
		preparedRender.managedTransitProxiesYAML,
	)
	if err != nil {
		return "", err
	}

	regionGroupNames, err := recognizedRegionGroupSet(preparedRender.fixtures)
	if err != nil {
		return "", err
	}

	stage2Init, err := BuildStage2Init(pipeline.stage1Input, preparedRender.fixturesForSnapshotValidation)
	if err != nil {
		return "", newInternalResponseError("failed to build stage2 init", fmt.Errorf("build stage2 init: %w", err))
	}

	rendered, err := stripLandingNodesFromCompleteConfigYAML(
		fullBaseYAML,
		pipeline.stage2Snapshot,
		stage2StripLandingNames(preparedRender.landingProxies, pipeline.stage2Snapshot.Rows),
		regionGroupNames,
		proxyGroupChainTargetNameSet(stage2Init),
	)
	if err != nil {
		return "", err
	}
	rendered, err = appendServerAggregationGroupsToCompleteConfigYAML(rendered, pipeline.stage2Snapshot)
	if err != nil {
		return "", err
	}
	return unescapeYAMLUnicodeEscapes(rendered), nil
}
