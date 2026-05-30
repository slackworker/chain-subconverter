package api

import (
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestWriteOperationError_internalErrorDoesNotExposeCause(t *testing.T) {
	recorder := httptest.NewRecorder()
	request := httptest.NewRequest(http.MethodPost, "/api/generate", nil)
	writeOperationError(recorder, request, "POST /api/generate", errors.New("database connection refused: secret-host"))

	if recorder.Code != http.StatusInternalServerError {
		t.Fatalf("status = %d, want %d", recorder.Code, http.StatusInternalServerError)
	}

	var payload struct {
		BlockingErrors []struct {
			Code    string `json:"code"`
			Message string `json:"message"`
		} `json:"blockingErrors"`
	}
	if err := json.NewDecoder(recorder.Body).Decode(&payload); err != nil {
		t.Fatalf("decode response: %v", err)
	}
	if len(payload.BlockingErrors) != 1 {
		t.Fatalf("blockingErrors = %+v, want one entry", payload.BlockingErrors)
	}
	if payload.BlockingErrors[0].Code != "INTERNAL_ERROR" {
		t.Fatalf("code = %q, want INTERNAL_ERROR", payload.BlockingErrors[0].Code)
	}
	if payload.BlockingErrors[0].Message != internalErrorUserMessage {
		t.Fatalf("message = %q, want sanitized user message", payload.BlockingErrors[0].Message)
	}
	if payload.BlockingErrors[0].Message == "database connection refused: secret-host" {
		t.Fatal("internal error detail leaked to client")
	}
}
