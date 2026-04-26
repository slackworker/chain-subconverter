package main

import (
	"net"
	"os"
	"path/filepath"
	"testing"
)

func TestListenManagedTemplateServerUsesIPv4(t *testing.T) {
	listener, err := listenManagedTemplateServer("0.0.0.0:0")
	if err != nil {
		t.Fatalf("listenManagedTemplateServer returned error: %v", err)
	}
	defer listener.Close()

	tcpAddr, ok := listener.Addr().(*net.TCPAddr)
	if !ok {
		t.Fatalf("listener addr type = %T, want *net.TCPAddr", listener.Addr())
	}
	if tcpAddr.IP == nil || tcpAddr.IP.To4() == nil {
		t.Fatalf("listener IP = %v, want IPv4 wildcard or IPv4 address", tcpAddr.IP)
	}
	if tcpAddr.Port == 0 {
		t.Fatal("listener port = 0, want assigned port")
	}
}

func TestResolveReviewCaseLoadsStage1InputFromCaseDir(t *testing.T) {
	caseDir := t.TempDir()
	stage1InputDir := filepath.Join(caseDir, "stage1", "input")
	if err := os.MkdirAll(stage1InputDir, 0o755); err != nil {
		t.Fatalf("os.MkdirAll(stage1 input) error = %v", err)
	}

	files := map[string]string{
		"landing.txt":           "landing-node\n",
		"transit.txt":           "transit-node\n",
		"forward-relays.txt":    "\n",
		"advanced-options.yaml": "emoji: true\nudp: true\n",
	}
	for name, content := range files {
		if err := os.WriteFile(filepath.Join(stage1InputDir, name), []byte(content), 0o644); err != nil {
			t.Fatalf("os.WriteFile(%q) error = %v", name, err)
		}
	}

	reviewCase, err := resolveReviewCase(reviewOptions{CaseDir: caseDir, CaseName: "manual live review"})
	if err != nil {
		t.Fatalf("resolveReviewCase() error = %v", err)
	}

	if reviewCase.Name != "manual-live-review" {
		t.Fatalf("reviewCase.Name = %q, want %q", reviewCase.Name, "manual-live-review")
	}
	if reviewCase.Stage1Input.LandingRawText != "landing-node" {
		t.Fatalf("LandingRawText = %q, want %q", reviewCase.Stage1Input.LandingRawText, "landing-node")
	}
	if reviewCase.Stage1Input.TransitRawText != "transit-node" {
		t.Fatalf("TransitRawText = %q, want %q", reviewCase.Stage1Input.TransitRawText, "transit-node")
	}
}

func TestResolveOutputDirectoryUsesCaseDirByDefault(t *testing.T) {
	caseDir := t.TempDir()

	outputDir, err := resolveOutputDirectory(reviewOptions{CaseDir: caseDir})
	if err != nil {
		t.Fatalf("resolveOutputDirectory() error = %v", err)
	}

	if outputDir != caseDir {
		t.Fatalf("outputDir = %q, want %q", outputDir, caseDir)
	}
}

func TestClearReviewArtifactsPreservesStage1Input(t *testing.T) {
	caseDir := t.TempDir()
	inputFile := filepath.Join(caseDir, "stage1", "input", "landing.txt")
	outputFile := filepath.Join(caseDir, "stage1", "output", "review-summary.md")
	stage2File := filepath.Join(caseDir, "stage2", "output", "generate.response.json")

	for path, content := range map[string]string{
		inputFile:  "landing\n",
		outputFile: "summary\n",
		stage2File: "{}\n",
	} {
		if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
			t.Fatalf("os.MkdirAll(%q) error = %v", filepath.Dir(path), err)
		}
		if err := os.WriteFile(path, []byte(content), 0o644); err != nil {
			t.Fatalf("os.WriteFile(%q) error = %v", path, err)
		}
	}

	if err := clearReviewArtifacts(caseDir); err != nil {
		t.Fatalf("clearReviewArtifacts() error = %v", err)
	}

	if _, err := os.Stat(inputFile); err != nil {
		t.Fatalf("os.Stat(inputFile) error = %v, want preserved file", err)
	}
	if _, err := os.Stat(outputFile); !os.IsNotExist(err) {
		t.Fatalf("os.Stat(outputFile) error = %v, want not exist", err)
	}
	if _, err := os.Stat(filepath.Join(caseDir, "stage2")); !os.IsNotExist(err) {
		t.Fatalf("os.Stat(stage2) error = %v, want not exist", err)
	}
}
