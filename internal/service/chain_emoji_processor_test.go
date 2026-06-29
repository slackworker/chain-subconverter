package service

import (
	"strings"
	"testing"
)

func TestChainEmojiProcessor_AppliesRegionEmojiAfterRemovingOldEmoji(t *testing.T) {
	templateConfig := strings.Join([]string{
		"[custom]",
		"custom_proxy_group=🇸🇬 新加坡节点`url-test`(SG|Singapore|Alpha)",
		"",
	}, "\n")
	enabled := true

	processor, messages, err := buildChainEmojiProcessor(templateConfig, AdvancedOptions{Emoji: &enabled})
	if err != nil {
		t.Fatalf("buildChainEmojiProcessor() error = %v", err)
	}
	if len(messages) != 0 {
		t.Fatalf("messages = %v, want none", messages)
	}

	got, err := processor.Apply("🇭🇰 Alpha-SS-sdgfa")
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if got != "🇸🇬 Alpha-SS-sdgfa" {
		t.Fatalf("Apply() = %q, want %q", got, "🇸🇬 Alpha-SS-sdgfa")
	}
}

func TestChainEmojiProcessor_StripsOldEmojiWhenNoRuleMatches(t *testing.T) {
	templateConfig := strings.Join([]string{
		"[custom]",
		"custom_proxy_group=🇸🇬 新加坡节点`url-test`(SG|Singapore|Alpha)",
		"",
	}, "\n")
	enabled := true

	processor, _, err := buildChainEmojiProcessor(templateConfig, AdvancedOptions{Emoji: &enabled})
	if err != nil {
		t.Fatalf("buildChainEmojiProcessor() error = %v", err)
	}

	got, err := processor.Apply("🇭🇰 NoMatch-Node")
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if got != "NoMatch-Node" {
		t.Fatalf("Apply() = %q, want %q", got, "NoMatch-Node")
	}
}

func TestChainEmojiProcessor_IsIdempotent(t *testing.T) {
	templateConfig := strings.Join([]string{
		"[custom]",
		"custom_proxy_group=🇸🇬 新加坡节点`url-test`(SG|Singapore|Alpha)",
		"",
	}, "\n")
	enabled := true

	processor, _, err := buildChainEmojiProcessor(templateConfig, AdvancedOptions{Emoji: &enabled})
	if err != nil {
		t.Fatalf("buildChainEmojiProcessor() error = %v", err)
	}

	first, err := processor.Apply("Alpha-SS-sdgfa")
	if err != nil {
		t.Fatalf("Apply() first error = %v", err)
	}
	second, err := processor.Apply(first)
	if err != nil {
		t.Fatalf("Apply() second error = %v", err)
	}
	if first != second {
		t.Fatalf("Apply() should be idempotent: first=%q second=%q", first, second)
	}
}

func TestChainEmojiProcessor_RespectsTemplateEmojiRulePrecedence(t *testing.T) {
	templateConfig := strings.Join([]string{
		"[custom]",
		"custom_proxy_group=🇸🇬 新加坡节点`url-test`(SG|Singapore|Alpha)",
		"emoji=(SG|Singapore|Alpha),🇯🇵",
		"",
	}, "\n")
	enabled := true

	processor, messages, err := buildChainEmojiProcessor(templateConfig, AdvancedOptions{Emoji: &enabled})
	if err != nil {
		t.Fatalf("buildChainEmojiProcessor() error = %v", err)
	}
	if len(messages) != 1 || messages[0].Code != "TEMPLATE_EMOJI_RULE_CONFLICT" {
		t.Fatalf("messages = %v, want TEMPLATE_EMOJI_RULE_CONFLICT", messages)
	}

	got, err := processor.Apply("Alpha-SS-sdgfa")
	if err != nil {
		t.Fatalf("Apply() error = %v", err)
	}
	if got != "🇯🇵 Alpha-SS-sdgfa" {
		t.Fatalf("Apply() = %q, want %q", got, "🇯🇵 Alpha-SS-sdgfa")
	}
}
