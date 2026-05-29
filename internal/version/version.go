// Package version holds build metadata injected at compile time.
package version

// Version is a legacy fallback display string kept for local builds and older callers.
var Version = "dev"

// ReleaseTag carries the source control release tag, for example a release tag like vX.Y.Z-beta.N.
var ReleaseTag = ""

// ImageTag carries the deployed image tag, for example beta-latest.
var ImageTag = "dev"

// Revision carries the source commit SHA for the current build.
var Revision = ""

// DisplayVersion prefers the release tag, then the image tag, then the legacy fallback version.
func DisplayVersion() string {
	if ReleaseTag != "" {
		return ReleaseTag
	}
	if ImageTag != "" {
		return ImageTag
	}
	return Version
}
