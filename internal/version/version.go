// Package version holds the application release identifier injected at build time.
package version

// Version is set via -ldflags; defaults to "dev" for local builds.
var Version = "dev"
