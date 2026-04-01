package service

import (
	"bufio"
	"fmt"
	"regexp"
	"sort"
	"strings"
)

type AdvancedOptions struct {
	Emoji             bool   `json:"emoji"`
	UDP               bool   `json:"udp"`
	SkipCertVerify    bool   `json:"skipCertVerify"`
	Config            string `json:"config"`
	Include           string `json:"include"`
	Exclude           string `json:"exclude"`
	EnablePortForward bool   `json:"enablePortForward"`
}

type Stage1Input struct {
	LandingRawText     string          `json:"landingRawText"`
	TransitRawText     string          `json:"transitRawText"`
	ForwardRelayRawText string         `json:"forwardRelayRawText"`
	AdvancedOptions    AdvancedOptions `json:"advancedOptions"`
}

type Stage1ConvertRequest struct {
	Stage1Input Stage1Input `json:"stage1Input"`
}

type Stage2SnapshotFixture struct {
	Stage2Snapshot Stage2Snapshot `json:"stage2Snapshot"`
}

type Stage2Snapshot struct {
	Rows []Stage2Row `json:"rows"`
}

type Stage2Init struct {
	AvailableModes []string       `json:"availableModes"`
	ChainTargets   []ChainTarget  `json:"chainTargets"`
	ForwardRelays  []ForwardRelay `json:"forwardRelays"`
	Rows           []Stage2Row    `json:"rows"`
}

type Stage2Row struct {
	LandingNodeName string                     `json:"landingNodeName"`
	Mode            string                     `json:"mode"`
	TargetName      *string                    `json:"targetName"`
	RestrictedModes map[string]ModeRestriction `json:"restrictedModes,omitempty"`
}

type ModeRestriction struct {
	ReasonCode string `json:"reasonCode"`
	ReasonText string `json:"reasonText"`
}

type ChainTarget struct {
	Name string `json:"name"`
	Kind string `json:"kind"`
}

type ForwardRelay struct {
	Name string `json:"name"`
}

type ConversionFixtures struct {
	LandingDiscoveryYAML string
	TransitDiscoveryYAML string
	FullBaseYAML         string
}

type inlineProxy struct {
	Name string
	Type string
	Raw  string
}

type proxyGroup struct {
	Name    string
	Type    string
	Proxies []string
}

type regionMatcher struct {
	TargetName string
	Pattern    *regexp.Regexp
}

var defaultRegionMatchers = []regionMatcher{
	{
		TargetName: "🇭🇰 香港节点",
		Pattern: regexp.MustCompile(`(?i)🇭🇰|香港|Hong Kong|HongKong|\bHK(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|HKG|九龙|Kowloon|新界|沙田|荃湾|葵涌`),
	},
	{
		TargetName: "🇺🇸 美国节点",
		Pattern: regexp.MustCompile(`(?i)🇺🇸|美国|波特兰|达拉斯|俄勒冈|凤凰城|费利蒙|硅谷|拉斯维加斯|洛杉矶|圣何塞|圣克拉拉|西雅图|芝加哥|纽约|纽纽|亚特兰大|迈阿密|华盛顿|\bUS(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|United States|UnitedStates|USA|America|JFK|EWR|IAD|ATL|ORD|MIA|NYC|LAX|SFO|SEA|DFW|SJC`),
	},
	{
		TargetName: "🇯🇵 日本节点",
		Pattern: regexp.MustCompile(`(?i)🇯🇵|日本|川日|东京|大阪|泉日|埼玉|沪日|深日|\bJP(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|Japan|JPN|NRT|HND|KIX|TYO|OSA|关西|Kansai`),
	},
	{
		TargetName: "🇸🇬 新加坡节点",
		Pattern: regexp.MustCompile(`(?i)🇸🇬|新加坡|狮城|\bSG(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|Singapore|SIN|坡`),
	},
	{
		TargetName: "🇼🇸 台湾节点",
		Pattern: regexp.MustCompile(`(?i)🇹🇼|🇼🇸|台湾|新北|彰化|\bTW(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|Taiwan|TWN|TPE|ROC|台`),
	},
	{
		TargetName: "🇰🇷 韩国节点",
		Pattern: regexp.MustCompile(`(?i)🇰🇷|韩国|首尔|春川|\bKR(?:[-_ ]?\d+(?:[-_ ]?[A-Za-z]{2,})?)?\b|Korea|KOR|Chuncheon|ICN|韩|韓`),
	},
}

var defaultRegionGroupOrder = []string{
	"🇭🇰 香港节点",
	"🇺🇸 美国节点",
	"🇯🇵 日本节点",
	"🇸🇬 新加坡节点",
	"🇼🇸 台湾节点",
	"🇰🇷 韩国节点",
}

