package service

import (
	"strings"
	"testing"
)

func TestRestoreConflictMessage_TargetNotFound(t *testing.T) {
	err := newStage2RowValidationError("TARGET_NOT_FOUND", "target not found", stage2RowErrorRef{
		ProxyName: "HK 01",
	}, "targetName", nil)
	message := restoreConflictMessage(err)
	if message == "" || strings.Contains(message, "target not found") {
		t.Fatalf("expected business message, got %q", message)
	}
}

func TestBuildStage1ConvertMessages_IncludesSummary(t *testing.T) {
	target := "🇭🇰 香港节点"
	messages := buildStage1ConvertMessages(Stage2Init{
		Rows: []Stage2InitRow{
			{
				Mode:            "chain",
				TargetName:      &target,
			},
		},
		ForwardRelays: []ForwardRelay{{Name: "relay.example.com:7443"}},
	}, nil)

	if len(messages) < 2 {
		t.Fatalf("expected summary and auto-chain messages, got %v", messages)
	}
	if messages[0].Code != "STAGE1_CONVERT_SUMMARY" {
		t.Fatalf("first message code = %q, want STAGE1_CONVERT_SUMMARY", messages[0].Code)
	}
	if messages[1].Code != "AUTO_CHAIN_TARGET_SELECTED" {
		t.Fatalf("second message code = %q, want AUTO_CHAIN_TARGET_SELECTED", messages[1].Code)
	}
}
