package subconverter

import (
	"errors"
	"fmt"
)

const CodeUnavailable = "SUBCONVERTER_UNAVAILABLE"

type Error struct {
	Code  string
	Op    string
	Cause error
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

func NewUnavailableError(op string, cause error) error {
	return &Error{
		Code:  CodeUnavailable,
		Op:    op,
		Cause: cause,
	}
}

func IsUnavailable(err error) bool {
	var scErr *Error
	return errors.As(err, &scErr) && scErr.Code == CodeUnavailable
}
