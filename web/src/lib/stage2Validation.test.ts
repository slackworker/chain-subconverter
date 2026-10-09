import { describe, expect, it } from "vitest";

import type { Stage2Catalog, Stage2FlatInstance } from "../types/api";
import {
	collectDuplicateProxyNameErrors,
	collectUnresolvedTargetErrors,
	normalizeProxyName,
	rowErrorsWithUnresolvedTargets,
} from "./stage2Validation";

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

	it("flags chain and port-forward targets that are absent from the current catalog", () => {
		const catalog: Stage2Catalog = {
			availableModes: ["none", "chain", "port_forward"],
			chainTargets: [{ name: "HK Relay Group", kind: "proxy-groups" }],
			forwardRelays: [{ name: "relay.example:1080" }],
			servers: [],
		};
		const errors = collectUnresolvedTargetErrors([
			row({ instanceId: "a::i1", sourceId: "a", proxyName: "HK 01", mode: "chain", targetName: "Old Group" }),
			row({ instanceId: "b::i1", sourceId: "b", proxyName: "HK 02", mode: "chain", targetName: "HK Relay Group" }),
			row({ instanceId: "c::i1", sourceId: "c", proxyName: "HK 03", mode: "port_forward", targetName: "missing:1" }),
			row({ instanceId: "d::i1", sourceId: "d", proxyName: "HK 04", mode: "none", targetName: "Old Group" }),
			row({ instanceId: "e::i1", sourceId: "e", proxyName: "HK 05", mode: "chain", targetName: "  " }),
		], catalog);

		expect(errors.map((error) => error.context?.proxyName)).toEqual(["HK 01", "HK 03"]);
		expect(errors.every((error) => error.code === "TARGET_NOT_FOUND" && error.context?.field === "targetName")).toBe(true);
	});

	it("keeps a stored target error without duplicating the live locator", () => {
		const catalog: Stage2Catalog = {
			availableModes: ["chain"],
			chainTargets: [],
			forwardRelays: [],
			servers: [],
		};
		const missing = row({
			instanceId: "a::i1",
			sourceId: "a",
			proxyName: "HK 01",
			mode: "chain",
			targetName: "Old Group",
		});
		const stored = collectUnresolvedTargetErrors([missing], catalog);

		expect(rowErrorsWithUnresolvedTargets(stored, missing, catalog)).toEqual(stored);
		expect(rowErrorsWithUnresolvedTargets([], missing, {
			...catalog,
			chainTargets: [{ name: "Old Group", kind: "proxies" }],
		})).toEqual([]);
	});
});
