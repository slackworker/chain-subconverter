package service

import (
	"fmt"
	"strings"

	"github.com/slackworker/chain-subconverter/internal/inpututil"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

// InputLimits holds configurable boundaries for stage 1 input validation.
// These limits must be checked before forwarding any input to subconverter.
type InputLimits struct {
	MaxRequestURLLength int
	MaxURLsPerField     int
	SubconverterBaseURL string
}

// DefaultInputLimits returns the current spec-defined defaults: 16 KiB request budget, 32 inputs per field.
func DefaultInputLimits() InputLimits {
	return InputLimits{
		MaxRequestURLLength: 16384,
		MaxURLsPerField:     32,
	}
}

// ValidateStage1InputLimits checks stage 1 input against configurable size and URL count limits.
// Returns STAGE1_INPUT_TOO_LARGE or TOO_MANY_UPSTREAM_URLS blocking errors per 03-backend-api spec.
func ValidateStage1InputLimits(input Stage1Input, limits InputLimits) error {
	normalizedLanding := normalizeSubconverterURLInput(input.LandingRawText)
	normalizedTransit := normalizeSubconverterURLInput(input.TransitRawText)

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

	if limits.MaxRequestURLLength > 0 && strings.TrimSpace(limits.SubconverterBaseURL) != "" {
		requestURLs, err := subconverter.BuildRequestURLs(limits.SubconverterBaseURL, subconverter.Request{
			LandingRawText: input.LandingRawText,
			TransitRawText: input.TransitRawText,
			Options: subconverter.AdvancedOptions{
				Emoji:          input.AdvancedOptions.Emoji,
				UDP:            input.AdvancedOptions.UDP,
				SkipCertVerify: input.AdvancedOptions.SkipCertVerify,
				Config:         input.AdvancedOptions.Config,
				Include:        input.AdvancedOptions.Include,
				Exclude:        input.AdvancedOptions.Exclude,
			},
		})
		if err != nil {
			return newInternalResponseError("build subconverter request URLs", err)
		}

		if err := validateRequestURLLength("landing-discovery", requestURLs.LandingDiscovery, limits.MaxRequestURLLength, "landingRawText"); err != nil {
			return err
		}
		if err := validateRequestURLLength("transit-discovery", requestURLs.TransitDiscovery, limits.MaxRequestURLLength, "transitRawText"); err != nil {
			return err
		}
		if err := validateRequestURLLength("full-base", requestURLs.FullBase, limits.MaxRequestURLLength, identifyDominantField(normalizedLanding, normalizedTransit)); err != nil {
			return err
		}
	}

	return nil
}

func validateRequestURLLength(passName string, requestURL string, maxRequestURLLength int, field string) error {
	if len(requestURL) <= maxRequestURLLength {
		return nil
	}
	cause := fmt.Errorf("%s request URL length %d exceeds limit %d", passName, len(requestURL), maxRequestURLLength)
	return newStage1FieldValidationError("STAGE1_INPUT_TOO_LARGE", "stage1 input exceeds maximum size", field, cause)
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

func identifyDominantField(normalizedLanding string, normalizedTransit string) string {
	if normalizedLanding == "" {
		return "transitRawText"
	}
	if normalizedTransit == "" {
		return "landingRawText"
	}
	return identifyLargerField(normalizedLanding, normalizedTransit)
}
