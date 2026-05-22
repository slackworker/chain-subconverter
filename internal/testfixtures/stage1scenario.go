package testfixtures

import (
	"encoding/json"
	"fmt"
	"net/url"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

const (
	LandingFileName         = "landing.txt"
	TransitFileName         = "transit.txt"
	ForwardRelaysFileName   = "forward-relays.txt"
	AdvancedOptionsFileName = "advanced-options.yaml"
)

type Stage1Scenario struct {
	SchemaVersion   int                  `json:"schemaVersion"`
	ScenarioID      string               `json:"scenarioID"`
	Stage1Input     CanonicalStage1Input `json:"stage1Input"`
	TransitFixtures []TransitFixture     `json:"transitFixtures,omitempty"`
	TemplateFixture *TemplateFixture     `json:"templateFixture,omitempty"`
	sourceDir       string
}

type CanonicalStage1Input struct {
	LandingItems      []string           `json:"landingItems"`
	ManualSocks5Items []ManualSocks5Item `json:"manualSocks5Items,omitempty"`
	TransitItems      []string           `json:"transitItems"`
	ForwardRelayItems []string           `json:"forwardRelayItems"`
	AdvancedOptions   AdvancedOptions    `json:"advancedOptions"`
}

type ManualSocks5Item struct {
	Name         string `json:"name"`
	Server       string `json:"server"`
	Port         int    `json:"port"`
	Username     string `json:"username,omitempty"`
	Password     string `json:"password,omitempty"`
	GeneratedURI string `json:"generatedURI"`
}

type TransitFixture struct {
	ID              string `json:"id"`
	SubscriptionURL string `json:"subscriptionURL"`
	URIContentFile  string `json:"uriContentFile"`
}

type TemplateFixture struct {
	InputURL              string `json:"inputURL"`
	RecommendedDefaultURL string `json:"recommendedDefaultURL,omitempty"`
	ContentFile           string `json:"contentFile"`
}

type AdvancedOptions struct {
	Emoji          *bool    `json:"emoji"`
	UDP            *bool    `json:"udp"`
	SkipCertVerify *bool    `json:"skipCertVerify"`
	Config         *string  `json:"config"`
	Include        []string `json:"include"`
	Exclude        []string `json:"exclude"`
}

type ReviewStage1Input struct {
	LandingRawText    string
	TransitRawText    string
	ForwardRelayItems []string
	AdvancedOptions   AdvancedOptions
}

type RenderedFile struct {
	Name    string
	Content string
}

func LoadStage1Scenario(filePath string) (Stage1Scenario, error) {
	content, err := os.ReadFile(filePath)
	if err != nil {
		return Stage1Scenario{}, fmt.Errorf("read %s: %w", filePath, err)
	}

	var scenario Stage1Scenario
	if err := json.Unmarshal(content, &scenario); err != nil {
		return Stage1Scenario{}, fmt.Errorf("parse %s: %w", filePath, err)
	}
	scenario.sourceDir = filepath.Dir(filePath)
	if err := scenario.Validate(); err != nil {
		return Stage1Scenario{}, fmt.Errorf("validate %s: %w", filePath, err)
	}

	return scenario, nil
}

func (scenario Stage1Scenario) Validate() error {
	if scenario.SchemaVersion != 1 {
		return fmt.Errorf("unsupported schemaVersion %d", scenario.SchemaVersion)
	}
	if strings.TrimSpace(scenario.ScenarioID) == "" {
		return fmt.Errorf("scenarioID must not be empty")
	}
	if err := scenario.Stage1Input.Validate(); err != nil {
		return err
	}
	if err := scenario.validateTransitFixtures(); err != nil {
		return err
	}
	if err := scenario.validateTemplateFixture(); err != nil {
		return err
	}
	return nil
}

func (input CanonicalStage1Input) Validate() error {
	if err := validateStringList("landingItems", input.LandingItems); err != nil {
		return err
	}
	for index, item := range input.ManualSocks5Items {
		if err := item.Validate(); err != nil {
			return fmt.Errorf("manualSocks5Items[%d]: %w", index, err)
		}
	}
	if err := validateStringList("transitItems", input.TransitItems); err != nil {
		return err
	}
	if err := validateStringList("forwardRelayItems", input.ForwardRelayItems); err != nil {
		return err
	}
	if err := input.AdvancedOptions.Validate(); err != nil {
		return err
	}
	return nil
}

func (item ManualSocks5Item) Validate() error {
	if strings.TrimSpace(item.Name) == "" {
		return fmt.Errorf("name must not be blank")
	}
	if strings.TrimSpace(item.Server) == "" {
		return fmt.Errorf("server must not be blank")
	}
	if item.Port < 1 || item.Port > 65535 {
		return fmt.Errorf("port must be 1-65535")
	}
	if (strings.TrimSpace(item.Username) == "") != (strings.TrimSpace(item.Password) == "") {
		return fmt.Errorf("username and password must either both be set or both be empty")
	}
	if strings.TrimSpace(item.GeneratedURI) == "" {
		return fmt.Errorf("generatedURI must not be blank")
	}
	expectedURI := item.BuildTelegramSocksURI()
	if item.GeneratedURI != expectedURI {
		return fmt.Errorf("generatedURI mismatch: got %q want %q", item.GeneratedURI, expectedURI)
	}
	return nil
}

func (item ManualSocks5Item) BuildTelegramSocksURI() string {
	parts := []string{
		"server=" + url.QueryEscape(strings.TrimSpace(item.Server)),
		"port=" + url.QueryEscape(strconv.Itoa(item.Port)),
		"remarks=" + url.QueryEscape(strings.TrimSpace(item.Name)),
	}
	if strings.TrimSpace(item.Username) != "" {
		parts = append(parts,
			"user="+url.QueryEscape(strings.TrimSpace(item.Username)),
			"pass="+url.QueryEscape(strings.TrimSpace(item.Password)),
		)
	}
	return "tg://socks?" + strings.Join(parts, "&")
}

func (options AdvancedOptions) Validate() error {
	if options.Config != nil && strings.TrimSpace(*options.Config) == "" {
		return fmt.Errorf("advancedOptions.config must not be blank when set")
	}
	if err := validateStringList("advancedOptions.include", options.Include); err != nil {
		return err
	}
	if err := validateStringList("advancedOptions.exclude", options.Exclude); err != nil {
		return err
	}
	return nil
}

func (input CanonicalStage1Input) ToReviewStage1Input() ReviewStage1Input {
	landingItems := append([]string{}, input.LandingItems...)
	landingItems = append(landingItems, input.ManualSocks5GeneratedURIs()...)

	return ReviewStage1Input{
		LandingRawText:    joinNormalizedLines(landingItems),
		TransitRawText:    joinNormalizedLines(input.TransitItems),
		ForwardRelayItems: normalizeForwardRelayItems(input.ForwardRelayItems),
		AdvancedOptions:   normalizeReviewAdvancedOptions(input.AdvancedOptions),
	}
}

func normalizeReviewAdvancedOptions(options AdvancedOptions) AdvancedOptions {
	normalized := AdvancedOptions{
		Include: normalizeStringList(options.Include),
		Exclude: normalizeStringList(options.Exclude),
	}
	if options.Emoji != nil {
		value := *options.Emoji
		normalized.Emoji = &value
	}
	if options.UDP != nil {
		value := *options.UDP
		normalized.UDP = &value
	}
	if options.SkipCertVerify != nil {
		value := *options.SkipCertVerify
		normalized.SkipCertVerify = &value
	}
	if options.Config != nil {
		trimmed := strings.TrimSpace(*options.Config)
		if trimmed != "" {
			normalized.Config = &trimmed
		}
	}
	return normalized
}

func (input CanonicalStage1Input) LandingRawText() string {
	return joinNormalizedLines(input.LandingItems)
}

func (input CanonicalStage1Input) ManualSocks5GeneratedURIs() []string {
	if len(input.ManualSocks5Items) == 0 {
		return nil
	}
	uris := make([]string, 0, len(input.ManualSocks5Items))
	for _, item := range input.ManualSocks5Items {
		uris = append(uris, item.GeneratedURI)
	}
	return uris
}

func (input CanonicalStage1Input) LandingRawTextWithManualSocks() string {
	items := append([]string{}, input.LandingItems...)
	items = append(items, input.ManualSocks5GeneratedURIs()...)
	return joinNormalizedLines(items)
}

func (input CanonicalStage1Input) TransitRawText() string {
	return joinNormalizedLines(input.TransitItems)
}

func RenderReviewStage1InputFiles(input CanonicalStage1Input) ([]RenderedFile, error) {
	if err := input.Validate(); err != nil {
		return nil, err
	}
	reviewStage1Input := input.ToReviewStage1Input()

	return []RenderedFile{
		{Name: LandingFileName, Content: renderRawTextFile(reviewStage1Input.LandingRawText)},
		{Name: TransitFileName, Content: renderRawTextFile(reviewStage1Input.TransitRawText)},
		{Name: ForwardRelaysFileName, Content: renderTextFile(reviewStage1Input.ForwardRelayItems)},
		{Name: AdvancedOptionsFileName, Content: renderAdvancedOptionsYAML(reviewStage1Input.AdvancedOptions)},
	}, nil
}

func renderRawTextFile(rawText string) string {
	if rawText == "" {
		return ""
	}
	return rawText + "\n"
}

func renderTextFile(items []string) string {
	joined := joinNormalizedLines(items)
	if joined == "" {
		return ""
	}
	return joined + "\n"
}

func renderAdvancedOptionsYAML(options AdvancedOptions) string {
	var builder strings.Builder
	writeBoolLine(&builder, "emoji", options.Emoji)
	writeBoolLine(&builder, "udp", options.UDP)
	writeBoolLine(&builder, "skipCertVerify", options.SkipCertVerify)
	writeStringLine(&builder, "config", options.Config)
	writeStringList(&builder, "include", options.Include)
	writeStringList(&builder, "exclude", options.Exclude)
	return builder.String()
}

func writeBoolLine(builder *strings.Builder, key string, value *bool) {
	builder.WriteString(key)
	builder.WriteString(":")
	if value != nil {
		builder.WriteString(" ")
		if *value {
			builder.WriteString("true")
		} else {
			builder.WriteString("false")
		}
	}
	builder.WriteString("\n")
}

func writeStringLine(builder *strings.Builder, key string, value *string) {
	builder.WriteString(key)
	builder.WriteString(":")
	if value != nil {
		builder.WriteString(" ")
		builder.WriteString(strings.TrimSpace(*value))
	}
	builder.WriteString("\n")
}

func writeStringList(builder *strings.Builder, key string, values []string) {
	builder.WriteString(key)
	builder.WriteString(":\n")
	for _, value := range normalizeStringList(values) {
		builder.WriteString("  - ")
		builder.WriteString(value)
		builder.WriteString("\n")
	}
}

func joinNormalizedLines(items []string) string {
	return strings.Join(normalizeStringList(items), "\n")
}

func normalizeStringList(items []string) []string {
	if len(items) == 0 {
		return nil
	}

	normalized := make([]string, 0, len(items))
	for _, item := range items {
		trimmed := strings.TrimSpace(strings.ReplaceAll(strings.ReplaceAll(item, "\r\n", "\n"), "\r", "\n"))
		if trimmed == "" {
			continue
		}
		normalized = append(normalized, trimmed)
	}
	if len(normalized) == 0 {
		return nil
	}
	return normalized
}

func normalizeForwardRelayItems(items []string) []string {
	normalized := normalizeStringList(items)
	if len(normalized) == 0 {
		return []string{}
	}
	return normalized
}

func validateStringList(field string, items []string) error {
	for index, item := range items {
		if strings.TrimSpace(item) == "" {
			return fmt.Errorf("%s[%d] must not be blank", field, index)
		}
	}
	return nil
}

func (scenario Stage1Scenario) ReadRelativeFile(relativePath string) (string, error) {
	if strings.TrimSpace(relativePath) == "" {
		return "", fmt.Errorf("relative path must not be blank")
	}
	if scenario.sourceDir == "" {
		return "", fmt.Errorf("scenario sourceDir is not set")
	}
	content, err := os.ReadFile(filepath.Join(scenario.sourceDir, filepath.FromSlash(relativePath)))
	if err != nil {
		return "", err
	}
	return string(content), nil
}

func (scenario Stage1Scenario) validateTransitFixtures() error {
	if len(scenario.TransitFixtures) == 0 {
		return nil
	}

	knownURLs := make(map[string]struct{}, len(scenario.Stage1Input.TransitItems))
	for _, transitItem := range scenario.Stage1Input.TransitItems {
		knownURLs[strings.TrimSpace(transitItem)] = struct{}{}
	}

	for index, fixture := range scenario.TransitFixtures {
		if strings.TrimSpace(fixture.ID) == "" {
			return fmt.Errorf("transitFixtures[%d].id must not be blank", index)
		}
		if strings.TrimSpace(fixture.SubscriptionURL) == "" {
			return fmt.Errorf("transitFixtures[%d].subscriptionURL must not be blank", index)
		}
		if _, ok := knownURLs[strings.TrimSpace(fixture.SubscriptionURL)]; !ok {
			return fmt.Errorf("transitFixtures[%d].subscriptionURL %q is not present in stage1Input.transitItems", index, fixture.SubscriptionURL)
		}
		if strings.TrimSpace(fixture.URIContentFile) == "" {
			return fmt.Errorf("transitFixtures[%d].uriContentFile must not be blank", index)
		}
		content, err := scenario.ReadRelativeFile(fixture.URIContentFile)
		if err != nil {
			return fmt.Errorf("transitFixtures[%d]: read uriContentFile: %w", index, err)
		}
		if strings.TrimSpace(content) == "" {
			return fmt.Errorf("transitFixtures[%d].uriContentFile must not be empty", index)
		}
	}
	return nil
}

func (scenario Stage1Scenario) validateTemplateFixture() error {
	if scenario.TemplateFixture == nil {
		return nil
	}
	fixture := scenario.TemplateFixture
	if strings.TrimSpace(fixture.InputURL) == "" {
		return fmt.Errorf("templateFixture.inputURL must not be blank")
	}
	if scenario.Stage1Input.AdvancedOptions.Config == nil || strings.TrimSpace(*scenario.Stage1Input.AdvancedOptions.Config) != strings.TrimSpace(fixture.InputURL) {
		return fmt.Errorf("templateFixture.inputURL must match stage1Input.advancedOptions.config")
	}
	if strings.TrimSpace(fixture.ContentFile) == "" {
		return fmt.Errorf("templateFixture.contentFile must not be blank")
	}
	content, err := scenario.ReadRelativeFile(fixture.ContentFile)
	if err != nil {
		return fmt.Errorf("templateFixture: read contentFile: %w", err)
	}
	if strings.TrimSpace(content) == "" {
		return fmt.Errorf("templateFixture.contentFile must not be empty")
	}
	return nil
}
