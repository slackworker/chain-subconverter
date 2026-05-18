import { describe, expect, it } from "vitest";

import {
	addForwardRelayItem,
	buildManualSocks5URI,
	initialManualSocks5FormState,
	normalizeForwardRelayItem,
	normalizePortValue,
	normalizeServerAddress,
	parseSocks5URIToManualSocks5FormState,
	setPortForwardEnabled,
} from "./stage1";
import { initialStage1Input } from "./state";

describe("stage1 helpers", () => {
	it("normalizes valid server addresses", () => {
		expect(normalizeServerAddress(" Example.COM ")).toBe("example.com");
		expect(normalizeServerAddress("198.51.100.10")).toBe("198.51.100.10");
	});

	it("rejects invalid server addresses", () => {
		expect(() => normalizeServerAddress("198.51.100")).toThrow("必须是有效的 IPv4 或 ASCII 域名");
		expect(() => normalizeServerAddress("例子.测试")).toThrow("必须是有效的 IPv4 或 ASCII 域名");
	});

	it("normalizes valid ports and rejects invalid ones", () => {
		expect(normalizePortValue(" 01080 ")).toBe("1080");
		expect(() => normalizePortValue("0")).toThrow("必须是 1-65535 的整数");
		expect(() => normalizePortValue("65536")).toThrow("必须是 1-65535 的整数");
	});

	it("parses socks5 URIs into manual form state", () => {
		expect(
			parseSocks5URIToManualSocks5FormState(
				"socks5://demo-user:demo-pass@Proxy.Example.com:1080#Tokyo-Relay",
			),
		).toEqual({
			name: "Tokyo-Relay",
			server: "Proxy.Example.com",
			port: "1080",
			username: "demo-user",
			password: "demo-pass",
		});
	});

	it("builds manual socks5 nodes as telegram socks URIs", () => {
		expect(buildManualSocks5URI({
			...initialManualSocks5FormState,
			name: "Landing-Primary",
			server: "relay.example.com",
			port: "1080",
			username: "demo-user",
			password: "demo-pass",
		})).toBe(
			"tg://socks?server=relay.example.com&port=1080&remarks=Landing-Primary&user=demo-user&pass=demo-pass",
		);
	});

	it("normalizes forward relay entries and rejects duplicates", () => {
		expect(normalizeForwardRelayItem("Relay.EXAMPLE.com:8443")).toBe("relay.example.com:8443");

		const stage1Input = addForwardRelayItem(initialStage1Input, "relay.example.com:8443");
		expect(stage1Input.forwardRelayItems).toEqual(["relay.example.com:8443"]);
		expect(() => addForwardRelayItem(stage1Input, "relay.example.com:8443")).toThrow(
			"端口转发服务 relay.example.com:8443 已存在",
		);
	});

	it("clears forward relays when port forward is disabled", () => {
		const stage1Input = {
			...initialStage1Input,
			forwardRelayItems: ["relay-a.example.com:7443", "relay-b.example.com:8443"],
			advancedOptions: {
				...initialStage1Input.advancedOptions,
				enablePortForward: true,
			},
		};

		expect(setPortForwardEnabled(stage1Input, false)).toEqual({
			...stage1Input,
			forwardRelayItems: [],
			advancedOptions: {
				...stage1Input.advancedOptions,
				enablePortForward: false,
			},
		});
	});
});