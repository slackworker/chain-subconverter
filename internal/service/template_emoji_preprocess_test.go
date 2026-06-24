package service

import (
	"strings"
	"testing"
)

func TestPreprocessTemplateEmojiByRegion_InjectsRulesWhenEmojiEnabled(t *testing.T) {
	templateConfig := strings.Join([]string{
		"[custom]",
		"custom_proxy_group=🇼🇸 台湾节点`url-test`(TW|Taiwan)",
		"enable_rule_generator=true",
		"",
	}, "\n")
	enabled := true

	processed, messages := preprocessTemplateEmojiByRegion(templateConfig, AdvancedOptions{Emoji: &enabled})

	if len(messages) != 0 {
		t.Fatalf("messages = %v, want none", messages)
	}
	for _, expected := range []string{
		"add_emoji=true",
		"remove_old_emoji=true",
		"emoji=(TW|Taiwan),🇼🇸",
		"emoji=!!import:snippets/emoji.txt",
	} {
		if !strings.Contains(processed, expected) {
			t.Fatalf("processed template missing %q:\n%s", expected, processed)
		}
	}
	if strings.Index(processed, "emoji=(TW|Taiwan),🇼🇸") > strings.Index(processed, "emoji=!!import:snippets/emoji.txt") {
		t.Fatalf("region rule should appear before default import:\n%s", processed)
	}
}

func TestPreprocessTemplateEmojiByRegion_SkipsWhenEmojiDisabled(t *testing.T) {
	templateConfig := strings.Join([]string{
		"[custom]",
		"custom_proxy_group=🇼🇸 台湾节点`url-test`(TW|Taiwan)",
		"",
	}, "\n")
	disabled := false

	cases := []AdvancedOptions{
		{},
		{Emoji: &disabled},
	}
	for _, options := range cases {
		processed, messages := preprocessTemplateEmojiByRegion(templateConfig, options)
		if processed != templateConfig {
			t.Fatalf("processed template changed when emoji disabled:\n--- got ---\n%s\n--- want ---\n%s", processed, templateConfig)
		}
		if len(messages) != 0 {
			t.Fatalf("messages = %v, want none", messages)
		}
	}
}

func TestPreprocessTemplateEmojiByRegion_RespectsExistingConflictingEmojiRule(t *testing.T) {
	templateConfig := strings.Join([]string{
		"[custom]",
		"custom_proxy_group=🇼🇸 台湾节点`url-test`(TW|Taiwan)",
		"emoji=(TW|Taiwan),🇨🇳",
		"",
	}, "\n")
	enabled := true

	processed, messages := preprocessTemplateEmojiByRegion(templateConfig, AdvancedOptions{Emoji: &enabled})

	if strings.Contains(processed, "emoji=(TW|Taiwan),🇼🇸") {
		t.Fatalf("should keep template emoji rule on conflict:\n%s", processed)
	}
	if !strings.Contains(processed, "emoji=(TW|Taiwan),🇨🇳") {
		t.Fatalf("existing template emoji rule missing:\n%s", processed)
	}
	if len(messages) != 1 {
		t.Fatalf("messages length = %d, want 1", len(messages))
	}
	if messages[0].Code != "TEMPLATE_EMOJI_RULE_CONFLICT" {
		t.Fatalf("message code = %q, want TEMPLATE_EMOJI_RULE_CONFLICT", messages[0].Code)
	}
}
