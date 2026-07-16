import { describe, expect, it } from "vitest";

import type { Stage2Row } from "../../types/api";
import {
	buildStage2AggregationTree,
	buildStage2AggregationTreeFromSnapshot,
	formatServerGroupLabel,
	getStage2AggregationTreeRowInlineClassName,
	getStage2FlatRowInlineClassName,
	getStage2SourceToneClassName,
} from "./stage2AggregationTree";

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

	it("assigns stable source tone classes", () => {
		expect(getStage2SourceToneClassName("source-a")).toBe(getStage2SourceToneClassName("source-a"));
		expect(getStage2FlatRowInlineClassName(rows, 0, rows[0], true)).toContain("is-source-tone-");
	});
});
