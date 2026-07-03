package service

// ValidateReplayability checks whether a restored snapshot can be replayed
// against the current discovery fixtures. It is the shared entry used by
// generate-time hard validation and resolve-time soft restoreStatus裁决.
func ValidateReplayability(stage1Input Stage1Input, stage2Snapshot Stage2Snapshot, fixtures ConversionFixtures) ([]resolvedLandingProxy, error) {
	return validateGenerateSnapshot(stage1Input, stage2Snapshot, fixtures)
}
