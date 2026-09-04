package subconverter

import (
	"context"
	"errors"
	"net"
	"strings"
)

// UnavailableClassification is the resolved user-facing class of an unavailable error.
type UnavailableClassification struct {
	ProblemClass    UnavailableProblemClass
	UserInputSource UnavailableUserInputSource
	TimedOut        bool
}

// ClassifyUnavailable maps a conversion-pass failure to problem class and input source.
// Non-unavailable errors are treated as service_unreachable.
func ClassifyUnavailable(err error) UnavailableClassification {
	classification := UnavailableClassification{ProblemClass: UnavailableProblemServiceUnreachable}

	var unavailableErr *Error
	if !errors.As(err, &unavailableErr) {
		return classification
	}
	if classified, ok := classificationFromMetadata(unavailableErr); ok {
		return classified
	}

	op := strings.ToLower(strings.TrimSpace(unavailableErr.Op))
	cause := unavailableErr.Cause

	switch {
	case op == "acquire subconverter slot":
		classification.ProblemClass = UnavailableProblemServiceUnreachable
	case strings.Contains(op, "parse landing-discovery result") || strings.Contains(op, "validate landing-discovery names"):
		classification.ProblemClass = UnavailableProblemConversionResultInvalid
		classification.UserInputSource = UnavailableInputSourceLanding
	case strings.Contains(op, "parse transit-discovery result") || strings.Contains(op, "validate transit-discovery names"):
		classification.ProblemClass = UnavailableProblemConversionResultInvalid
		classification.UserInputSource = UnavailableInputSourceTransit
	case strings.Contains(op, "parse full-base") || strings.Contains(op, "validate full-base region proxy-groups"):
		classification.ProblemClass = UnavailableProblemConversionResultInvalid
		classification.UserInputSource = UnavailableInputSourceManagedTemplate
	case strings.Contains(op, "landing-discovery"):
		classification.UserInputSource = UnavailableInputSourceLanding
		classifyPassFailure(&classification, cause)
	case strings.Contains(op, "transit-discovery"):
		classification.UserInputSource = UnavailableInputSourceTransit
		classifyPassFailure(&classification, cause)
	case strings.Contains(op, "full-base"):
		classification.UserInputSource = UnavailableInputSourceStage1Input
		classifyPassFailure(&classification, cause)
	default:
		classifyPassFailure(&classification, cause)
	}

	return classification
}

func classificationFromMetadata(unavailableErr *Error) (UnavailableClassification, bool) {
	if unavailableErr == nil {
		return UnavailableClassification{}, false
	}

	metadata := unavailableErr.UnavailableMetadata()
	if metadata == (UnavailableMetadata{}) {
		return UnavailableClassification{}, false
	}

	classification := UnavailableClassification{
		ProblemClass:    metadata.ProblemClass,
		UserInputSource: metadata.UserInputSource,
	}
	if classification.ProblemClass == "" {
		classification.ProblemClass = UnavailableProblemServiceUnreachable
		classifyPassFailure(&classification, unavailableErr.Cause)
		return classification, true
	}
	if classification.ProblemClass == UnavailableProblemSourceFetchFailed && isUnavailableTimeout(unavailableErr.Cause) {
		classification.TimedOut = true
	}
	return classification, true
}

func classifyPassFailure(classification *UnavailableClassification, cause error) {
	if isUnavailableTimeout(cause) {
		classification.ProblemClass = UnavailableProblemSourceFetchFailed
		classification.TimedOut = true
		return
	}

	trimmedCause := strings.ToLower(strings.TrimSpace(errorMessage(cause)))
	switch {
	case strings.HasPrefix(trimmedCause, "unexpected http status "):
		classification.ProblemClass = UnavailableProblemSourceFetchFailed
	case trimmedCause == "empty response body":
		classification.ProblemClass = UnavailableProblemConversionResultInvalid
	default:
		classification.ProblemClass = UnavailableProblemServiceUnreachable
	}
}

func isUnavailableTimeout(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

func errorMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
