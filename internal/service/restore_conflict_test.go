package service

import "testing"

func TestRestoreConflictFromError_TargetNotFound(t *testing.T) {
	err := newStage2InstanceValidationError("TARGET_NOT_FOUND", "target not found", stage2InstanceErrorRef{
		SourceID:  "HK 02",
		ProxyName: "HK 02",
	}, "targetName", nil)

	conflict := RestoreConflictFromError(err)
	if conflict.ReasonCode != "TARGET_NOT_FOUND" {
		t.Fatalf("ReasonCode mismatch: got %q want %q", conflict.ReasonCode, "TARGET_NOT_FOUND")
	}
	if conflict.ReasonArgs["sourceId"] != "HK 02" {
		t.Fatalf("reasonArgs.sourceId mismatch: got %#v", conflict.ReasonArgs["sourceId"])
	}
	if conflict.ReasonArgs["proxyName"] != "HK 02" {
		t.Fatalf("reasonArgs.proxyName mismatch: got %#v", conflict.ReasonArgs["proxyName"])
	}
	if conflict.ReasonArgs["field"] != "targetName" {
		t.Fatalf("reasonArgs.field mismatch: got %#v", conflict.ReasonArgs["field"])
	}
}

func TestRestoreConflictFromError_GlobalError(t *testing.T) {
	err := newGlobalValidationError("STAGE2_ROWSET_MISMATCH", "stage2 rowset mismatch", nil)

	conflict := RestoreConflictFromError(err)
	if conflict.ReasonCode != "STAGE2_ROWSET_MISMATCH" {
		t.Fatalf("ReasonCode mismatch: got %q want %q", conflict.ReasonCode, "STAGE2_ROWSET_MISMATCH")
	}
	if conflict.ReasonArgs != nil {
		t.Fatalf("expected nil reasonArgs, got %#v", conflict.ReasonArgs)
	}
}

func TestRestoreConflictFromError_NonResponseError(t *testing.T) {
	conflict := RestoreConflictFromError(nil)
	if conflict.ReasonCode != "RESTORE_VALIDATION_FAILED" {
		t.Fatalf("ReasonCode mismatch: got %q want %q", conflict.ReasonCode, "RESTORE_VALIDATION_FAILED")
	}
}
