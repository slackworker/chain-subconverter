import { describe, expect, it } from "vitest";

import type { Stage2FlatInstance } from "../types/api";
import { collectDuplicateProxyNameErrors, normalizeProxyName } from "./stage2Validation";

function row(overrides: Partial<Stage2FlatInstance> & Pick<Stage2FlatInstance, "instanceId" | "sourceId" | "proxyName">): Stage2FlatInstance {
	return {
		instanceIndex: 0,
		serverKey: "edge",
		landingNodeType: "ss",
		mode: "none",
		targetName: null,
		...overrides,
	};
}

describe("stage2Validation", () => {
	it("normalizes proxy names with trim", () => {
		expect(normalizeProxyName("  HK 01  ")).toBe("HK 01");
	});

	it("returns no errors when proxy names are unique", () => {
		expect(collectDuplicateProxyNameErrors([
			row({ instanceId: "a::i1", sourceId: "a", proxyName: "HK 01" }),
			row({ instanceId: "b::i1", sourceId: "b", proxyName: "HK 02" }),
		])).toEqual([]);
	});

	it("flags every row in a duplicate group after trim", () => {
		const errors = collectDuplicateProxyNameErrors([
			row({ instanceId: "landing::i1", sourceId: "landing", proxyName: "HK Landing" }),
			row({ instanceId: "landing::i2", sourceId: "landing", proxyName: " HK Landing " }),
		]);

		expect(errors).toHaveLength(2);
		expect(errors.every((error) => error.code === "DUPLICATE_PROXY_NAME")).toBe(true);
		expect(errors[0]).toMatchObject({
			message: "duplicate proxy name",
			scope: "stage2_instance",
			context: {
				sourceId: "landing",
				proxyName: "HK Landing",
				field: "proxyName",
			},
		});
	});
});
