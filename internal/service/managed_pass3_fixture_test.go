package service

import (
	"strings"
	"testing"
)

func TestSynthesizeManagedPass3FullBaseYAML_RemapsDiscoveryNamesAndProxies(t *testing.T) {
	stage1FullBase := strings.Join([]string{
		"proxies:",
		"- {name: Alpha-SS-SG, type: ss, server: 198.51.100.10, port: 443}",
		"- {name: transit-a, type: ss, server: transit.example.com, port: 443}",
		"proxy-groups:",
		"  - name: ♻️ 自动选择",
		"    type: url-test",
		"    proxies:",
		"      - Alpha-SS-SG",
		"      - transit-a",
		"  - name: 🚀 手动选择",
		"    type: select",
		"    proxies:",
		"      - Alpha-SS-SG",
		"      - transit-a",
		"",
	}, "\n")
	landingDiscovery := "proxies:\n- {name: Alpha-SS-SG, type: ss, server: 198.51.100.10, port: 443}\n"
	managedLanding := strings.Join([]string{
		"proxies:",
		"  - {name: 🇸🇬 Alpha-SS-SG, type: ss, server: 198.51.100.10, port: 443, dialer-proxy: 🇸🇬 新加坡节点}",
		"  - {name: 🇸🇬 Alpha-SS-SG 2, type: ss, server: 198.51.100.10, port: 443, dialer-proxy: 🇭🇰 香港节点}",
		"",
	}, "\n")
	managedTransit := "proxies:\n  - {name: transit-a, type: ss, server: transit.example.com, port: 443}\n"

	got, err := SynthesizeManagedPass3FullBaseYAML(stage1FullBase, landingDiscovery, managedLanding, managedTransit)
	if err != nil {
		t.Fatalf("SynthesizeManagedPass3FullBaseYAML() error = %v", err)
	}

	for _, want := range []string{
		"  - {name: 🇸🇬 Alpha-SS-SG, type: ss, server: 198.51.100.10, port: 443, dialer-proxy: 🇸🇬 新加坡节点}",
		"  - {name: 🇸🇬 Alpha-SS-SG 2, type: ss, server: 198.51.100.10, port: 443, dialer-proxy: 🇭🇰 香港节点}",
		"  - {name: transit-a, type: ss, server: transit.example.com, port: 443}",
		"      - 🇸🇬 Alpha-SS-SG\n      - 🇸🇬 Alpha-SS-SG 2\n      - transit-a",
	} {
		if !strings.Contains(got, want) {
			t.Fatalf("synthesized YAML missing %q:\n%s", want, got)
		}
	}
	if strings.Contains(got, "- {name: Alpha-SS-SG,") {
		t.Fatalf("discovery landing proxy line should be replaced:\n%s", got)
	}
	if strings.Contains(got, "      - Alpha-SS-SG\n") {
		t.Fatalf("discovery landing group member should be expanded:\n%s", got)
	}
}
