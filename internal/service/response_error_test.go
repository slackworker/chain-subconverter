package service

import (
	"errors"
	"testing"
)

func TestJoinResponseErrors_PreservesAllBlockingErrors(t *testing.T) {
	err := joinResponseErrors([]error{
		newStage2InstanceValidationError("TARGET_NOT_FOUND", "target not found", stage2InstanceErrorRef{
			SourceID:  "HK Landing",
			ProxyName: "HK Landing",
		}, "targetName", nil),
		newStage2InstanceValidationError("TARGET_NOT_FOUND", "target not found", stage2InstanceErrorRef{
			SourceID:  "HK Landing",
			ProxyName: "HK Landing 2",
		}, "targetName", nil),
	})
	blockingErrors := requireBlockingErrors(t, err)
	if len(blockingErrors) != 2 {
		t.Fatalf("BlockingErrors() len = %d, want 2: %#v", len(blockingErrors), blockingErrors)
	}
	if blockingErrors[0].Context["proxyName"] != "HK Landing" || blockingErrors[1].Context["proxyName"] != "HK Landing 2" {
		t.Fatalf("proxyName = (%#v, %#v)", blockingErrors[0].Context["proxyName"], blockingErrors[1].Context["proxyName"])
	}
}

func TestJoinResponseErrors_HardErrorWinsOverCollected(t *testing.T) {
	hardErr := errors.New("boom")
	err := joinResponseErrors([]error{
		newGlobalValidationError("STAGE2_ROWSET_MISMATCH", "stage2 instance set mismatch", nil),
		hardErr,
	})
	if !errors.Is(err, hardErr) {
		t.Fatalf("joinResponseErrors() = %v, want hard error", err)
	}
}
