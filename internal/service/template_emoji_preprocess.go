package service

import (
	"bufio"
	"fmt"
	"strings"
	"unicode"
	"unicode/utf8"

	"github.com/dlclark/regexp2"
)

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

func preprocessTemplateEmojiByRegion(templateConfig string, options AdvancedOptions) (string, []Message) {
	if !shouldPreprocessTemplateEmoji(options) {
		return templateConfig, nil
	}
	normalized := normalizeInputNewlines(templateConfig)
	regionRules := collectRegionEmojiRules(normalized)
	_, _, templateRules := collectTemplateEmojiConfigState(normalized)
	_, messages := mergeEmojiRules(regionRules, templateRules)
	return templateConfig, messages
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
	addEmoji, removeOldEmoji, templateRules := collectTemplateEmojiConfigState(normalized)
	mergedRules, messages := mergeEmojiRules(regionRules, templateRules)
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

	currentEmoji, currentBase, hasCurrentEmoji := splitLeadingFlagEmoji(trimmedName)
	if !processor.removeOldEmoji {
		currentBase = trimmedName
	}

	matchInput := trimmedName
	if hasCurrentEmoji {
		matchInput = currentBase
	}
	if processor.removeOldEmoji {
		matchInput = currentBase
	}

	if !processor.addEmoji || len(processor.rules) == 0 {
		if processor.removeOldEmoji && hasCurrentEmoji {
			return currentBase, nil
		}
		return trimmedName, nil
	}

	targetEmoji, matched, err := processor.matchEmoji(matchInput)
	if err != nil {
		return "", err
	}
	if !matched {
		if processor.removeOldEmoji && hasCurrentEmoji {
			return currentBase, nil
		}
		return trimmedName, nil
	}

	// Keep explicit existing leading emoji when remove_old_emoji=false.
	if hasCurrentEmoji && !processor.removeOldEmoji {
		if currentEmoji == targetEmoji {
			return targetEmoji + " " + strings.TrimSpace(currentBase), nil
		}
		return trimmedName, nil
	}

	base := strings.TrimSpace(currentBase)
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

func splitLeadingFlagEmoji(name string) (string, string, bool) {
	trimmed := strings.TrimSpace(name)
	runes := []rune(trimmed)
	if len(runes) < 2 {
		return "", trimmed, false
	}
	if !isRegionalIndicatorRune(runes[0]) || !isRegionalIndicatorRune(runes[1]) {
		return "", trimmed, false
	}
	remainderRunes := runes[2:]
	if len(remainderRunes) > 0 && !unicode.IsSpace(remainderRunes[0]) {
		return "", trimmed, false
	}
	remainder := strings.TrimSpace(string(remainderRunes))
	return string(runes[:2]), remainder, true
}

func mergeEmojiRules(regionRules []regionEmojiRule, templateRules []parsedEmojiRule) ([]parsedEmojiRule, []Message) {
	templateRulesByRegex := make(map[string]parsedEmojiRule, len(templateRules))
	for _, rule := range templateRules {
		templateRulesByRegex[rule.regex] = rule
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

		merged = append(merged, parsedEmojiRule{
			regex: regionRule.regex,
			emoji: regionRule.emoji,
		})
	}

	return merged, messages
}

func shouldPreprocessTemplateEmoji(options AdvancedOptions) bool {
	return options.Emoji != nil && *options.Emoji
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
			if payload == "" || strings.HasPrefix(payload, "!!import:") {
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
