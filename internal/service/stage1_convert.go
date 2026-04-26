package service

import (
	"bufio"
	"fmt"
	"sort"
	"strconv"
	"strings"
	"unicode/utf8"

	"github.com/dlclark/regexp2"
	"github.com/slackworker/chain-subconverter/internal/inpututil"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

type AdvancedOptions struct {
	Emoji          *bool    `json:"emoji"`
	UDP            *bool    `json:"udp"`
	SkipCertVerify *bool    `json:"skipCertVerify"`
	Config         *string  `json:"config"`
	Include        []string `json:"include"`
	Exclude        []string `json:"exclude"`
}

type Stage1Input struct {
	LandingRawText    string          `json:"landingRawText"`
	TransitRawText    string          `json:"transitRawText"`
	ForwardRelayItems []string        `json:"forwardRelayItems"`
	AdvancedOptions   AdvancedOptions `json:"advancedOptions"`
}

type Stage1ConvertRequest struct {
	Stage1Input Stage1Input `json:"stage1Input"`
}

func NormalizeStage1Input(input Stage1Input) Stage1Input {
	input.AdvancedOptions = normalizeAdvancedOptions(input.AdvancedOptions)
	input.ForwardRelayItems = normalizeForwardRelayItems(input.ForwardRelayItems)
	return input
}

func normalizeForwardRelayItems(items []string) []string {
	if len(items) == 0 {
		return []string{}
	}

	normalized := make([]string, 0, len(items))
	for _, item := range items {
		if item == "" {
			continue
		}
		normalized = append(normalized, item)
	}
	if len(normalized) == 0 {
		return []string{}
	}
	return normalized
}

func normalizeAdvancedOptions(options AdvancedOptions) AdvancedOptions {
	options.Config = normalizeOptionalString(options.Config)
	options.Include = normalizeOptionalStringList(options.Include)
	options.Exclude = normalizeOptionalStringList(options.Exclude)
	return options
}

func normalizeOptionalString(value *string) *string {
	if value == nil {
		return nil
	}

	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}

	return &trimmed
}

