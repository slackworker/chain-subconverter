package service

import (
	"bufio"
	_ "embed"
	"fmt"
	"strings"
	"unicode/utf8"

	"github.com/dlclark/regexp2"
)

//go:embed embed/default_emoji.txt
var embeddedDefaultEmojiRules string

type regionEmojiRule struct {
	groupName string
	regex     string
	emoji     string
}

type parsedEmojiRule struct {
	regex string
	emoji string
}

type compiledEmojiRule struct {
	regex   string
	emoji   string
	pattern *regexp2.Regexp
}

type chainEmojiProcessor struct {
	enabled        bool
	removeOldEmoji bool
	addEmoji       bool
	rules          []compiledEmojiRule
}

func buildChainEmojiProcessor(templateConfig string, options AdvancedOptions) (chainEmojiProcessor, []Message, error) {
	if !shouldPreprocessTemplateEmoji(options) {
		return chainEmojiProcessor{}, nil, nil
	}
	normalized := normalizeInputNewlines(templateConfig)
	if strings.TrimSpace(normalized) == "" {
		normalized = defaultRegionConfig
	}
	regionRules := collectRegionEmojiRules(normalized)
	defaultRules := parseEmbeddedDefaultEmojiRules()
	addEmoji, removeOldEmoji, templateRules := collectTemplateEmojiConfigState(normalized)
	mergedRules, messages := mergeEmojiRules(regionRules, templateRules, defaultRules)
	compiledRules := make([]compiledEmojiRule, 0, len(mergedRules))
	for _, rule := range mergedRules {
		pattern, err := regexp2.Compile(rule.regex, 0)
		if err != nil {
			return chainEmojiProcessor{}, nil, fmt.Errorf("compile emoji matcher %q: %w", rule.regex, err)
		}
		compiledRules = append(compiledRules, compiledEmojiRule{
			regex:   rule.regex,
			emoji:   rule.emoji,
			pattern: pattern,
		})
	}
	return chainEmojiProcessor{
		enabled:        true,
		removeOldEmoji: removeOldEmoji,
		addEmoji:       addEmoji,
		rules:          compiledRules,
	}, messages, nil
}

func (processor chainEmojiProcessor) Apply(name string) (string, error) {
	trimmedName := strings.TrimSpace(name)
	if trimmedName == "" || !processor.enabled {
		return trimmedName, nil
	}

	base := trimmedName
	if processor.removeOldEmoji {
		base = strings.TrimSpace(removeLeadingEmojis(trimmedName))
	}

	if !processor.addEmoji || len(processor.rules) == 0 {
		if processor.removeOldEmoji && base != trimmedName {
			return base, nil
		}
		return trimmedName, nil
	}

	targetEmoji, matched, err := processor.matchEmoji(base)
	if err != nil {
		return "", err
	}
	if !matched {
		if processor.removeOldEmoji && base != trimmedName {
			return base, nil
		}
		return trimmedName, nil
	}

	if !processor.removeOldEmoji && hasLeadingUTF8Emoji(trimmedName) {
		leadingEmoji := leadingUTF8Emoji(trimmedName)
		if leadingEmoji == targetEmoji {
			remainder := strings.TrimSpace(trimmedName[len(leadingEmoji):])
			if remainder == "" {
				return targetEmoji, nil
			}
			return targetEmoji + " " + remainder, nil
		}
		return trimmedName, nil
	}

	base = strings.TrimSpace(base)
	if base == "" {
		return targetEmoji, nil
	}
	return targetEmoji + " " + base, nil
}

func (processor chainEmojiProcessor) matchEmoji(name string) (string, bool, error) {
	for _, rule := range processor.rules {
		matched, err := rule.pattern.MatchString(name)
		if err != nil {
			return "", false, fmt.Errorf("match emoji regex %q: %w", rule.regex, err)
		}
		if matched {
			return rule.emoji, true, nil
		}
	}
	return "", false, nil
}