func BuildStage2Init(stage1Input Stage1Input, fixtures ConversionFixtures) (Stage2Init, error) {
	if !stage1Input.AdvancedOptions.EnablePortForward && strings.TrimSpace(stage1Input.ForwardRelayRawText) != "" {
		return Stage2Init{}, fmt.Errorf("forwardRelayRawText must be empty when enablePortForward is false")
	}

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

	landingNames := make(map[string]struct{}, len(landingProxies))
	for _, proxy := range landingProxies {
		landingNames[proxy.Name] = struct{}{}
	}

	chainTargets, err := buildChainTargets(landingNames, transitProxies, fullBaseGroups)
	if err != nil {
		return Stage2Init{}, err
	}

	forwardRelays, err := parseForwardRelays(stage1Input)
	if err != nil {
		return Stage2Init{}, err
	}

	hasChainMode := len(chainTargets) > 0
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
		chainTargetNames[target.Name] = struct{}{}
	}

	rows := make([]Stage2Row, 0, len(landingProxies))
	for _, landing := range landingProxies {
		row := Stage2Row{
			LandingNodeName: landing.Name,
			Mode:            "none",
			TargetName:      nil,
		}

		if hasChainMode {
			if targetName, ok := detectDefaultChainTarget(landing.Name, chainTargetNames); ok {
				row.Mode = "chain"
				row.TargetName = stringPtr(targetName)
			}
		}

		if row.Mode == "none" && !hasChainMode && hasPortForwardMode {
			row.Mode = "port_forward"
			if len(forwardRelays) == 1 {
				row.TargetName = stringPtr(forwardRelays[0].Name)
			}
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

func buildChainTargets(landingNames map[string]struct{}, transitProxies []inlineProxy, fullBaseGroups map[string]proxyGroup) ([]ChainTarget, error) {
	seen := make(map[string]struct{})
	chainTargets := make([]ChainTarget, 0, len(defaultRegionGroupOrder)+len(transitProxies))

	for _, groupName := range defaultRegionGroupOrder {
		group, ok := fullBaseGroups[groupName]
		if !ok {
			return nil, fmt.Errorf("missing default region proxy-group %q in full-base fixture", groupName)
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
			return nil, fmt.Errorf("chain target name conflict: %q", proxy.Name)
		}
		chainTargets = append(chainTargets, ChainTarget{
			Name: proxy.Name,
			Kind: "proxies",
		})
		seen[proxy.Name] = struct{}{}
	}

	return chainTargets, nil
}

func detectDefaultChainTarget(landingNodeName string, chainTargetNames map[string]struct{}) (string, bool) {
	matches := make([]string, 0, 1)
	for _, matcher := range defaultRegionMatchers {
		if !matcher.Pattern.MatchString(landingNodeName) {
			continue
		}
		if _, exists := chainTargetNames[matcher.TargetName]; !exists {
			continue
		}
		matches = append(matches, matcher.TargetName)
	}

	if len(matches) != 1 {
		return "", false
	}

	return matches[0], true
}

func parseForwardRelays(stage1Input Stage1Input) ([]ForwardRelay, error) {
	if !stage1Input.AdvancedOptions.EnablePortForward {
		return []ForwardRelay{}, nil
	}

	lines := strings.Split(stage1Input.ForwardRelayRawText, "\n")
	seen := make(map[string]struct{})
	relays := make([]ForwardRelay, 0, len(lines))
	for _, line := range lines {
		name := strings.TrimSpace(line)
		if name == "" {
			continue
		}
		if _, exists := seen[name]; exists {
			return nil, fmt.Errorf("duplicate forward relay %q", name)
		}
		seen[name] = struct{}{}
		relays = append(relays, ForwardRelay{Name: name})
	}

	return relays, nil
}

func parseInlineProxyList(raw string) ([]inlineProxy, error) {
	scanner := bufio.NewScanner(strings.NewReader(raw))
	proxies := make([]inlineProxy, 0)
	inProxies := false

	for scanner.Scan() {
		line := scanner.Text()
		trimmed := strings.TrimSpace(line)

		switch {
		case trimmed == "proxies:":
			inProxies = true
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
				Type: proxyType,
				Raw:  trimmed,
			})
		case inProxies && strings.HasSuffix(trimmed, ":") && trimmed != "proxies:" && !strings.HasPrefix(trimmed, "-"):
			inProxies = false
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
	}

	return proxies, nil
}

func parseProxyGroups(raw string) (map[string]proxyGroup, error) {
	scanner := bufio.NewScanner(strings.NewReader(raw))
	groups := make(map[string]proxyGroup)
	var current *proxyGroup
	inGroups := false
	inMembers := false

	flush := func() {
		if current == nil {
			return
		}
		groupCopy := *current
		groups[groupCopy.Name] = groupCopy
	}

	for scanner.Scan() {
		line := scanner.Text()

		switch {
		case strings.TrimSpace(line) == "proxy-groups:":
			inGroups = true
			inMembers = false
		case !inGroups:
			continue
		case strings.HasPrefix(line, "  - name: "):
			flush()
			current = &proxyGroup{Name: strings.TrimSpace(strings.TrimPrefix(line, "  - name: "))}
			inMembers = false
		case current != nil && strings.HasPrefix(line, "    type: "):
			current.Type = strings.TrimSpace(strings.TrimPrefix(line, "    type: "))
		case current != nil && strings.TrimSpace(line) == "proxies:":
			inMembers = true
		case current != nil && inMembers && strings.HasPrefix(line, "      - "):
			current.Proxies = append(current.Proxies, strings.TrimSpace(strings.TrimPrefix(line, "      - ")))
		case current != nil && inMembers && strings.HasPrefix(line, "    ") && !strings.HasPrefix(line, "      - "):
			inMembers = false
		}
	}

	if err := scanner.Err(); err != nil {
		return nil, err
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
	end := len(rest)
	for _, separator := range []string{", ", "}"} {
		if idx := strings.Index(rest, separator); idx >= 0 && idx < end {
			end = idx
		}
	}

	value := strings.TrimSpace(rest[:end])
	if value == "" {
		return "", fmt.Errorf("empty %q field in inline proxy line %q", field, line)
	}

	return value, nil
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
