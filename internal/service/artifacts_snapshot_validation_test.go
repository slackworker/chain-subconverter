package service

import (
	"strings"
	"testing"
)

func TestValidateGenerateSnapshot_RejectsRowsetMismatch(t *testing.T) {
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(Stage1Input{}, Stage2Snapshot{
		Rows: []Stage2Row{},
	}, fixtures)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want rowset mismatch")
	}
	if !strings.Contains(err.Error(), "stage2 rowset size mismatch") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_RejectsTargetForNoneMode(t *testing.T) {
	targetName := "relay.example.com:80"
	fixtures := singleLandingFixture("HK Landing", "ss", "")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "HK Landing",
					Mode:            "none",
					TargetName:      &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want targetName validation")
	}
	if !strings.Contains(err.Error(), "targetName must be empty") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_RejectsChainForVLESSReality(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Reality", "vless-reality", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "HK Reality",
					Mode:            "chain",
					TargetName:      &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want chain restriction")
	}
	if !strings.Contains(err.Error(), "does not allow chain mode") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_RejectsEmptyChainTarget(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("Unknown Landing", "ss", "")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					LandingNodeName: "Unknown Landing",
					Mode:            "chain",
					TargetName:      &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want empty chain target rejection")
	}
	if !strings.Contains(err.Error(), `chain target "🇭🇰 香港节点"`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code != "EMPTY_CHAIN_TARGET" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", blockingError.Code, "EMPTY_CHAIN_TARGET")
	}
}
