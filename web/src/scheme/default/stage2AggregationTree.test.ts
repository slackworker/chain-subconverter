import { describe, expect, it } from "vitest";

import type { Stage2Row } from "../../types/api";
import {
	buildStage2AggregationTree,
	buildStage2AggregationTreeFromSnapshot,
	formatServerGroupLabel,
	getStage2AggregationTreeRowInlineClassName,
	getStage2FlatRowInlineClassName,
	buildStage2SourceToneMap,
} from "./stage2AggregationTree";

/** 与 stage2AggregationTree.ts 中 SOURCE_TONE_HUES 对齐，供相邻对比测试使用。 */
const SOURCE_TONE_HUES = [215, 30, 305, 250, 348, 75];

function hueDistance(a: number, b: number): number {
	const diff = Math.abs(a - b) % 360;
	return Math.min(diff, 360 - diff);
}

function minAdjacentHueDistance(toneBySourceId: Map<string, number>, sourceIds: string[]): number {
	let minDistance = 360;
	for (let index = 1; index < sourceIds.length; index += 1) {
		const previousTone = toneBySourceId.get(sourceIds[index - 1]);
		const currentTone = toneBySourceId.get(sourceIds[index]);
		if (previousTone === undefined || currentTone === undefined) {
			continue;
		}
		minDistance = Math.min(minDistance, hueDistance(SOURCE_TONE_HUES[previousTone], SOURCE_TONE_HUES[currentTone]));
	}
	return minDistance;
}

const rows: Stage2Row[] = [
	{
		instanceId: "source-a::i1",
		instanceIndex: 0,
		sourceId: "source-a",
		serverKey: "edge",
		proxyName: "Source A",
		mode: "none",
		targetName: null,
	},
	{
		instanceId: "source-a::i2",
		instanceIndex: 1,
		sourceId: "source-a",
		serverKey: "edge",
		proxyName: "Backup",
		mode: "chain",
		targetName: "Transit",
	},
	{
		instanceId: "source-b::i1",
		instanceIndex: 0,
		sourceId: "source-b",
		serverKey: "edge",
		proxyName: "Source B",
		mode: "none",
		targetName: null,
	},
];

