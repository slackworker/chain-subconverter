import { describe, expect, it } from "vitest";

import type { Stage2Catalog, Stage2Snapshot } from "../types/api";
import {
	cloneInstance,
	defaultSnapshotFromCatalog,
	deleteInstance,
	findCatalogSource,
	findInstance,
	flattenInstances,
	hydrateInstanceIds,
	mergeSnapshotAfterConvert,
	normalizeSnapshotForRequest,
	renameInstance,
	resetInstanceFromCatalog,
	getStage2RowStableKey,
} from "./stage2";

const catalog: Stage2Catalog = {
	availableModes: ["none", "chain"],
	chainTargets: [{ name: "Transit", kind: "proxy-groups" }],
	forwardRelays: [],
	servers: [{
		serverKey: "edge-a",
		sources: [{
			sourceId: "landing-a",
			landingNodeType: "ss",
			defaultProxyName: "Landing A",
			defaultMode: "none",
			defaultTargetName: null,
		}],
	}],
};

describe("nested stage2 utilities", () => {
	it("builds and flattens the default DFS snapshot", () => {
		const snapshot = defaultSnapshotFromCatalog(catalog);
		expect(snapshot.servers[0].aggregation).toEqual({ enabled: false });
		expect(flattenInstances(snapshot, catalog)).toEqual([expect.objectContaining({
			instanceId: "landing-a::i1",
			instanceIndex: 0,
			sourceId: "landing-a",
			serverKey: "edge-a",
			landingNodeType: "ss",
		})]);
		expect(findCatalogSource(catalog, " landing-a ")?.serverKey).toBe("edge-a");
		expect(findInstance(snapshot, "landing-a::i1")?.source.sourceId).toBe("landing-a");
	});

	it("appends clones to the end of the source instance group", () => {
		let snapshot = defaultSnapshotFromCatalog(catalog);
		snapshot = cloneInstance(snapshot, "landing-a::i1");
		snapshot = cloneInstance(snapshot, "landing-a::i1");
		snapshot = cloneInstance(snapshot, "landing-a::i1");
		expect(flattenInstances(snapshot).map((row) => row.proxyName)).toEqual([
			"Landing A",
			"Landing A 2",
			"Landing A 3",
			"Landing A 4",
		]);
	});

	it("clones, keeps aggregation membership on rename, and protects the final instance", () => {
		let snapshot = defaultSnapshotFromCatalog(catalog);
		snapshot = cloneInstance(snapshot, "instanceId:landing-a::i1");
		expect(flattenInstances(snapshot).map((row) => row.proxyName)).toEqual(["Landing A", "Landing A 2"]);
		const clonedId = flattenInstances(snapshot).find((row) => row.proxyName === "Landing A 2")?.instanceId;
		expect(clonedId).toBe("landing-a::i2");
		snapshot = {
			...snapshot,
			servers: [{
				...snapshot.servers[0],
				aggregation: {
					enabled: true,
					strategy: "fallback",
					memberLocalInstanceIds: [clonedId!],
				},
			}],
		};
		snapshot = renameInstance(snapshot, clonedId!, "Backup");
		expect(snapshot.servers[0].aggregation.memberLocalInstanceIds).toEqual([clonedId]);
		expect(flattenInstances(snapshot).find((row) => row.instanceId === clonedId)?.proxyName).toBe("Backup");
		snapshot = deleteInstance(snapshot, clonedId!);
		expect(flattenInstances(snapshot)).toHaveLength(1);
		expect(deleteInstance(snapshot, "landing-a::i1")).toBe(snapshot);
	});

	it("merges by sourceId under the new server and resets an instance locally", () => {
		const current = renameInstance(defaultSnapshotFromCatalog(catalog), "landing-a::i1", "Custom");
		const movedCatalog: Stage2Catalog = {
			...catalog,
			servers: [{ ...catalog.servers[0], serverKey: "edge-b" }],
		};
		const merged = mergeSnapshotAfterConvert(current, movedCatalog, defaultSnapshotFromCatalog(movedCatalog));
		expect(flattenInstances(merged)[0]).toMatchObject({
			serverKey: "edge-b",
			sourceId: "landing-a",
			proxyName: "Custom",
			instanceId: "landing-a::i1",
		});
		expect(flattenInstances(resetInstanceFromCatalog(merged, movedCatalog, "landing-a::i1"))[0])
			.toMatchObject({ proxyName: "Landing A", mode: "none", targetName: null });
	});

	it("keeps stable React keys while renaming proxyName", () => {
		const snapshot = defaultSnapshotFromCatalog(catalog);
		const [row] = flattenInstances(snapshot);
		const stableKey = getStage2RowStableKey(row);
		const renamed = renameInstance(snapshot, row.instanceId, "Custom");
		const [renamedRow] = flattenInstances(renamed);
		expect(getStage2RowStableKey(renamedRow)).toBe(stableKey);
		expect(renamedRow.instanceId).toBe("landing-a::i1");
	});

	it("hydrates ordinal ids from wire snapshots", () => {
		const wire: Stage2Snapshot = {
			servers: [{
				serverKey: "edge-a",
				aggregation: { enabled: false },
				sources: [{
					sourceId: "landing-a",
					instances: [
						{ instanceId: "", proxyName: "Landing A", mode: "none", targetName: null },
						{ instanceId: "", proxyName: "Landing A 2", mode: "none", targetName: null },
					],
				}],
			}],
		};
		expect(flattenInstances(hydrateInstanceIds(wire)).map((row) => row.instanceId))
			.toEqual(["landing-a::i1", "landing-a::i2"]);
	});

	it("strips disabled aggregation drafts and maps members for request snapshots", () => {
		const snapshot: Stage2Snapshot = defaultSnapshotFromCatalog(catalog);
		snapshot.servers[0].aggregation = {
			enabled: false,
			groupName: "must-not-leak",
			strategy: "fallback",
			memberLocalInstanceIds: ["landing-a::i1"],
		};
		expect(normalizeSnapshotForRequest(snapshot).servers[0].aggregation).toEqual({ enabled: false });

		const aggregated = defaultSnapshotFromCatalog(catalog);
		const cloned = cloneInstance(aggregated, "landing-a::i1");
		const memberId = flattenInstances(cloned).find((row) => row.proxyName === "Landing A 2")?.instanceId;
		cloned.servers[0].aggregation = {
			enabled: true,
			strategy: "fallback",
			memberLocalInstanceIds: ["landing-a::i1", memberId!],
		};
		const request = normalizeSnapshotForRequest(cloned);
		expect(request.servers[0].sources[0].instances[0]).not.toHaveProperty("instanceId");
		expect(request.servers[0].aggregation).toEqual({
			enabled: true,
			strategy: "fallback",
			memberProxyNames: ["Landing A", "Landing A 2"],
		});
	});
});
