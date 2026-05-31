package subconverter

import (
	"errors"
	"fmt"
)

const CodeUnavailable = "SUBCONVERTER_UNAVAILABLE"

type UnavailableProblemClass string

const (
	UnavailableProblemServiceUnreachable      UnavailableProblemClass = "service_unreachable"
	UnavailableProblemSourceFetchFailed       UnavailableProblemClass = "source_fetch_failed"
	UnavailableProblemConversionResultInvalid UnavailableProblemClass = "conversion_result_invalid"
)

type UnavailableUserInputSource string

const (
	UnavailableInputSourceLanding         UnavailableUserInputSource = "landing"
	UnavailableInputSourceTransit         UnavailableUserInputSource = "transit"
	UnavailableInputSourceStage1Input     UnavailableUserInputSource = "stage1_input"
	UnavailableInputSourceManagedTemplate UnavailableUserInputSource = "managed_template"
)

type UnavailableMetadata struct {
	ProblemClass    UnavailableProblemClass
	UserInputSource UnavailableUserInputSource
}

type UnavailableErrorOption func(*Error)

type Error struct {
	Code        string
	Op          string
	Cause       error
	unavailable UnavailableMetadata
}

func (err *Error) Error() string {
	switch {
	case err == nil:
		return "<nil>"
	case err.Op != "" && err.Cause != nil:
		return fmt.Sprintf("%s: %s: %v", err.Code, err.Op, err.Cause)
	case err.Op != "":
		return fmt.Sprintf("%s: %s", err.Code, err.Op)
	case err.Cause != nil:
		return fmt.Sprintf("%s: %v", err.Code, err.Cause)
	default:
		return err.Code
	}
}

func (err *Error) Unwrap() error {
	if err == nil {
		return nil
	}
	return err.Cause
}

func (err *Error) UnavailableMetadata() UnavailableMetadata {
	if err == nil {
		return UnavailableMetadata{}
	}
	return err.unavailable
}

func WithUnavailableUserInputSource(source UnavailableUserInputSource) UnavailableErrorOption {
	return func(err *Error) {
		err.unavailable.UserInputSource = source
	}
}

func WithUnavailableClassification(problemClass UnavailableProblemClass, userInputSource UnavailableUserInputSource) UnavailableErrorOption {
	return func(err *Error) {
		err.unavailable.ProblemClass = problemClass
		err.unavailable.UserInputSource = userInputSource
	}
}

func NewUnavailableError(op string, cause error, options ...UnavailableErrorOption) error {
	err := &Error{
		Code:  CodeUnavailable,
		Op:    op,
		Cause: cause,
	}
	for _, option := range options {
		if option == nil {
			continue
		}
		option(err)
	}
	return err
}

func IsUnavailable(err error) bool {
	var scErr *Error
	return errors.As(err, &scErr) && scErr.Code == CodeUnavailable
}
