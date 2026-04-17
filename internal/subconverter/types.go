package subconverter

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
