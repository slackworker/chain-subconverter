package subconverter

import "net/url"

type AdvancedOptions struct {
	Emoji          *bool
	UDP            *bool
	SkipCertVerify *bool
	Config         *string
	Include        []string
	Exclude        []string
}

type Request struct {
	LandingRawText string
	TransitRawText string
	Options        AdvancedOptions
	ExtraQuery     url.Values
	// UserAgent is the override sent as HTTP User-Agent when calling upstream subconverter.
	// Empty means use DefaultUserAgent. Upstream subconverter typically forwards this header
	// when fetching remote subscriptions.
	UserAgent string
}

type PassResult struct {
	RequestURL string
	YAML       string
}

type ThreePassResult struct {
	LandingDiscovery PassResult
	TransitDiscovery PassResult
	FullBase         PassResult
}
