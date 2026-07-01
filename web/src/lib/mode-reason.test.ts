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
				reasonArgs: { rowId: "HK 02", field: "targetName" },
			}),
		).toBe("行「HK 02」：引用的目标在当前模板中不存在");
	});

	it("formats template config restore conflicts", () => {
		expect(
			formatModeReason({
				reasonCode: "INVALID_REQUEST",
				reasonArgs: { field: "config" },
			}),
		).toBe("当前快照使用的模板 URL 已失效或不再可用");
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
