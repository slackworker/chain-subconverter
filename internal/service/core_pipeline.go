package service

import (
	"context"
	"fmt"
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

func (pipeline *CorePipeline) LoadStage1InitFixtures() (ConversionFixtures, error) {
	return LoadStage1InitFixtures(pipeline.ctx, pipeline.source, pipeline.stage1Input, pipeline.limits)
}

func (pipeline *CorePipeline) LoadGenerateValidationFixtures() (ConversionFixtures, error) {
	if !pipeline.hasStage2Snapshot {
		return ConversionFixtures{}, fmt.Errorf("stage2 snapshot is required for validation pipeline")
	}
	return loadGenerateValidationFixtures(
		pipeline.ctx,
		pipeline.source,
		pipeline.stage1Input,
		pipeline.stage2Snapshot,
		pipeline.limits,
	)
}

func (pipeline *CorePipeline) RenderCompleteConfig() (string, error) {
	if !pipeline.hasStage2Snapshot {
		return "", fmt.Errorf("stage2 snapshot is required for render pipeline")
	}
	if snapshotSource, ok := pipeline.source.(SnapshotPass3RenderingSource); ok {
		return renderCompleteConfigViaManagedPass3(
			pipeline.ctx,
			pipeline.source,
			snapshotSource,
			pipeline.stage1Input,
			pipeline.stage2Snapshot,
			pipeline.limits,
		)
	}
	fixtures, err := loadGenerateValidationFixtures(
		pipeline.ctx,
		pipeline.source,
		pipeline.stage1Input,
		pipeline.stage2Snapshot,
		pipeline.limits,
	)
	if err != nil {
		return "", err
	}
	return RenderCompleteConfig(pipeline.stage1Input, pipeline.stage2Snapshot, fixtures)
}
