import { describe, expect, it } from "vitest";

import { defaultSnapshotFromCatalog, flattenInstances } from "../lib/stage2";
import { initialAppState, type AppState } from "../lib/state";
import type { Stage2Bundle, Stage2Catalog } from "../types/api";
import {
	applyDuplicateProxyNameValidationState,
	applyStage1ConvertSuccessState,
	cloneStage2RowState,
	deleteStage2RowState,
	setServerAggregationEnabledState,
	updateServerAggregationGroupState,
	updateStage2ProxyNameState,
	updateStage2RowState,
} from "./useAppWorkflow.state";

const catalog: Stage2Catalog = {
	availableModes: ["none", "chain"],
	chainTargets: [{ name: "Transit", kind: "proxy-groups" }],
	forwardRelays: [],
	servers: [{
		serverKey: "edge",
		sources: [{
			sourceId: "landing",
			landingNodeType: "ss",
			defaultProxyName: "Landing",
			defaultMode: "none",
			defaultTargetName: null,
		}],
	}],
};

const bundle: Stage2Bundle = { catalog, snapshot: defaultSnapshotFromCatalog(catalog) };

function convertedState(): AppState {
	return applyStage1ConvertSuccessState(initialAppState, bundle, [], [], [], true);
}

describe("useAppWorkflow nested state", () => {
	it("merges reconvert by sourceId but overwrite reset replaces the snapshot", () => {
		const edited = updateStage2RowState(convertedState(), "landing::i1", (instance) => ({
			...instance,
			proxyName: "Custom",
		}));
		const withDraft = {
			...edited,
			aggregationDraftsByServerKey: {
				edge: { enabled: true, strategy: "fallback" as const, memberLocalInstanceIds: [] },
			},
		};
		const merged = applyStage1ConvertSuccessState(withDraft, bundle, [], [], [], false);
		expect(flattenInstances(merged.stage2Snapshot)[0].proxyName).toBe("Custom");
		expect(merged.aggregationDraftsByServerKey.edge).toBeDefined();
		const reset = applyStage1ConvertSuccessState(merged, bundle, [], [], [], true);
		expect(flattenInstances(reset.stage2Snapshot)[0].proxyName).toBe("Landing");
		expect(reset.aggregationDraftsByServerKey).toEqual({});
	});

	it("clones, renames without changing instanceId, and prevents deleting the final instance", () => {
		let state = cloneStage2RowState(convertedState(), "landing::i1");
		state = updateStage2RowState(state, "landing::i2", (instance) => ({
			...instance,
			proxyName: "Backup",
		}));
		expect(flattenInstances(state.stage2Snapshot).map((row) => row.instanceId))
			.toEqual(["landing::i1", "landing::i2"]);
		state = deleteStage2RowState(state, "landing::i2");
		const unchanged = deleteStage2RowState(state, "landing::i1");
		expect(unchanged).toBe(state);
	});

	it("moves disabled aggregation into drafts and restores it when enabled", () => {
		let state = cloneStage2RowState(convertedState(), "landing::i1");
		state = updateServerAggregationGroupState(
			state,
			"edge",
			true,
			"fallback",
			"landing::i1",
			true,
		);
		state = updateServerAggregationGroupState(
			state,
			"edge",
			true,
			"fallback",
			"landing::i2",
			true,
		);
		state = setServerAggregationEnabledState(state, "edge", false);
		expect(state.stage2Snapshot.servers[0].aggregation).toEqual({ enabled: false });
		expect(state.aggregationDraftsByServerKey.edge.memberLocalInstanceIds).toHaveLength(2);
		state = setServerAggregationEnabledState(state, "edge", true);
		expect(state.stage2Snapshot.servers[0].aggregation).toMatchObject({
			enabled: true,
			strategy: "fallback",
			memberLocalInstanceIds: ["landing::i1", "landing::i2"],
		});
		expect(state.aggregationDraftsByServerKey).toEqual({});
	});

	it("validates duplicate proxy names on blur and clears them while editing", () => {
		let state = cloneStage2RowState(convertedState(), "landing::i1");
		state = updateStage2ProxyNameState(state, "landing::i2", "Landing");
		state = applyDuplicateProxyNameValidationState(state);

		expect(state.blockingErrors).toHaveLength(2);
		expect(state.blockingErrors.every((error) => error.code === "DUPLICATE_PROXY_NAME")).toBe(true);
		expect(state.responseOriginStage).toBe("stage2");

		state = updateStage2ProxyNameState(state, "landing::i2", "Backup");
		expect(state.blockingErrors).toEqual([]);

		state = applyDuplicateProxyNameValidationState(state);
		expect(state.blockingErrors).toEqual([]);
	});
});
