package version

import "testing"

func TestDisplayVersionPrefersReleaseTag(t *testing.T) {
	originalVersion := Version
	originalReleaseTag := ReleaseTag
	originalImageTag := ImageTag
	t.Cleanup(func() {
		Version = originalVersion
		ReleaseTag = originalReleaseTag
		ImageTag = originalImageTag
	})

	Version = "legacy-dev"
	ReleaseTag = "v3.0.0-beta.2"
	ImageTag = "beta-latest"

	if got := DisplayVersion(); got != "v3.0.0-beta.2" {
		t.Fatalf("DisplayVersion() = %q, want v3.0.0-beta.2", got)
	}
}

func TestDisplayVersionFallsBackToImageTag(t *testing.T) {
	originalVersion := Version
	originalReleaseTag := ReleaseTag
	originalImageTag := ImageTag
	t.Cleanup(func() {
		Version = originalVersion
		ReleaseTag = originalReleaseTag
		ImageTag = originalImageTag
	})

	Version = "legacy-dev"
	ReleaseTag = ""
	ImageTag = "beta-latest"

	if got := DisplayVersion(); got != "beta-latest" {
		t.Fatalf("DisplayVersion() = %q, want beta-latest", got)
	}
}
