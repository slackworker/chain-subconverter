package service

import (
	"errors"
	"net/http"
)

type ResponseError struct {
	statusCode          int
	blockingError       BlockingError
	extraBlockingErrors []BlockingError
	cause               error
}

type stage2InstanceErrorRef struct {
	SourceID  string
	ProxyName string
}

type stage2ServerErrorRef struct {
	ServerKey string
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

func (err *ResponseError) BlockingErrors() []BlockingError {
	if err == nil {
		return nil
	}
	out := make([]BlockingError, 0, 1+len(err.extraBlockingErrors))
	out = append(out, err.blockingError)
	out = append(out, err.extraBlockingErrors...)
	return out
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
	return newGlobalValidationErrorContext(code, message, nil, cause)
}

func newGlobalValidationErrorContext(code string, message string, context map[string]any, cause error) error {
	return newResponseError(http.StatusUnprocessableEntity, code, message, "global", context, nil, cause)
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

func newStage2InstanceValidationError(code string, message string, ref stage2InstanceErrorRef, field string, cause error) error {
	return newResponseError(http.StatusUnprocessableEntity, code, message, "stage2_instance", newStage2InstanceErrorContext(ref, field), nil, cause)
}

func newStage2InstanceInvalidRequestError(message string, ref stage2InstanceErrorRef, field string, cause error) error {
	return newResponseError(http.StatusBadRequest, "INVALID_REQUEST", message, "stage2_instance", newStage2InstanceErrorContext(ref, field), nil, cause)
}

func newStage2InstanceErrorContext(ref stage2InstanceErrorRef, field string) map[string]any {
	context := map[string]any{}
	if ref.SourceID != "" {
		context["sourceId"] = ref.SourceID
	}
	if ref.ProxyName != "" {
		context["proxyName"] = ref.ProxyName
	}
	if field != "" {
		context["field"] = field
	}
	if len(context) == 0 {
		return nil
	}
	return context
}

func newStage2ServerValidationError(code string, message string, serverKey string, cause error) error {
	return newStage2ServerValidationErrorContext(code, message, serverKey, nil, cause)
}

func newStage2ServerValidationErrorContext(code string, message string, serverKey string, extra map[string]any, cause error) error {
	context := map[string]any{}
	if serverKey != "" {
		context["serverKey"] = serverKey
	}
	for key, value := range extra {
		if value == nil {
			continue
		}
		if text, ok := value.(string); ok && text == "" {
			continue
		}
		context[key] = value
	}
	if len(context) == 0 {
		context = nil
	}
	return newResponseError(http.StatusUnprocessableEntity, code, message, "stage2_server", context, nil, cause)
}

func newStage2ServerInvalidRequestError(message string, serverKey string, field string, cause error) error {
	context := map[string]any{}
	if serverKey != "" {
		context["serverKey"] = serverKey
	}
	if field != "" {
		context["field"] = field
	}
	return newResponseError(http.StatusBadRequest, "INVALID_REQUEST", message, "stage2_server", context, nil, cause)
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

func joinResponseErrors(errs []error) error {
	var first *ResponseError
	var extras []BlockingError
	for _, err := range errs {
		if err == nil {
			continue
		}
		responseErr, ok := AsResponseError(err)
		if !ok {
			return err
		}
		if first == nil {
			cloned := *responseErr
			first = &cloned
			extras = append(extras, cloned.extraBlockingErrors...)
			continue
		}
		extras = append(extras, responseErr.blockingError)
		extras = append(extras, responseErr.extraBlockingErrors...)
	}
	if first == nil {
		return nil
	}
	first.extraBlockingErrors = extras
	return first
}
