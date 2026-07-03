package service

import "testing"

func TestRestoreConflictFromError_TargetNotFound(t *testing.T) {
	err := newStage2RowValidationError("TARGET_NOT_FOUND", "target not found", stage2RowErrorRef{
		RowID:     "HK 02",
		SourceLandingNodeName: "HK 02",
		ProxyName: "HK 02",
	}, "targetName", nil)

	conflict := RestoreConflictFromError(err)
	if conflict.ReasonCode != "TARGET_NOT_FOUND" {
		t.Fatalf("ReasonCode mismatch: got %q want %q", conflict.ReasonCode, "TARGET_NOT_FOUND")
	}
	if conflict.ReasonArgs["rowId"] != "HK 02" {
		t.Fatalf("reasonArgs.rowId mismatch: got %#v", conflict.ReasonArgs["rowId"])
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