describe("default nested aggregation tree projection", () => {
	it("renders server then source/instance DFS blocks", () => {
		const nodes = buildStage2AggregationTreeFromSnapshot({
			servers: [{
				serverKey: "edge",
				aggregation: { enabled: false },
				sources: [
					{ sourceId: "source-a", instances: rows.slice(0, 2).map(({ sourceId: _sourceId, serverKey: _serverKey, ...instance }) => instance) },
					{ sourceId: "source-b", instances: rows.slice(2).map(({ sourceId: _sourceId, serverKey: _serverKey, ...instance }) => instance) },
				],
			}],
		}, null);
		expect(nodes.map((node) => node.kind)).toEqual(["server", "row", "row", "row"]);
		expect(nodes[0]).toMatchObject({ kind: "server", server: "edge" });
		expect(nodes.slice(1).map((node) => node.kind === "row" ? node.row.instanceId : ""))
			.toEqual(rows.map((row) => row.instanceId));
	});

	it("keeps row inline classes stable", () => {
		const nodes = buildStage2AggregationTree(rows, () => null);
		const serverClasses = getStage2AggregationTreeRowInlineClassName(nodes, 0);
		expect(serverClasses).toContain("is-server");
		expect(serverClasses).not.toContain("is-source-spine-start");
		expect(serverClasses).not.toContain("is-agg-instance");
		expect(getStage2AggregationTreeRowInlineClassName(nodes, 3)).toContain("is-source-spine-end");
		expect(formatServerGroupLabel(" edge ")).toBe("edge");
	});

	it("does not draw spine upward from the first instance toward server", () => {
		const nodes = buildStage2AggregationTree(rows, () => null);
		const firstInstanceClasses = getStage2AggregationTreeRowInlineClassName(nodes, 1, {
			serverAggregationEnabled: true,
		});
		expect(firstInstanceClasses).toContain("is-source-spine-start");
		expect(firstInstanceClasses).not.toContain("is-agg-instance-tail");
	});

	it("keeps source grouping when aggregation is enabled", () => {
		const nodes = buildStage2AggregationTree(rows, () => null);
		expect(getStage2AggregationTreeRowInlineClassName(nodes, 1, { serverAggregationEnabled: true })).toContain(
			"is-grouped",
		);
		expect(getStage2AggregationTreeRowInlineClassName(nodes, 1, { serverAggregationEnabled: true })).toContain(
			"is-agg-instance",
		);
		expect(getStage2AggregationTreeRowInlineClassName(nodes, 3, { serverAggregationEnabled: true })).toContain(
			"is-agg-source-boundary",
		);
	});

	it("marks aggregation membership on instance dots", () => {
		const nodes = buildStage2AggregationTree(rows, () => null);
		expect(
			getStage2AggregationTreeRowInlineClassName(nodes, 1, {
				serverAggregationEnabled: true,
				isAggMember: true,
			}),
		).toContain("is-agg-member");
		expect(
			getStage2AggregationTreeRowInlineClassName(nodes, 2, {
				serverAggregationEnabled: true,
				isAggMember: false,
			}),
		).toContain("is-agg-non-member");
	});

	it("assigns high-contrast tones for six adjacent sources", () => {
		const sixSourceRows: Stage2Row[] = Array.from({ length: 6 }, (_, index) => ({
			instanceId: `source-${index}::i1`,
			instanceIndex: 0,
			sourceId: `source-${index}`,
			serverKey: "edge",
			proxyName: `Source ${index}`,
			mode: "none",
			targetName: null,
		}));
		const sourceIds = sixSourceRows.map((row) => row.sourceId);
		const toneBySourceId = buildStage2SourceToneMap(sixSourceRows);
		const adjacentTones = sourceIds.map((sourceId) => toneBySourceId.get(sourceId));
		expect(new Set(adjacentTones).size).toBe(6);
		for (let index = 1; index < adjacentTones.length; index += 1) {
			expect(adjacentTones[index]).not.toBe(adjacentTones[index - 1]);
		}
		expect(minAdjacentHueDistance(toneBySourceId, sourceIds)).toBeGreaterThanOrEqual(60);
	});

	it("keeps fifth through seventh adjacent sources visually separable", () => {
		const sevenSourceRows: Stage2Row[] = Array.from({ length: 7 }, (_, index) => ({
			instanceId: `source-${index}::i1`,
			instanceIndex: 0,
			sourceId: `source-${index}`,
			serverKey: "edge",
			proxyName: `Source ${index}`,
			mode: "none",
			targetName: null,
		}));
		const sourceIds = sevenSourceRows.map((row) => row.sourceId);
		const toneBySourceId = buildStage2SourceToneMap(sevenSourceRows);
		const adjacentTones = sourceIds.map((sourceId) => toneBySourceId.get(sourceId));
		expect(adjacentTones.slice(4, 7)).toEqual([3, 4, 0]);
		expect(
			hueDistance(SOURCE_TONE_HUES[adjacentTones[4] ?? 0], SOURCE_TONE_HUES[adjacentTones[5] ?? 0]),
		).toBeGreaterThanOrEqual(90);
		expect(minAdjacentHueDistance(toneBySourceId, sourceIds)).toBeGreaterThanOrEqual(60);
	});

	it("assigns adjacent-aware source tone classes", () => {
		const toneBySourceId = buildStage2SourceToneMap(rows);
		expect(toneBySourceId.get("source-a")).toBe(0);
		expect(toneBySourceId.get("source-b")).toBe(1);
		expect(toneBySourceId.get("source-a")).not.toBe(toneBySourceId.get("source-b"));
		expect(getStage2FlatRowInlineClassName(rows, 0, rows[0], true, toneBySourceId)).toContain(
			`is-source-tone-${toneBySourceId.get("source-a")}`,
		);
		expect(getStage2FlatRowInlineClassName(rows, 2, rows[2], true, toneBySourceId)).toContain(
			`is-source-tone-${toneBySourceId.get("source-b")}`,
		);
	});

	it("keeps adjacent different sources on distinct tones in aggregation tree blocks", () => {
		const nodes = buildStage2AggregationTree(rows, () => null);
		const toneBySourceId = buildStage2SourceToneMap(rows);
		const sourceAClasses = getStage2AggregationTreeRowInlineClassName(nodes, 1, { toneBySourceId });
		const sourceBClasses = getStage2AggregationTreeRowInlineClassName(nodes, 3, { toneBySourceId });
		const sourceATone = sourceAClasses.match(/is-source-tone-(\d)/)?.[1];
		const sourceBTone = sourceBClasses.match(/is-source-tone-(\d)/)?.[1];
		expect(sourceATone).toBeDefined();
		expect(sourceBTone).toBeDefined();
		expect(sourceATone).not.toBe(sourceBTone);
	});

	it("uses the same source tone map as the flat table across server blocks", () => {
		const multiServerRows: Stage2Row[] = [
			{
				instanceId: "source-a::i1",
				instanceIndex: 0,
				sourceId: "source-a",
				serverKey: "edge",
				proxyName: "Edge A",
				mode: "none",
				targetName: null,
			},
			{
				instanceId: "source-b::i1",
				instanceIndex: 0,
				sourceId: "source-b",
				serverKey: "edge",
				proxyName: "Edge B",
				mode: "none",
				targetName: null,
			},
			{
				instanceId: "source-c::i1",
				instanceIndex: 0,
				sourceId: "source-c",
				serverKey: "core",
				proxyName: "Core C",
				mode: "none",
				targetName: null,
			},
			{
				instanceId: "source-a::i2",
				instanceIndex: 1,
				sourceId: "source-a",
				serverKey: "core",
				proxyName: "Core A",
				mode: "none",
				targetName: null,
			},
		];
		const toneBySourceId = buildStage2SourceToneMap(multiServerRows);
		const nodes = buildStage2AggregationTree(multiServerRows, () => null);
		const coreSourceARowIndex = nodes.findIndex(
			(node) => node.kind === "row" && node.row.instanceId === "source-a::i2",
		);
		expect(coreSourceARowIndex).toBeGreaterThan(0);

		const flatToneClass = getStage2FlatRowInlineClassName(
			multiServerRows,
			3,
			multiServerRows[3],
			true,
			toneBySourceId,
		);
		const treeToneClass = getStage2AggregationTreeRowInlineClassName(nodes, coreSourceARowIndex, {
			toneBySourceId,
		});
		expect(treeToneClass).toContain(flatToneClass.match(/is-source-tone-\d/)?.[0] ?? "");
	});
});
