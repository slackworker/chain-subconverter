package service

import (
	"context"
	"path/filepath"
	"strings"
	"testing"
)

func TestBuildStage2ResetResponseFromSource_All(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	var stage1Request Stage1ConvertRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.request.json"), &stage1Request)

	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}

	response, err := BuildStage2ResetResponseFromSource(context.Background(), source, Stage2ResetRequest{
		Stage1Input:    stage1Request.Stage1Input,
		Stage2Snapshot: Stage2Snapshot{},
		Reset: Stage2ResetAction{
			Scope: "all",
		},
	}, InputLimits{})
	if err != nil {
		t.Fatalf("BuildStage2ResetResponseFromSource() error = %v", err)
	}

	if len(response.Stage2Snapshot.Rows) != len(response.Stage2Init.Rows) {
		t.Fatalf("len(stage2Snapshot.rows) = %d, want %d", len(response.Stage2Snapshot.Rows), len(response.Stage2Init.Rows))
	}
	if len(response.Stage2Snapshot.ServerAggregationGroups) != 0 {
		t.Fatalf("len(stage2Snapshot.serverAggregationGroups) = %d, want 0", len(response.Stage2Snapshot.ServerAggregationGroups))
	}
	if response.Stage2Snapshot.ChainProxyTargetGroupSwitchOptimizationEnabled {
		t.Fatal("chainProxyTargetGroupSwitchOptimizationEnabled should be false by default")
	}
	if len(response.Messages) == 0 || response.Messages[len(response.Messages)-1].Code != "STAGE2_RESET" {
		t.Fatalf("reset messages mismatch: got %v", response.Messages)
	}
}

func TestBuildStage2ResetResponseFromSource_Row(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	var stage1Request Stage1ConvertRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.request.json"), &stage1Request)
	var generateRequest GenerateRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage2", "output", "generate.request.json"), &generateRequest)

	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}

	mutated := generateRequest.Stage2Snapshot
	mutated.Rows = append([]Stage2Row(nil), generateRequest.Stage2Snapshot.Rows...)
	originalSource := mutated.Rows[0].sourceLandingNodeNameOrFallback()
	if strings.TrimSpace(mutated.Rows[0].RowID) == "" {
		mutated.Rows[0].RowID = "row-reset-1"
	}
	if strings.TrimSpace(mutated.Rows[0].SourceLandingNodeName) == "" {
		mutated.Rows[0].SourceLandingNodeName = originalSource
	}
	target := mutated.Rows[0]
	rowID := target.rowIDOrFallback()
	if rowID == "" {
		t.Fatal("fixture first row has empty row id")
	}
	mutatedName := "mutated-proxy-name"
	mutatedTarget := "relay-a.example.com:1080"
	mutated.Rows[0].ProxyName = mutatedName
	mutated.Rows[0].LandingNodeName = mutatedName
	mutated.Rows[0].Mode = "port_forward"
	mutated.Rows[0].TargetName = &mutatedTarget
	mutated.ServerAggregationGroups = []ServerAggregationGroup{{
		Server:       "landing-a.example.com",
		Enabled:      true,
		Strategy:     "fallback",
		MemberRowIDs: []string{rowID},
	}}

	response, err := BuildStage2ResetResponseFromSource(context.Background(), source, Stage2ResetRequest{
		Stage1Input:    stage1Request.Stage1Input,
		Stage2Snapshot: mutated,
		Reset: Stage2ResetAction{
			Scope: "row",
			RowID: rowID,
		},
	}, InputLimits{})
	if err != nil {
		t.Fatalf("BuildStage2ResetResponseFromSource() error = %v", err)
	}

	resetRow := response.Stage2Snapshot.Rows[0]
	if resetRow.ProxyName == mutatedName || resetRow.Mode == "port_forward" {
		t.Fatalf("row is not reset: got %+v", resetRow)
	}
	if len(response.Messages) == 0 || response.Messages[len(response.Messages)-1].Code != "STAGE2_ROW_RESET" {
		t.Fatalf("reset messages mismatch: got %v", response.Messages)
	}
	if len(response.Stage2Snapshot.ServerAggregationGroups) != 1 {
		t.Fatalf("len(stage2Snapshot.serverAggregationGroups) = %d, want 1", len(response.Stage2Snapshot.ServerAggregationGroups))
	}
}

func TestBuildStage2ResetResponseFromSource_RowNotFound(t *testing.T) {
	fixtureDir := fixtureDirectory(t)
	var stage1Request Stage1ConvertRequest
	readJSONFixture(t, filepath.Join(fixtureDir, "stage1", "output", "stage1-convert.request.json"), &stage1Request)

	source := &fakeConversionSource{
		result: loadThreePassResult(t, fixtureDir),
	}

	_, err := BuildStage2ResetResponseFromSource(context.Background(), source, Stage2ResetRequest{
		Stage1Input:    stage1Request.Stage1Input,
		Stage2Snapshot: Stage2Snapshot{},
		Reset: Stage2ResetAction{
			Scope: "row",
			RowID: "missing-row-id",
		},
	}, InputLimits{})
	if err == nil {
		t.Fatal("BuildStage2ResetResponseFromSource() error = nil, want row not found")
	}

	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected ResponseError, got %T", err)
	}
	if responseErr.StatusCode() != 422 {
		t.Fatalf("statusCode = %d, want 422", responseErr.StatusCode())
	}
	if responseErr.BlockingError().Code != "STAGE2_ROW_NOT_FOUND" {
		t.Fatalf("code = %q, want STAGE2_ROW_NOT_FOUND", responseErr.BlockingError().Code)
	}
}
