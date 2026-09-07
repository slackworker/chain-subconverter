import { describe, expect, it } from "vitest";

import { formatModeReason } from "./mode-reason";

describe("formatModeReason", () => {
	it("maps protocol warning in Chinese", () => {
		expect(
			formatModeReason({
				reasonCode: "DISCOURAGED_BY_LANDING_PROTOCOL",
				reasonArgs: { landingProtocolType: "vless-reality" },
			}),
		).toContain("Reality/ShadowTLS");
	});

	it("maps port warning with args", () => {
		expect(
			formatModeReason({
				reasonCode: "DISCOURAGED_BY_LANDING_PORT",
				reasonArgs: { landingPort: 44333, recommendedPortMax: 10000 },
			}),
		).toBe(
			"当前落地节点端口为 44333；若选择链式代理，建议使用 10000 以内端口，避免部分机场对 10000 以上高位端口进行屏蔽导致不通",
		);
	});

	it("merges combined warning", () => {
		const text = formatModeReason({
			reasonCode: "DISCOURAGED_BY_LANDING_PROTOCOL_AND_PORT",
			reasonArgs: { landingPort: 44333, recommendedPortMax: 10000 },
		});
		expect(text).toContain("Reality/ShadowTLS");
		expect(text).toContain("44333");
	});

	it("formats restore conflict reasons with row context", () => {
		expect(
			formatModeReason({
				reasonCode: "TARGET_NOT_FOUND",
				reasonArgs: { proxyName: "HK 02", sourceId: "HK 02", field: "targetName" },
			}),
		).toBe("行「HK 02」：引用的目标在当前模板中不存在");
	});

	it("formats rowset mismatch restore conflicts with landing identity", () => {
		expect(
			formatModeReason({
				reasonCode: "STAGE2_ROWSET_MISMATCH",
				reasonArgs: { sourceId: "HK Landing" },
			}),
		).toBe("当前环境缺少落地节点「HK Landing」对应的 Stage 2 实例");
	});

	it("formats aggregation restore conflicts with locating args", () => {
		expect(
			formatModeReason({
				reasonCode: "SERVER_AGGREGATION_MEMBER_NOT_FOUND",
				reasonArgs: { serverKey: "hk.example.com", proxyName: "ghost-a" },
			}),
		).toBe("行「ghost-a」：恢复的配置引用了当前环境中不存在的聚合成员行");
	});

	it("formats template config restore conflicts", () => {
		expect(
			formatModeReason({
				reasonCode: "INVALID_REQUEST",
				reasonArgs: { field: "config" },
			}),
		).toBe("当前快照使用的模板 URL 已失效或不再可用");
	});

	it("formats landing and transit source fetch restore conflicts", () => {
		expect(
			formatModeReason({
				reasonCode: "SOURCE_FETCH_FAILED",
				reasonArgs: { userInputSource: "transit" },
			}),
		).toBe("中转源暂时不可用");
		expect(
			formatModeReason({
				reasonCode: "SOURCE_FETCH_FAILED",
				reasonArgs: { userInputSource: "landing" },
			}),
		).toBe("落地源暂时不可用");
	});

	it("formats legacy payload version restore conflicts", () => {
		expect(
			formatModeReason({
				reasonCode: "LEGACY_PAYLOAD_VERSION",
				reasonArgs: { payloadVersion: 4, currentVersion: 5 },
			}),
		).toBe("链接载荷版本 v4 与当前 v5 不兼容：已还原阶段 1，阶段 2 及之后需重新转换");
	});

	it("falls back to reasonCode for unknown codes", () => {
		expect(formatModeReason({ reasonCode: "CUSTOM_REASON" })).toBe("CUSTOM_REASON");
	});

	it("prefers reasonCode mapping over legacy reasonText", () => {
		expect(
			formatModeReason({
				reasonCode: "DISCOURAGED_BY_LANDING_PROTOCOL",
				reasonText: "legacy text",
			}),
		).toContain("Reality/ShadowTLS");
	});

	it("falls back to legacy reasonText when reasonCode is absent", () => {
		expect(formatModeReason({ reasonText: "legacy restriction message" })).toBe(
			"legacy restriction message",
		);
	});
});
