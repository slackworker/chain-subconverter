import { describe, expect, it } from "vitest";

import { getStage2RowStrictKey } from "../../lib/stage2";
import type { Stage2InitRow, Stage2Row } from "../../types/api";
import { buildStage2AggregationTree, formatServerGroupLabel, formatStage2TreeGlyph, getStage2AggregationTreeRowInlineClassName } from "./stage2AggregationTree";

type RowSpec = {
	row: Stage2Row;
	server?: string;
	landingNodeType?: string;
};

function buildMetaLookup(specs: RowSpec[]) {
	const metaByKey = new Map<string, Pick<Stage2InitRow, "server" | "landingNodeType">>();
	for (const spec of specs) {
		metaByKey.set(getStage2RowStrictKey(spec.row), {
			server: spec.server,
			landingNodeType: spec.landingNodeType ?? "SS",
		});
	}
	return (rowKey: string) => metaByKey.get(rowKey);
}

describe("buildStage2AggregationTree", () => {
	it("groups rows by server and nests derived rows under source rows", () => {
		const specs: RowSpec[] = [
			{
				row: {
					rowId: "ss",
					landingNodeName: "ss",
					proxyName: "ss",
					sourceLandingNodeName: "ss",
					mode: "chain",
					targetName: "HK",
				},
				server: "a.b.c",
				landingNodeType: "SS",
			},
			{
				row: {
					rowId: "hk-2",
					landingNodeName: "ss 02",
					proxyName: "ss 02",
					sourceLandingNodeName: "ss",
					mode: "chain",
					targetName: "SG",
				},
				server: "a.b.c",
				landingNodeType: "SS",
			},
			{
				row: {
					rowId: "Reality",
					landingNodeName: "Reality",
					proxyName: "Reality",
					sourceLandingNodeName: "Reality",
					mode: "none",
					targetName: null,
				},
				server: "a.b.c",
				landingNodeType: "Reality",
			},
		];

		const rows = specs.map((spec) => spec.row);
		const nodes = buildStage2AggregationTree(rows, buildMetaLookup(specs));
		expect(nodes.map((node) => node.kind)).toEqual(["server", "row", "row", "row"]);
		expect(nodes[0]).toMatchObject({ kind: "server", displayServer: "a.b.c" });
		expect(nodes[1]).toMatchObject({
			kind: "row",
			depth: 1,
			glyphParts: { continuation: "", branch: "mid", depth: 1, childGuide: false },
			isSource: true,
			rowKey: "rowId:Reality",
		});
		expect(nodes[2]).toMatchObject({
			kind: "row",
			depth: 1,
			glyphParts: { continuation: "", branch: "last", depth: 1, childGuide: true },
			isSource: true,
			rowKey: "rowId:ss",
		});
		expect(nodes[3]).toMatchObject({
			kind: "row",
			depth: 2,
			glyphParts: { continuation: "", branch: "last", depth: 2 },
			isSource: false,
			rowKey: "rowId:hk-2",
		});
		expect(formatStage2TreeGlyph(nodes[1].kind === "row" ? nodes[1].glyphParts : { continuation: "", branch: "last", depth: 1 })).toBe("├── ");
		expect(formatStage2TreeGlyph(nodes[3].kind === "row" ? nodes[3].glyphParts : { continuation: "", branch: "last", depth: 1 })).toBe("    └── ");
	});

	it("draws continuation spine for derived rows under a non-last source group", () => {
		const specs: RowSpec[] = [
			{
				row: {
					rowId: "src-a",
					landingNodeName: "src-a",
					proxyName: "src-a",
					sourceLandingNodeName: "src-a",
					mode: "none",
					targetName: null,
				},
				server: "host",
			},
			{
				row: {
					rowId: "derived-a",
					landingNodeName: "derived-a",
					proxyName: "derived-a",
					sourceLandingNodeName: "src-a",
					mode: "none",
					targetName: null,
				},
				server: "host",
			},
			{
				row: {
					rowId: "src-b",
					landingNodeName: "src-b",
					proxyName: "src-b",
					sourceLandingNodeName: "src-b",
					mode: "none",
					targetName: null,
				},
				server: "host",
			},
		];

		const nodes = buildStage2AggregationTree(
			specs.map((spec) => spec.row),
			buildMetaLookup(specs),
		);
		const rowNodes = nodes.filter((node) => node.kind === "row");
		expect(rowNodes[0]).toMatchObject({
			glyphParts: { continuation: "", branch: "mid", depth: 1, childGuide: true },
		});
		expect(rowNodes.map((node) => formatStage2TreeGlyph(node.glyphParts))).toEqual(["├── ", "│   └── ", "└── "]);
	});

	it("sorts servers and source groups deterministically", () => {
		const specs: RowSpec[] = [
			{
				row: {
					rowId: "node-b",
					landingNodeName: "node-b",
					mode: "none",
					targetName: null,
				},
				server: "b.example.com",
			},
			{
				row: {
					rowId: "node-a",
					landingNodeName: "node-a",
					mode: "none",
					targetName: null,
				},
				server: "a.example.com",
			},
		];

		const rows = specs.map((spec) => spec.row);
		const nodes = buildStage2AggregationTree(rows, buildMetaLookup(specs));
		expect(nodes.filter((node) => node.kind === "server").map((node) => node.displayServer)).toEqual([
			"a.example.com",
			"b.example.com",
		]);
	});

	it("uses source fallback key when server is empty", () => {
		const specs: RowSpec[] = [
			{
				row: {
					rowId: "solo",
					landingNodeName: "solo",
					sourceLandingNodeName: "solo",
					mode: "none",
					targetName: null,
				},
			},
		];

		const rows = specs.map((spec) => spec.row);
		const nodes = buildStage2AggregationTree(rows, buildMetaLookup(specs));
		expect(nodes[0]).toMatchObject({ kind: "server", server: "source:solo", displayServer: "solo" });
	});
});

