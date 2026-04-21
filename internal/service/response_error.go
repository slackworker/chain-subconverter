package service

import (
	"errors"
	"net/http"
)

type ResponseError struct {
	statusCode    int
	blockingError BlockingError
	cause         error
}

func (err *ResponseError) Error() string {
	if err == nil {
		return "<nil>"
	}
	if err.cause != nil {
		return err.cause.Error()
	}
	return err.blockingError.Message
}

func (err *ResponseError) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.cause
}

func (err *ResponseError) StatusCode() int {
	if err == nil {
		return http.StatusInternalServerError
	}
	return err.statusCode
}

func (err *ResponseError) BlockingError() BlockingError {
	if err == nil {
		return BlockingError{}
	}
	return err.blockingError
}

func AsResponseError(err error) (*ResponseError, bool) {
	var responseErr *ResponseError
	if !errors.As(err, &responseErr) {
		return nil, false
	}
	return responseErr, true
}

func newResponseError(statusCode int, code string, message string, scope string, context map[string]any, retryable *bool, cause error) error {
	return &ResponseError{
		statusCode: statusCode,
		blockingError: BlockingError{
			Code:      code,
			Message:   message,
			Scope:     scope,
			Retryable: retryable,
			Context:   context,
		},
		cause: cause,
	}
}

func newGlobalValidationError(code string, message string, cause error) error {
	return newResponseError(http.StatusUnprocessableEntity, code, message, "global", nil, nil, cause)
}

func newStage1FieldValidationError(code string, message string, field string, cause error) error {
	return newResponseError(http.StatusUnprocessableEntity, code, message, "stage1_field", map[string]any{"field": field}, nil, cause)
}

func newInvalidRequestError(message string, cause error) error {
	return newResponseError(http.StatusBadRequest, "INVALID_REQUEST", message, "global", nil, nil, cause)
}

func newStage1FieldInvalidRequestError(message string, field string, cause error) error {
	return newResponseError(http.StatusBadRequest, "INVALID_REQUEST", message, "stage1_field", map[string]any{"field": field}, nil, cause)
}

func newStage2RowValidationError(code string, message string, landingNodeName string, field string, cause error) error {
	context := map[string]any{"landingNodeName": landingNodeName}
	if field != "" {
		context["field"] = field
	}
	return newResponseError(http.StatusUnprocessableEntity, code, message, "stage2_row", context, nil, cause)
}

func newStage2RowInvalidRequestError(message string, landingNodeName string, field string, cause error) error {
	context := map[string]any{"landingNodeName": landingNodeName}
	if field != "" {
		context["field"] = field
	}
	return newResponseError(http.StatusBadRequest, "INVALID_REQUEST", message, "stage2_row", context, nil, cause)
}

func newStage3FieldValidationError(code string, message string, field string, cause error) error {
	return newResponseError(http.StatusUnprocessableEntity, code, message, "stage3_field", map[string]any{"field": field}, nil, cause)
}

func newStage3FieldInvalidRequestError(message string, field string, cause error) error {
	return newResponseError(http.StatusBadRequest, "INVALID_REQUEST", message, "stage3_field", map[string]any{"field": field}, nil, cause)
}

func newStage3ActionValidationError(code string, message string, action string, cause error) error {
	context := map[string]any{}
	if action != "" {
		context["action"] = action
	}
	return newResponseError(http.StatusUnprocessableEntity, code, message, "stage3_action", context, nil, cause)
}

func newInternalResponseError(message string, cause error) error {
	return newResponseError(http.StatusInternalServerError, "INTERNAL_ERROR", message, "global", nil, nil, cause)
}
