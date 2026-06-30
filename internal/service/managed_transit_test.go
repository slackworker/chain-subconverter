package service

import (
	"strings"
	"testing"
)

func TestBuildManagedTransitProxiesYAML_AppliesEmojiToProxyNames(t *testing.T) {
	enabled := true
	processor, _, err := buildChainEmojiProcessor(
		"custom_proxy_group=🇸🇬 新加坡节点`url-test`SG|Singapore|Alpha\n",
		AdvancedOptions{Emoji: &enabled},
	)
	if err != nil {
		t.Fatalf("buildChainEmojiProcessor() error = %v", err)
	}

	yaml, err := buildManagedTransitProxiesYAML(strings.Join([]string{
		"proxies:",
		"  - {name: 🇭🇰 Alpha-Transit, server: transit.example.com, port: 443, type: ss}",
		"  - {name: plain-transit, server: transit.example.com, port: 444, type: ss}",
		"",
	}, "\n"), processor)
	if err != nil {
		t.Fatalf("buildManagedTransitProxiesYAML() error = %v", err)
	}

	if !strings.Contains(yaml, "name: 🇸🇬 Alpha-Transit") {
		t.Fatalf("expected emoji-renamed transit proxy, got:\n%s", yaml)
	}
	if !strings.Contains(yaml, "name: plain-transit") {
		t.Fatalf("expected unchanged transit proxy without emoji rule, got:\n%s", yaml)
	}
	if strings.Contains(yaml, "proxy-groups:") {
		t.Fatalf("managed transit YAML must contain proxies only, got:\n%s", yaml)
	}
}

func TestBuildManagedTransitProxiesYAML_WithoutEmojiKeepsOriginalNames(t *testing.T) {
	yaml, err := buildManagedTransitProxiesYAML(strings.Join([]string{
		"proxies:",
		"  - {name: transit-a, server: transit.example.com, port: 443, type: ss}",
		"",
	}, "\n"), chainEmojiProcessor{})
	if err != nil {
		t.Fatalf("buildManagedTransitProxiesYAML() error = %v", err)
	}
	if !strings.Contains(yaml, "name: transit-a") {
		t.Fatalf("expected original transit name, got:\n%s", yaml)
	}
}