describe("formatServerGroupLabel", () => {
	it("removes srv prefix and keeps server value", () => {
		expect(formatServerGroupLabel("a.b.c")).toBe("a.b.c");
		expect(formatServerGroupLabel("")).toBe("--");
	});
});

describe("getStage2AggregationTreeRowInlineClassName", () => {
	it("marks server block with spine from server through last child and dot roles per row", () => {
		const specs: RowSpec[] = [
			{
				row: {
					rowId: "ss",
					landingNodeName: "ss",
					proxyName: "ss",
					sourceLandingNodeName: "ss",
					mode: "none",
					targetName: null,
				},
				server: "host",
			},
			{
				row: {
					rowId: "hk-2",
					landingNodeName: "ss 02",
					proxyName: "ss 02",
					sourceLandingNodeName: "ss",
					mode: "none",
					targetName: null,
				},
				server: "host",
			},
		];

		const nodes = buildStage2AggregationTree(
			specs.map((spec) => spec.row),
			buildMetaLookup(specs),
		);

		expect(getStage2AggregationTreeRowInlineClassName(nodes, 0)).toBe(
			"a-stage2-row-inline is-grouped is-server is-group-start",
		);
		expect(getStage2AggregationTreeRowInlineClassName(nodes, 1)).toBe(
			"a-stage2-row-inline is-grouped is-source",
		);
		expect(getStage2AggregationTreeRowInlineClassName(nodes, 2)).toBe(
			"a-stage2-row-inline is-grouped is-derived is-group-end",
		);
	});

	it("starts a new spine block at each server row", () => {
		const specs: RowSpec[] = [
			{
				row: {
					rowId: "node-a",
					landingNodeName: "node-a",
					mode: "none",
					targetName: null,
				},
				server: "a.example.com",
			},
			{
				row: {
					rowId: "node-b",
					landingNodeName: "node-b",
					mode: "none",
					targetName: null,
				},
				server: "b.example.com",
			},
		];

		const nodes = buildStage2AggregationTree(
			specs.map((spec) => spec.row),
			buildMetaLookup(specs),
		);

		expect(getStage2AggregationTreeRowInlineClassName(nodes, 0)).toBe(
			"a-stage2-row-inline is-grouped is-server is-group-start",
		);
		expect(getStage2AggregationTreeRowInlineClassName(nodes, 1)).toBe(
			"a-stage2-row-inline is-grouped is-source is-group-end",
		);
		expect(getStage2AggregationTreeRowInlineClassName(nodes, 2)).toBe(
			"a-stage2-row-inline is-grouped is-server is-group-start",
		);
		expect(getStage2AggregationTreeRowInlineClassName(nodes, 3)).toBe(
			"a-stage2-row-inline is-grouped is-source is-group-end",
		);
	});
});