func removeLeadingEmojis(name string) string {
	remark := name
	for len(remark) >= 2 {
		if remark[0] == 0xF0 && remark[1] == 0x9F {
			if len(remark) < 4 {
				break
			}
			remark = remark[4:]
			continue
		}
		break
	}
	if strings.TrimSpace(remark) == "" {
		return name
	}
	return remark
}

func hasLeadingUTF8Emoji(name string) bool {
	return len(name) >= 4 && name[0] == 0xF0 && name[1] == 0x9F
}

func leadingUTF8Emoji(name string) string {
	if !hasLeadingUTF8Emoji(name) {
		return ""
	}
	if len(name) < 4 {
		return ""
	}
	return name[:4]
}

func mergeEmojiRules(regionRules []regionEmojiRule, templateRules []parsedEmojiRule, defaultRules []parsedEmojiRule) ([]parsedEmojiRule, []Message) {
	templateRulesByRegex := make(map[string]parsedEmojiRule, len(templateRules))
	occupiedRegex := make(map[string]struct{}, len(templateRules)+len(regionRules)+len(defaultRules))
	for _, rule := range templateRules {
		templateRulesByRegex[rule.regex] = rule
		occupiedRegex[rule.regex] = struct{}{}
	}

	merged := append([]parsedEmojiRule{}, templateRules...)
	messages := make([]Message, 0)
	for _, regionRule := range regionRules {
		if existingRule, exists := templateRulesByRegex[regionRule.regex]; exists {
			if existingRule.emoji != regionRule.emoji {
				messages = append(messages, Message{
					Level:   "warning",
					Code:    "TEMPLATE_EMOJI_RULE_CONFLICT",
					Message: fmt.Sprintf("模板已显式声明地域组 %q 对应节点 emoji，保留模板原规则", regionRule.groupName),
					Context: map[string]any{
						"groupName":      regionRule.groupName,
						"matcherRegex":   regionRule.regex,
						"templateEmoji":  existingRule.emoji,
						"expectedEmoji":  regionRule.emoji,
						"managedByChain": true,
					},
				})
			}
			continue
		}

		occupiedRegex[regionRule.regex] = struct{}{}
		merged = append(merged, parsedEmojiRule{
			regex: regionRule.regex,
			emoji: regionRule.emoji,
		})
	}

	for _, defaultRule := range defaultRules {
		if _, exists := occupiedRegex[defaultRule.regex]; exists {
			continue
		}
		occupiedRegex[defaultRule.regex] = struct{}{}
		merged = append(merged, defaultRule)
	}

	return merged, messages
}

func collectRegionEmojiRules(rawConfig string) []regionEmojiRule {
	scanner := bufio.NewScanner(strings.NewReader(rawConfig))
	rules := make([]regionEmojiRule, 0)
	seenRegex := make(map[string]struct{})

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
		if len(parts) < 3 {
			continue
		}
		groupName := strings.TrimSpace(parts[0])
		if !looksLikeRegionGroupName(groupName) {
			continue
		}
		emoji, ok := extractLeadingFlagEmoji(groupName)
		if !ok {
			continue
		}
		regex := strings.TrimSpace(parts[2])
		if regex == "" {
			continue
		}
		if _, exists := seenRegex[regex]; exists {
			continue
		}
		seenRegex[regex] = struct{}{}
		rules = append(rules, regionEmojiRule{
			groupName: groupName,
			regex:     regex,
			emoji:     emoji,
		})
	}

	return rules
}

