package main

import (
	"testing"
)

func TestActionOutputDir_UsesStageScopedOutputFolder(t *testing.T) {
	if got := actionOutputDir("/tmp/review-case", "stage1"); got != "/tmp/review-case/stage1/output" {
		t.Fatalf("actionOutputDir(stage1) = %q", got)
	}
	if got := actionOutputDir("/tmp/review-case", "stage2"); got != "/tmp/review-case/stage2/output" {
		t.Fatalf("actionOutputDir(stage2) = %q", got)
	}
}

func TestParseArgs_DefaultCaseDir(t *testing.T) {
	action, caseDir, publicBaseURL, maxLongURLLength, err := parseArgs([]string{"stage1"})
	if err != nil {
		t.Fatalf("parseArgs() error = %v", err)
	}
	if action != "stage1" {
		t.Fatalf("action = %q, want %q", action, "stage1")
	}
	if caseDir != "review/cases/3pass-ss2022-test-subscription" {
		t.Fatalf("caseDir = %q", caseDir)
	}
	if publicBaseURL != "http://localhost:11200" {
		t.Fatalf("publicBaseURL = %q", publicBaseURL)
	}
	if maxLongURLLength != 2048 {
		t.Fatalf("maxLongURLLength = %d", maxLongURLLength)
	}
}
