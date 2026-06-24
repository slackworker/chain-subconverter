package service

import (
	"bufio"
	"fmt"
	"strings"
	"unicode/utf8"
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

func preprocessTemplateEmojiByRegion(templateConfig string, options AdvancedOptions) (string, []Message) {
	if !shouldPreprocessTemplateEmoji(options) {
		return templateConfig, nil
	}

	normalized := normalizeInputNewlines(templateConfig)
	regionRules := collectRegionEmojiRules(normalized)
	if len(regionRules) == 0 {
		return templateConfig, nil
	}

	existingAddEmoji, existingRemoveOldEmoji, existingEmojiRules, hasEmojiImport := collectTemplateEmojiConfigState(normalized)
	existingEmojiByRegex := make(map[string]parsedEmojiRule, len(existingEmojiRules))
	for _, rule := range existingEmojiRules {
		existingEmojiByRegex[rule.regex] = rule
	}

	messages := make([]Message, 0)
	pending := make([]regionEmojiRule, 0, len(regionRules))
	for _, regionRule := range regionRules {
		existingRule, exists := existingEmojiByRegex[regionRule.regex]
		if !exists {
			pending = append(pending, regionRule)
			continue
		}
		if existingRule.emoji == regionRule.emoji {
			continue
		}
		messages = append(messages, Message{
			Level:   "warning",
			Code:    "TEMPLATE_EMOJI_RULE_CONFLICT",
			Message: fmt.Sprintf("模板已显式声明地域组 %q 对应节点 emoji，保留模板原规则", regionRule.groupName),
			Context: map[string]any{
				"groupName":      regionRule.groupName,
				"matcherRegex":   regionRule.regex,
				"templateEmoji":  existingRule.emoji,
				"expectedEmoji":  regionRule.emoji,
				"managedByChain": false,
			},
		})
	}

	if len(pending) == 0 {
		return templateConfig, messages
	}

	lines := make([]string, 0, 2+len(pending))
	if !existingAddEmoji {
		lines = append(lines, "add_emoji=true")
	}
	if !existingRemoveOldEmoji {
		lines = append(lines, "remove_old_emoji=true")
	}
	for _, rule := range pending {
		lines = append(lines, "emoji="+rule.regex+","+rule.emoji)
	}
	if len(existingEmojiRules) == 0 && !hasEmojiImport {
		// Keep default emoji behavior while allowing region overrides to take precedence.
		lines = append(lines, "emoji=!!import:snippets/emoji.txt")
	}

	var builder strings.Builder
	builder.WriteString(strings.TrimRight(normalized, "\n"))
	builder.WriteString("\n")
	for _, line := range lines {
		builder.WriteString(line)
		builder.WriteString("\n")
	}

	return strings.TrimSpace(builder.String()), messages
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

func collectTemplateEmojiConfigState(rawConfig string) (bool, bool, []parsedEmojiRule, bool) {
	scanner := bufio.NewScanner(strings.NewReader(rawConfig))
	hasAddEmoji := false
	hasRemoveOldEmoji := false
	emojiRules := make([]parsedEmojiRule, 0)
	hasEmojiImport := false

	for scanner.Scan() {
		line := strings.TrimSpace(scanner.Text())
		if line == "" || strings.HasPrefix(line, ";") || strings.HasPrefix(line, "#") {
			continue
		}

		switch {
		case strings.HasPrefix(line, "add_emoji="):
			hasAddEmoji = true
		case strings.HasPrefix(line, "remove_old_emoji="):
			hasRemoveOldEmoji = true
		case strings.HasPrefix(line, "emoji="):
			payload := strings.TrimSpace(strings.TrimPrefix(line, "emoji="))
			if strings.HasPrefix(payload, "!!import:") {
				hasEmojiImport = true
				continue
			}
			regex, emoji, ok := parseEmojiRegexRule(payload)
			if !ok {
				continue
			}
			emojiRules = append(emojiRules, parsedEmojiRule{
				regex: regex,
				emoji: emoji,
			})
		}
	}

	return hasAddEmoji, hasRemoveOldEmoji, emojiRules, hasEmojiImport
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