func normalizeOptionalStringList(values []string) []string {
	if len(values) == 0 {
		return nil
	}

	normalized := make([]string, 0, len(values))
	for _, value := range values {
		trimmed := strings.TrimSpace(value)
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

type Stage2SnapshotFixture struct {
	Stage2Snapshot Stage2Snapshot `json:"stage2Snapshot"`
}

type Stage2Snapshot struct {
	Rows []Stage2Row `json:"rows"`
}

type Stage2Init struct {
	AvailableModes []string        `json:"availableModes"`
	ChainTargets   []ChainTarget   `json:"chainTargets"`
	ForwardRelays  []ForwardRelay  `json:"forwardRelays"`
	Rows           []Stage2InitRow `json:"rows"`
}

type Stage2Row struct {
	LandingNodeName string                     `json:"landingNodeName"`
	Mode            string                     `json:"mode"`
	TargetName      *string                    `json:"targetName"`
	RestrictedModes map[string]ModeRestriction `json:"restrictedModes,omitempty"`
}

type Stage2InitRow struct {
	LandingNodeName string                     `json:"landingNodeName"`
	LandingNodeType string                     `json:"landingNodeType"`
	Mode            string                     `json:"mode"`
	TargetName      *string                    `json:"targetName"`
	RestrictedModes map[string]ModeRestriction `json:"restrictedModes,omitempty"`
	ModeWarnings    map[string]ModeRestriction `json:"modeWarnings,omitempty"`
}

type ModeRestriction struct {
	ReasonCode string `json:"reasonCode"`
	ReasonText string `json:"reasonText"`
}

type ChainTarget struct {
	Name    string `json:"name"`
	Kind    string `json:"kind"`
	IsEmpty bool   `json:"isEmpty,omitempty"`
}

type ForwardRelay struct {
	Name string `json:"name"`
}

type ConversionFixtures struct {
	LandingDiscoveryYAML       string
	TransitDiscoveryYAML       string
	FullBaseYAML               string
	TemplateConfig             string
	EffectiveTemplateURL       string
	ManagedTemplateURL         string
	RecognizedRegionGroupNames []string
}

type inlineProxy struct {
	Name string
	Type string
	Raw  string
}

type resolvedLandingProxy struct {
	Name         string
	TypeLabel    string
	ProtocolType string
	Port         int
}

type proxyGroup struct {
	Name    string
	Type    string
	Proxies []string
}

type regionMatcher struct {
	TargetName string
	Pattern    *regexp2.Regexp
}

const recommendedChainLandingPortMax = 10000

func BuildStage2Init(stage1Input Stage1Input, fixtures ConversionFixtures) (Stage2Init, error) {
	stage1Input = NormalizeStage1Input(stage1Input)
	return buildStage2Init(stage1Input, fixtures, loadRegionMatchers)
}

func buildStage2Init(stage1Input Stage1Input, fixtures ConversionFixtures, regionMatcherLoader func(string) ([]regionMatcher, error)) (Stage2Init, error) {
	landingProxies, err := parseInlineProxyList(fixtures.LandingDiscoveryYAML)
	if err != nil {
		return Stage2Init{}, fmt.Errorf("parse landing discovery fixture: %w", err)
	}

	transitProxies, err := parseInlineProxyList(fixtures.TransitDiscoveryYAML)
	if err != nil {
		return Stage2Init{}, fmt.Errorf("parse transit discovery fixture: %w", err)
	}

	fullBaseGroups, err := parseProxyGroups(fixtures.FullBaseYAML)
	if err != nil {
		return Stage2Init{}, fmt.Errorf("parse full-base fixture: %w", err)
	}
	fullBaseProxies, err := parseInlineProxyList(fixtures.FullBaseYAML)
	if err != nil {
		return Stage2Init{}, fmt.Errorf("parse full-base fixture proxies: %w", err)
	}

	resolvedLandingProxies, err := resolveLandingDiscoveryProxies(landingProxies, fullBaseProxies)
	if err != nil {
		return Stage2Init{}, err
	}

	landingNames := make(map[string]struct{}, len(resolvedLandingProxies))
	for _, proxy := range resolvedLandingProxies {
		landingNames[proxy.Name] = struct{}{}
	}

	regionMatchers, err := regionMatcherLoader(fixtures.TemplateConfig)
	if err != nil {
		return Stage2Init{}, newInternalResponseError("failed to load region matchers", fmt.Errorf("load region matchers: %w", err))
	}

	chainTargets, err := buildChainTargets(regionMatchers, landingNames, transitProxies, fullBaseGroups)
	if err != nil {
		return Stage2Init{}, err
	}

	forwardRelays, err := parseForwardRelays(stage1Input)
	if err != nil {
		return Stage2Init{}, err
	}

	hasChainMode := hasSelectableChainTargets(chainTargets)
	hasPortForwardMode := len(forwardRelays) > 0

	availableModes := []string{"none"}
	if hasChainMode {
		availableModes = append(availableModes, "chain")
	}
	if hasPortForwardMode {
		availableModes = append(availableModes, "port_forward")
	}

	chainTargetNames := make(map[string]struct{}, len(chainTargets))
	for _, target := range chainTargets {
		if target.IsEmpty {
			continue
		}
		chainTargetNames[target.Name] = struct{}{}
	}
	rows := make([]Stage2InitRow, 0, len(resolvedLandingProxies))
	for _, landing := range resolvedLandingProxies {
		row := Stage2InitRow{
			LandingNodeName: landing.Name,
			LandingNodeType: landing.TypeLabel,
			Mode:            "none",
			TargetName:      nil,
		}
		restrictedModes := buildRestrictedModes(landing.ProtocolType, availableModes)
		if len(restrictedModes) > 0 {
			row.RestrictedModes = restrictedModes
		}
		modeWarnings := buildModeWarnings(landing.ProtocolType, landing.Port, availableModes)
		if len(modeWarnings) > 0 {
			row.ModeWarnings = modeWarnings
		}

		finalAvailableModes := filterRestrictedModes(availableModes, restrictedModes)
		if containsString(finalAvailableModes, "chain") {
			targetName, ok, err := detectDefaultChainTarget(landing.Name, regionMatchers, chainTargetNames)
			if err != nil {
				return Stage2Init{}, newInternalResponseError(
					"failed to detect default chain target",
					fmt.Errorf("detect default chain target for %q: %w", landing.Name, err),
				)
			}
			if ok {
				row.Mode = "chain"
				row.TargetName = stringPtr(targetName)
			}
		} else if containsString(finalAvailableModes, "port_forward") {
			row.Mode = "port_forward"
		}

		rows = append(rows, row)
	}

	return Stage2Init{
		AvailableModes: availableModes,
		ChainTargets:   chainTargets,
		ForwardRelays:  forwardRelays,
		Rows:           rows,
	}, nil
}

func buildChainTargets(regionMatchers []regionMatcher, landingNames map[string]struct{}, transitProxies []inlineProxy, fullBaseGroups map[string]proxyGroup) ([]ChainTarget, error) {
	seen := make(map[string]struct{})
	chainTargets := make([]ChainTarget, 0, len(regionMatchers)+len(transitProxies))

	for _, matcher := range regionMatchers {
		groupName := matcher.TargetName
		group, ok := fullBaseGroups[groupName]
		if !ok {
			return nil, subconverter.NewUnavailableError(
				"validate full-base region proxy-groups",
				fmt.Errorf(
					`missing recognized region proxy-group %q in full-base result; subconverter did not successfully fetch or apply the managed template`,
					groupName,
				),
			)
		}

		memberCount := 0
		for _, member := range group.Proxies {
			if member == "DIRECT" {
				continue
			}
			if _, isLanding := landingNames[member]; isLanding {
				continue
			}
			memberCount++
		}

		if memberCount == 0 {
			chainTargets = append(chainTargets, ChainTarget{
				Name:    groupName,
				Kind:    "proxy-groups",
				IsEmpty: true,
			})
			seen[groupName] = struct{}{}
			continue
		}

		chainTargets = append(chainTargets, ChainTarget{
			Name: groupName,
			Kind: "proxy-groups",
		})
		seen[groupName] = struct{}{}
	}

	for _, proxy := range transitProxies {
		if _, exists := seen[proxy.Name]; exists {
			cause := fmt.Errorf("chain target name conflict: %q", proxy.Name)
			return nil, newGlobalValidationError("CHAIN_TARGET_NAME_CONFLICT", "chain target name conflict", cause)
		}
		chainTargets = append(chainTargets, ChainTarget{
			Name: proxy.Name,
			Kind: "proxies",
		})
		seen[proxy.Name] = struct{}{}
	}

	return chainTargets, nil
}

func hasSelectableChainTargets(chainTargets []ChainTarget) bool {
	for _, target := range chainTargets {
		if target.IsEmpty {
			continue
		}
		return true
	}
	return false
}

func detectDefaultChainTarget(landingNodeName string, matchers []regionMatcher, chainTargetNames map[string]struct{}) (string, bool, error) {
	matches := make([]string, 0, 1)
	for _, matcher := range matchers {
		matched, err := matcher.Pattern.MatchString(landingNodeName)
		if err != nil {
			return "", false, fmt.Errorf("match region %q: %w", matcher.TargetName, err)
		}
		if !matched {
			continue
		}
		matches = append(matches, matcher.TargetName)
	}

	if len(matches) != 1 {
		return "", false, nil
	}

	targetName := matches[0]
	if _, exists := chainTargetNames[targetName]; !exists {
		return "", false, nil
	}

	return targetName, true, nil
}

func parseForwardRelays(stage1Input Stage1Input) ([]ForwardRelay, error) {
	seen := make(map[string]struct{})
	relays := make([]ForwardRelay, 0, len(stage1Input.ForwardRelayItems))
	for _, item := range stage1Input.ForwardRelayItems {
		relay, err := parseForwardRelayLine(item)
		if err != nil {
			return nil, newStage1FieldValidationError("INVALID_FORWARD_RELAY_LINE", "invalid forward relay line", "forwardRelayItems", err)
		}
		if _, exists := seen[relay.Name]; exists {
			cause := fmt.Errorf("duplicate forward relay %q", relay.Name)
			return nil, newStage1FieldValidationError("DUPLICATE_FORWARD_RELAY", "duplicate forward relay", "forwardRelayItems", cause)
		}
		seen[relay.Name] = struct{}{}
		relays = append(relays, ForwardRelay{Name: relay.Name})
	}

	return relays, nil
}

func buildRestrictedModes(_ string, _ []string) map[string]ModeRestriction {
	return nil
}

func buildModeWarnings(landingProtocolType string, landingPort int, availableModes []string) map[string]ModeRestriction {
	if !containsString(availableModes, "chain") {
		return nil
	}
	reasonCode, reasonText := buildChainModeWarning(landingProtocolType, landingPort)
	if reasonCode == "" {
		return nil
	}
	return map[string]ModeRestriction{
		"chain": {
			ReasonCode: reasonCode,
			ReasonText: reasonText,
		},
	}
}

func buildChainModeWarning(landingProtocolType string, landingPort int) (string, string) {
	protocolWarning := isDiscouragedChainLandingProtocol(landingProtocolType)
	portWarning := landingPort > recommendedChainLandingPortMax

	switch {
	case protocolWarning && portWarning:
		return "DISCOURAGED_BY_LANDING_PROTOCOL_AND_PORT", protocolChainWarningText() + "；" + chainHighPortWarningText(landingPort)
	case protocolWarning:
		return "DISCOURAGED_BY_LANDING_PROTOCOL", protocolChainWarningText()
	case portWarning:
		return "DISCOURAGED_BY_LANDING_PORT", chainHighPortWarningText(landingPort)
	default:
		return "", ""
	}

}

func protocolChainWarningText() string {
	return "落地节点若无特殊需求勿选 UDP 类（Hy2/TUIC/WireGuard）与 TLS 伪装（Reality/ShadowTLS），订阅可能无法贯通；建议 SS（AEAD）或 VMess"
}

func chainHighPortWarningText(landingPort int) string {
	return fmt.Sprintf(
		"当前落地节点端口为 %d；若选择链式代理，建议使用 %d 以内端口，避免部分机场对 %d 以上高位端口进行屏蔽导致不通",
		landingPort,
		recommendedChainLandingPortMax,
		recommendedChainLandingPortMax,
	)
}

func resolveLandingDiscoveryProxies(landingProxies []inlineProxy, fullBaseProxies []inlineProxy) ([]resolvedLandingProxy, error) {
	// Stage 2 identity/type come from landing-discovery, but endpoint fields used by
	// later rules must come from the uniquely matched full-base proxy so they stay
	// aligned with the base config that generate/restore paths actually mutate.
	fullBaseNameCounts := make(map[string]int, len(fullBaseProxies))
	fullBaseProxyByName := make(map[string]inlineProxy, len(fullBaseProxies))
	for _, proxy := range fullBaseProxies {
		fullBaseNameCounts[proxy.Name]++
		if _, exists := fullBaseProxyByName[proxy.Name]; !exists {
			fullBaseProxyByName[proxy.Name] = proxy
		}
	}

	resolved := make([]resolvedLandingProxy, 0, len(landingProxies))
	for _, proxy := range landingProxies {
		resolvedName, typeLabel, port, err := resolveLandingDiscoveryName(proxy, fullBaseNameCounts, fullBaseProxyByName)
		if err != nil {
			return nil, err
		}
		resolved = append(resolved, resolvedLandingProxy{
			Name:         resolvedName,
			TypeLabel:    typeLabel,
			ProtocolType: proxy.Type,
			Port:         port,
		})
	}

	return resolved, nil
}

func resolveLandingDiscoveryName(proxy inlineProxy, fullBaseNameCounts map[string]int, fullBaseProxyByName map[string]inlineProxy) (string, string, int, error) {
	resolvedName := proxy.Name
	count := fullBaseNameCounts[resolvedName]
	if count == 1 {
		return resolvedName, formatLandingNodeTypeLabel(proxy.Type), extractInlineProxyPort(fullBaseProxyByName[resolvedName]), nil
	}
	if count > 1 {
		cause := fmt.Errorf("landing discovery proxy %q matches %d full-base proxies", resolvedName, count)
		return "", "", 0, subconverter.NewUnavailableError("validate landing-discovery names", cause)
	}
	cause := fmt.Errorf("landing discovery proxy %q is missing from full-base result", resolvedName)
	return "", "", 0, subconverter.NewUnavailableError("validate landing-discovery names", cause)
}

func extractInlineProxyPort(proxy inlineProxy) int {
	portText, err := extractInlineField(proxy.Raw, "port")
	if err != nil {
		return 0
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		return 0
	}
	return port
}

func formatLandingNodeTypeLabel(protocolType string) string {
	switch protocolType {
	case "ss":
		return "SS"
	case "ssr":
		return "SSR"
	case "socks5":
		return "SOCKS5"
	case "http":
		return "HTTP"
	case "https":
		return "HTTPS"
	case "vmess":
		return "VMess"
	case "vless":
		return "VLESS"
	case "vless-reality":
		return "Reality"
	case "trojan":
		return "Trojan"
	case "hysteria":
		return "Hysteria"
	case "hysteria2":
		return "Hysteria2"
	case "tuic":
		return "TUIC"
	case "wireguard":
		return "WireGuard"
	case "snell":
		return "Snell"
	case "anytls":
		return "AnyTLS"
	case "shadowtls":
		return "ShadowTLS"
	default:
		return strings.TrimSpace(protocolType)
	}
}

func isDiscouragedChainLandingProtocol(protocolType string) bool {
	switch protocolType {
	case "hysteria", "hysteria2", "tuic", "wireguard", "anytls", "vless-reality", "shadowtls":
		return true
	default:
		return false
	}
}

func filterRestrictedModes(availableModes []string, restrictedModes map[string]ModeRestriction) []string {
	if len(restrictedModes) == 0 {
		return availableModes
	}
	filtered := make([]string, 0, len(availableModes))
	for _, mode := range availableModes {
		if _, blocked := restrictedModes[mode]; blocked {
			continue
		}
		filtered = append(filtered, mode)
	}
	return filtered
}

type parsedForwardRelay struct {
	Name   string
	Server string
	Port   string
}

func parseForwardRelayLine(line string) (parsedForwardRelay, error) {
	if line != strings.TrimSpace(line) {
		return parsedForwardRelay{}, fmt.Errorf("invalid forward relay line %q", line)
	}
	if strings.Count(line, ":") != 1 {
		return parsedForwardRelay{}, fmt.Errorf("invalid forward relay line %q", line)
	}

	server, portText, found := strings.Cut(line, ":")
	if !found || server == "" || portText == "" {
		return parsedForwardRelay{}, fmt.Errorf("invalid forward relay line %q", line)
	}

	normalizedServer, err := normalizeForwardRelayServer(server)
	if err != nil {
		return parsedForwardRelay{}, fmt.Errorf("invalid forward relay line %q", line)
	}
	normalizedPort, err := normalizeForwardRelayPort(portText)
	if err != nil {
		return parsedForwardRelay{}, fmt.Errorf("invalid forward relay line %q", line)
	}

	return parsedForwardRelay{
		Name:   normalizedServer + ":" + normalizedPort,
		Server: normalizedServer,
		Port:   normalizedPort,
	}, nil
}

func normalizeForwardRelayServer(server string) (string, error) {
	if isStrictIPv4Literal(server) {
		return server, nil
	}
	if isDigitsAndDots(server) {
		return "", fmt.Errorf("invalid ipv4")
	}
	if !isValidASCIIHostname(server) {
		return "", fmt.Errorf("invalid hostname")
	}
	return strings.ToLower(server), nil
}

func normalizeForwardRelayPort(portText string) (string, error) {
	if portText == "" {
		return "", fmt.Errorf("empty port")
	}
	for _, r := range portText {
		if r < '0' || r > '9' {
			return "", fmt.Errorf("invalid port")
		}
	}
	port, err := strconv.Atoi(portText)
	if err != nil || port < 1 || port > 65535 {
		return "", fmt.Errorf("invalid port")
	}
	return strconv.Itoa(port), nil
}

func isStrictIPv4Literal(server string) bool {
	if server == "" {
		return false
	}
	for _, r := range server {
		if (r < '0' || r > '9') && r != '.' {
			return false
		}
	}
	parts := strings.Split(server, ".")
	if len(parts) != 4 {
		return false
	}
	for _, part := range parts {
		if part == "" {
			return false
		}
		if len(part) > 1 && part[0] == '0' {
			return false
		}
		value, err := strconv.Atoi(part)
		if err != nil || value < 0 || value > 255 {
			return false
		}
	}
	return true
}

func isDigitsAndDots(server string) bool {
	if server == "" {
		return false
	}
	for _, r := range server {
		if (r < '0' || r > '9') && r != '.' {
			return false
		}
	}
	return true
}

func isValidASCIIHostname(server string) bool {
	if len(server) == 0 || len(server) > 253 || !strings.Contains(server, ".") {
		return false
	}
	for i := 0; i < len(server); i++ {
		if server[i] > 127 {
			return false
		}
	}
	labels := strings.Split(server, ".")
	for _, label := range labels {
		if len(label) == 0 || len(label) > 63 {
			return false
		}
		if label[0] == '-' || label[len(label)-1] == '-' {
			return false
		}
		for _, r := range label {
			if (r >= 'a' && r <= 'z') || (r >= 'A' && r <= 'Z') || (r >= '0' && r <= '9') || r == '-' {
				continue
			}
			return false
		}
	}
	return true
}

func loadRegionMatchers(rawConfig string) ([]regionMatcher, error) {
	trimmed := strings.TrimSpace(rawConfig)
	if trimmed == "" {
		trimmed = defaultRegionConfig
	}
	return parseRegionMatchers(trimmed)
}

func parseRegionMatchers(rawConfig string) ([]regionMatcher, error) {
	scanner := bufio.NewScanner(strings.NewReader(normalizeInputNewlines(rawConfig)))
	matchers := make([]regionMatcher, 0)
	seenTargets := make(map[string]struct{})

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}
		if !strings.HasPrefix(line, "custom_proxy_group=") {
			continue
		}

		payload := strings.TrimPrefix(line, "custom_proxy_group=")
		parts := strings.Split(payload, "`")
		if len(parts) == 0 {
			continue
		}

		targetName := parts[0]
		if !looksLikeRegionGroupName(targetName) {
			continue
		}
		if len(parts) < 3 {
			return nil, fmt.Errorf("recognized region group %q is missing required matcher fields", targetName)
		}
		if _, exists := seenTargets[targetName]; exists {
			continue
		}

		pattern, err := regexp2.Compile(parts[2], 0)
		if err != nil {
			return nil, fmt.Errorf("compile region matcher %q: %w", targetName, err)
		}
		matchers = append(matchers, regionMatcher{
			TargetName: targetName,
			Pattern:    pattern,
		})
		seenTargets[targetName] = struct{}{}
	}
	if err := scanner.Err(); err != nil {
		return nil, err
	}
	return matchers, nil
}

