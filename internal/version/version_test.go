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
	ReleaseTag = "v-test-release"
	ImageTag = "image-latest"

	if got := DisplayVersion(); got != "v-test-release" {
		t.Fatalf("DisplayVersion() = %q, want v-test-release", got)
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
	ImageTag = "image-latest"

	if got := DisplayVersion(); got != "image-latest" {
		t.Fatalf("DisplayVersion() = %q, want image-latest", got)
	}
}
