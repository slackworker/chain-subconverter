package service

import (
	"context"
	"fmt"
	"net/http"
	"strings"
)

type Stage2ResetAction struct {
	Scope string `json:"scope"`
	RowID string `json:"rowId,omitempty"`
}

type Stage2ResetRequest struct {
	Stage1Input    Stage1Input       `json:"stage1Input"`
	Stage2Snapshot Stage2Snapshot    `json:"stage2Snapshot"`
	Reset          Stage2ResetAction `json:"reset"`
}

type Stage2ResetResponse struct {
	Stage2Init     Stage2Init      `json:"stage2Init"`
	Stage2Snapshot Stage2Snapshot  `json:"stage2Snapshot"`
	Messages       []Message       `json:"messages"`
	BlockingErrors []BlockingError `json:"blockingErrors"`
}

func BuildStage2ResetResponseFromSource(ctx context.Context, source ConversionSource, request Stage2ResetRequest, limits InputLimits) (Stage2ResetResponse, error) {
	request.Stage1Input = NormalizeStage1Input(request.Stage1Input)
	request.Stage2Snapshot = NormalizeStage2Snapshot(request.Stage2Snapshot)

	resetScope := strings.TrimSpace(request.Reset.Scope)
	if resetScope != "all" && resetScope != "row" {
		cause := fmt.Errorf("unsupported reset scope %q", request.Reset.Scope)
		return Stage2ResetResponse{}, newResponseError(
			http.StatusBadRequest,
			"INVALID_REQUEST",
			"unsupported reset scope",
			"global",
			nil,
			nil,
			cause,
		)
	}

	return NewCorePipeline(ctx, source, request.Stage1Input, limits).
		WithStage2Snapshot(request.Stage2Snapshot).
		BuildStage2ResetResponse(Stage2ResetAction{
			Scope: resetScope,
			RowID: strings.TrimSpace(request.Reset.RowID),
		})
}

func stage2InitToSnapshot(stage2Init Stage2Init) Stage2Snapshot {
	rows := make([]Stage2Row, 0, len(stage2Init.Rows))
	for _, row := range stage2Init.Rows {
		rows = append(rows, Stage2Row{
			RowID:                 row.RowID,
			SourceLandingNodeName: row.SourceLandingNodeName,
			ProxyName:             row.ProxyName,
			LandingNodeName:       row.LandingNodeName,
			Mode:                  row.Mode,
			TargetName:            row.TargetName,
		})
	}
	return Stage2Snapshot{
		Rows:                    rows,
		ServerAggregationGroups: []ServerAggregationGroup{},
	}
}

func resetSingleStage2Row(currentSnapshot Stage2Snapshot, stage2Init Stage2Init, rowID string) (Stage2Snapshot, error) {
	if rowID == "" {
		return Stage2Snapshot{}, newStage2RowInvalidRequestError(
			"rowId must not be empty when reset scope is row",
			stage2RowErrorRef{},
			"rowId",
			fmt.Errorf("missing rowId for row reset"),
		)
	}

	rows := append([]Stage2Row(nil), currentSnapshot.Rows...)
	targetIndex := -1
	for index, row := range rows {
		if strings.TrimSpace(row.rowIDOrFallback()) == rowID {
			targetIndex = index
			break
		}
	}
	if targetIndex < 0 {
		return Stage2Snapshot{}, newStage2RowValidationError(
			"STAGE2_ROW_NOT_FOUND",
			"stage2 row not found",
			stage2RowErrorRef{RowID: rowID},
			"rowId",
			fmt.Errorf("stage2 row %q not found", rowID),
		)
	}

	targetRow := rows[targetIndex]
	sourceLandingName := targetRow.sourceLandingNodeNameOrFallback()
	if sourceLandingName == "" {
		return Stage2Snapshot{}, newStage2RowInvalidRequestError(
			"sourceLandingNodeName must not be empty",
			stage2RowValidationErrorRef(targetRow),
			"sourceLandingNodeName",
			fmt.Errorf("sourceLandingNodeName is empty for row %q", rowID),
		)
	}

	var baselineRow *Stage2InitRow
	for index := range stage2Init.Rows {
		candidate := stage2Init.Rows[index]
		if strings.TrimSpace(candidate.SourceLandingNodeName) == sourceLandingName {
			baselineRow = &candidate
			break
		}
	}
	if baselineRow == nil {
		return Stage2Snapshot{}, newStage2RowValidationError(
			"LANDING_NODE_NOT_FOUND",
			"landing node not found",
			stage2RowValidationErrorRef(targetRow),
			"sourceLandingNodeName",
			fmt.Errorf("source landing node %q not found in stage2 init", sourceLandingName),
		)
	}

	rows[targetIndex] = Stage2Row{
		RowID:                 targetRow.RowID,
		SourceLandingNodeName: targetRow.SourceLandingNodeName,
		ProxyName:             baselineRow.ProxyName,
		LandingNodeName:       baselineRow.LandingNodeName,
		Mode:                  baselineRow.Mode,
		TargetName:            baselineRow.TargetName,
	}

	return Stage2Snapshot{
		Rows: rows,
		ChainProxyTargetGroupSwitchOptimizationEnabled: currentSnapshot.ChainProxyTargetGroupSwitchOptimizationEnabled,
		ServerAggregationGroups:                        append([]ServerAggregationGroup{}, currentSnapshot.ServerAggregationGroups...),
	}, nil
}