func looksLikeRegionGroupName(name string) bool {
	if !strings.HasSuffix(name, "节点") {
		return false
	}
	first, firstSize := utf8.DecodeRuneInString(name)
	if !isRegionalIndicator(first) {
		return false
	}
	second, _ := utf8.DecodeRuneInString(name[firstSize:])
	if !isRegionalIndicator(second) {
		return false
	}
	return strings.TrimSpace(name[firstSize:]) != ""
}

func isRegionalIndicator(value rune) bool {
	return value >= 0x1F1E6 && value <= 0x1F1FF
}

func parseInlineProxyList(raw string) ([]inlineProxy, error) {
	scanner := bufio.NewScanner(strings.NewReader(raw))
	proxies := make([]inlineProxy, 0)
	inProxies := false
	foundSection := false

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		switch {
		case !strings.HasPrefix(line, " ") && trimmed == "proxies:":
			foundSection = true
			inProxies = true
		case !inProxies:
			continue
		case trimmed == "" || strings.HasPrefix(trimmed, "#"):
			continue
		case inProxies && strings.HasPrefix(trimmed, "- {"):
			name, err := extractInlineField(trimmed, "name")
			if err != nil {
				return nil, err
			}
			proxyType, err := extractInlineField(trimmed, "type")
			if err != nil {
				return nil, err
			}
			proxies = append(proxies, inlineProxy{
				Name: name,
				Type: classifyInlineProxyType(proxyType, trimmed),
				Raw:  trimmed,
			})
		case inProxies && !strings.HasPrefix(line, " ") && strings.HasSuffix(trimmed, ":") && trimmed != "proxies:" && !strings.HasPrefix(trimmed, "-"):
			inProxies = false
		case inProxies:
			return nil, fmt.Errorf("unexpected proxies entry %q", line)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if !foundSection {
		return nil, fmt.Errorf("missing proxies section")
	}

	return proxies, nil
}

func classifyInlineProxyType(proxyType string, rawLine string) string {
	if proxyType == "vless" && strings.Contains(rawLine, "reality-opts:") {
		return "vless-reality"
	}
	if proxyType == "ss" && containsShadowTLSMarker(rawLine) {
		return "shadowtls"
	}
	return proxyType
}

func containsShadowTLSMarker(rawLine string) bool {
	markers := []string{
		"plugin=shadow-tls",
		"plugin: shadow-tls",
		"plugin:shadow-tls",
		"plugin-opts: {mode: shadow-tls",
		"plugin-opts:{mode:shadow-tls",
		"shadow-tls:",
		"shadow-tls",
	}
	for _, marker := range markers {
		if strings.Contains(rawLine, marker) {
			return true
		}
	}
	return false
}

func parseProxyGroups(raw string) (map[string]proxyGroup, error) {
	scanner := bufio.NewScanner(strings.NewReader(raw))
	groups := make(map[string]proxyGroup)
	var current *proxyGroup
	inGroups := false
	inMembers := false
	foundSection := false

	flush := func() {
		if current == nil {
			return
		}
		groupCopy := *current
		groups[groupCopy.Name] = groupCopy
	}

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		switch {
		case !strings.HasPrefix(line, " ") && trimmed == "proxy-groups:":
			foundSection = true
			inGroups = true
			inMembers = false
		case !inGroups:
			continue
		case trimmed == "" || strings.HasPrefix(trimmed, "#"):
			continue
		case strings.HasPrefix(line, "  - name: "):
			flush()
			current = &proxyGroup{Name: strings.TrimSpace(strings.TrimPrefix(line, "  - name: "))}
			inMembers = false
		case current != nil && strings.HasPrefix(line, "    type: "):
			current.Type = strings.TrimSpace(strings.TrimPrefix(line, "    type: "))
		case current != nil && trimmed == "proxies:":
			inMembers = true
		case current != nil && inMembers && strings.HasPrefix(line, "      - "):
			current.Proxies = append(current.Proxies, strings.TrimSpace(strings.TrimPrefix(line, "      - ")))
		case current != nil && inMembers && strings.HasPrefix(line, "    ") && !strings.HasPrefix(line, "      - "):
			inMembers = false
		case current != nil && strings.HasPrefix(line, "    "):
			continue
		case !strings.HasPrefix(line, " "):
			flush()
			inGroups = false
			inMembers = false
			if strings.HasSuffix(trimmed, ":") {
				continue
			}
			return nil, fmt.Errorf("unexpected proxy-groups content %q", line)
		default:
			return nil, fmt.Errorf("unexpected proxy-group entry %q", line)
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}
	if !foundSection {
		return nil, fmt.Errorf("missing proxy-groups section")
	}

	flush()
	return groups, nil
}

func extractInlineField(line string, field string) (string, error) {
	needle := field + ": "
	start := strings.Index(line, needle)
	if start < 0 {
		return "", fmt.Errorf("missing %q field in inline proxy line %q", field, line)
	}

	rest := line[start+len(needle):]
	value := ""
	if strings.HasPrefix(rest, "\"") || strings.HasPrefix(rest, "'") {
		quotedValue, _, err := extractQuotedInlineValue(rest)
		if err != nil {
			return "", fmt.Errorf("invalid %q field in inline proxy line %q: %w", field, line, err)
		}
		value = strings.TrimSpace(quotedValue)
	} else {
		end := len(rest)
		for _, separator := range []string{", ", "}"} {
			if idx := strings.Index(rest, separator); idx >= 0 && idx < end {
				end = idx
			}
		}
		value = strings.TrimSpace(rest[:end])
	}
	if value == "" {
		return "", fmt.Errorf("empty %q field in inline proxy line %q", field, line)
	}

	return value, nil
}

func extractQuotedInlineValue(value string) (string, int, error) {
	if value == "" {
		return "", 0, fmt.Errorf("empty quoted value")
	}

	quote := value[0]
	switch quote {
	case '"':
		escaped := false
		for index := 1; index < len(value); index++ {
			if escaped {
				escaped = false
				continue
			}
			if value[index] == '\\' {
				escaped = true
				continue
			}
			if value[index] != '"' {
				continue
			}
			parsed, err := strconv.Unquote(value[:index+1])
			if err != nil {
				return "", 0, err
			}
			return parsed, index + 1, nil
		}
	case '\'':
		for index := 1; index < len(value); index++ {
			if value[index] != '\'' {
				continue
			}
			if index+1 < len(value) && value[index+1] == '\'' {
				index++
				continue
			}
			parsed := strings.ReplaceAll(value[1:index], "''", "'")
			return parsed, index + 1, nil
		}
	}

	return "", 0, fmt.Errorf("unterminated quoted value")
}

func containsString(values []string, want string) bool {
	for _, value := range values {
		if value == want {
			return true
		}
	}
	return false
}

func stringPtr(value string) *string {
	return &value
}

func SortedChainTargetNames(targets []ChainTarget) []string {
	names := make([]string, 0, len(targets))
	for _, target := range targets {
		names = append(names, target.Name)
	}
	sort.Strings(names)
	return names
}

func normalizeInputNewlines(value string) string {
	return inpututil.NormalizeNewlines(value)
}
