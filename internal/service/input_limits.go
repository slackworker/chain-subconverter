package service

import (
	"fmt"
	"strings"

	"github.com/slackworker/chain-subconverter/internal/inpututil"
)

// InputLimits holds configurable boundaries for stage 1 input validation.
// These limits must be checked before forwarding any input to subconverter.
type InputLimits struct {
	MaxInputSize    int // Max total byte size of normalized landingRawText + transitRawText.
	MaxURLsPerField int // Max URL count per input field (landingRawText, transitRawText).
}

// DefaultInputLimits returns the spec-defined defaults: 2048 bytes total, 20 URLs per field.
func DefaultInputLimits() InputLimits {
	return InputLimits{
		MaxInputSize:    2048,
		MaxURLsPerField: 20,
	}
}

// ValidateStage1InputLimits checks stage 1 input against configurable size and URL count limits.
// Returns STAGE1_INPUT_TOO_LARGE or TOO_MANY_UPSTREAM_URLS blocking errors per 03-backend-api spec.
func ValidateStage1InputLimits(input Stage1Input, limits InputLimits) error {
	normalizedLanding := normalizeSubconverterURLInput(input.LandingRawText)
	normalizedTransit := normalizeSubconverterURLInput(input.TransitRawText)

	totalSize := len(normalizedLanding) + len(normalizedTransit)
	if limits.MaxInputSize > 0 && totalSize > limits.MaxInputSize {
		field := identifyLargerField(normalizedLanding, normalizedTransit)
		cause := fmt.Errorf("normalized input total size %d exceeds limit %d", totalSize, limits.MaxInputSize)
		return newStage1FieldValidationError("STAGE1_INPUT_TOO_LARGE", "stage1 input exceeds maximum size", field, cause)
	}

	if limits.MaxURLsPerField > 0 {
		landingCount := countInputLines(normalizedLanding)
		if landingCount > limits.MaxURLsPerField {
			cause := fmt.Errorf("landingRawText contains %d URLs, limit is %d", landingCount, limits.MaxURLsPerField)
			return newStage1FieldValidationError("TOO_MANY_UPSTREAM_URLS", "too many upstream URLs", "landingRawText", cause)
		}
		transitCount := countInputLines(normalizedTransit)
		if transitCount > limits.MaxURLsPerField {
			cause := fmt.Errorf("transitRawText contains %d URLs, limit is %d", transitCount, limits.MaxURLsPerField)
			return newStage1FieldValidationError("TOO_MANY_UPSTREAM_URLS", "too many upstream URLs", "transitRawText", cause)
		}
	}

	return nil
}

// normalizeSubconverterURLInput normalizes raw text input: trims leading/trailing whitespace
// on each line, removes blank lines, and joins with pipe separator.
func normalizeSubconverterURLInput(raw string) string {
	return inpututil.NormalizeURLText(raw)
}

// countInputLines counts the number of non-empty lines in raw text input.
func countInputLines(normalizedInput string) int {
	if normalizedInput == "" {
		return 0
	}
	return strings.Count(normalizedInput, "|") + 1
}

// identifyLargerField returns the field name of the larger input.
func identifyLargerField(normalizedLanding string, normalizedTransit string) string {
	if len(normalizedLanding) >= len(normalizedTransit) {
		return "landingRawText"
	}
	return "transitRawText"
}