func collectTemplateEmojiConfigState(rawConfig string) (bool, bool, []parsedEmojiRule) {
	scanner := bufio.NewScanner(strings.NewReader(rawConfig))
	addEmoji := true
	removeOldEmoji := true
	emojiRules := make([]parsedEmojiRule, 0)
	seenRegex := make(map[string]struct{})

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}

		switch {
		case strings.HasPrefix(line, "add_emoji="):
			if value, ok := parseEmojiBoolean(strings.TrimSpace(strings.TrimPrefix(line, "add_emoji="))); ok {
				addEmoji = value
			}
		case strings.HasPrefix(line, "remove_old_emoji="):
			if value, ok := parseEmojiBoolean(strings.TrimSpace(strings.TrimPrefix(line, "remove_old_emoji="))); ok {
				removeOldEmoji = value
			}
		case strings.HasPrefix(line, "emoji="):
			payload := strings.TrimSpace(strings.TrimPrefix(line, "emoji="))
			if payload == "" {
				continue
			}
			if isDefaultEmojiImport(payload) {
				for _, rule := range parseEmbeddedDefaultEmojiRules() {
					if _, exists := seenRegex[rule.regex]; exists {
						continue
					}
					seenRegex[rule.regex] = struct{}{}
					emojiRules = append(emojiRules, rule)
				}
				continue
			}
			regex, emoji, ok := parseEmojiRegexRule(payload)
			if !ok {
				continue
			}
			if _, exists := seenRegex[regex]; exists {
				continue
			}
			seenRegex[regex] = struct{}{}
			emojiRules = append(emojiRules, parsedEmojiRule{
				regex: regex,
				emoji: emoji,
			})
		}
	}

	return addEmoji, removeOldEmoji, emojiRules
}

func parseEmbeddedDefaultEmojiRules() []parsedEmojiRule {
	scanner := bufio.NewScanner(strings.NewReader(embeddedDefaultEmojiRules))
	rules := make([]parsedEmojiRule, 0)
	seenRegex := make(map[string]struct{})

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}
		regex, emoji, ok := parseEmojiRegexRule(line)
		if !ok {
			continue
		}
		if _, exists := seenRegex[regex]; exists {
			continue
		}
		seenRegex[regex] = struct{}{}
		rules = append(rules, parsedEmojiRule{
			regex: regex,
			emoji: emoji,
		})
	}

	return rules
}

func isDefaultEmojiImport(payload string) bool {
	if !strings.HasPrefix(payload, "!!import:") {
		return false
	}
	path := strings.TrimSpace(strings.TrimPrefix(payload, "!!import:"))
	path = strings.Trim(path, `"'`)
	path = strings.ReplaceAll(path, "\\", "/")
	switch path {
	case "snippets/emoji.txt", "snippets/emoji.toml":
		return true
	default:
		return false
	}
}

func parseEmojiBoolean(value string) (bool, bool) {
	switch strings.ToLower(strings.TrimSpace(value)) {
	case "true":
		return true, true
	case "false":
		return false, true
	default:
		return false, false
	}
}

func parseEmojiRegexRule(payload string) (string, string, bool) {
	index := strings.LastIndex(payload, ",")
	if index <= 0 || index >= len(payload)-1 {
		return "", "", false
	}
	regex := strings.TrimSpace(payload[:index])
	emoji := strings.TrimSpace(payload[index+1:])
	if regex == "" || emoji == "" {
		return "", "", false
	}
	return regex, emoji, true
}

func extractLeadingFlagEmoji(groupName string) (string, bool) {
	first, firstSize := utf8.DecodeRuneInString(groupName)
	if !isRegionalIndicator(first) {
		return "", false
	}
	second, secondSize := utf8.DecodeRuneInString(groupName[firstSize:])
	if !isRegionalIndicator(second) {
		return "", false
	}
	return groupName[:firstSize+secondSize], true
}

func sanitizeManagedTemplateConfigForSubconverter(rawConfig string) string {
	normalized := normalizeInputNewlines(rawConfig)
	lines := strings.Split(normalized, "\n")
	addEmojiSet := false
	removeOldEmojiSet := false
	out := make([]string, 0, len(lines)+2)

	for _, line := range lines {
		trimmed := strings.TrimSpace(line)
		switch {
		case strings.HasPrefix(trimmed, "add_emoji="):
			out = append(out, "add_emoji=false")
			addEmojiSet = true
		case strings.HasPrefix(trimmed, "remove_old_emoji="):
			out = append(out, "remove_old_emoji=false")
			removeOldEmojiSet = true
		default:
			out = append(out, line)
		}
	}

	if !addEmojiSet {
		out = append(out, "add_emoji=false")
	}
	if !removeOldEmojiSet {
		out = append(out, "remove_old_emoji=false")
	}

	return strings.Join(out, "\n")
}
