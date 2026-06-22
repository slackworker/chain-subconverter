import {
	getStage2RowDisplayName,
	getStage2RowSourceLandingName,
	getStage2RowStrictKey,
	isStage2SourceRow,
} from "../../lib/stage2";
import type { Stage2InitRow, Stage2Row } from "../../types/api";

export type Stage2TreeBranch = "mid" | "last";

/** 树状导轨语义：延续竖线、分支位置、子级导轨等。 */
export type Stage2TreeGlyphParts = {
	continuation: "│" | "";
	branch: Stage2TreeBranch;
	depth: 1 | 2;
	/** depth 1 源行下方仍有派生行时，向下引出子级竖线导轨。 */
	childGuide?: boolean;
};

export const STAGE2_TREE_GLYPH_ROOT: Stage2TreeGlyphParts = {
	continuation: "",
	branch: "last",
	depth: 1,
	childGuide: false,
};

export type Stage2TreeServerNode = {
	kind: "server";
	server: string;
	displayServer: string;
	anchorRowKey: string;
};

export type Stage2TreeRowNode = {
	kind: "row";
	row: Stage2Row;
	rowKey: string;
	depth: 1 | 2;
	glyphParts: Stage2TreeGlyphParts;
	isSource: boolean;
};

export type Stage2TreeNode = Stage2TreeServerNode | Stage2TreeRowNode;

export type Stage2RowMetaLookup = (rowKey: string) => Pick<Stage2InitRow, "server"> | null | undefined;

function getRowServerKey(row: Stage2Row, getRowMeta: Stage2RowMetaLookup): string {
	const rowKey = getStage2RowStrictKey(row);
	const server = getRowMeta(rowKey)?.server?.trim() ?? "";
	if (server !== "") {
		return server;
	}
	return `source:${getStage2RowSourceLandingName(row)}`;
}

function getRowDisplayServer(row: Stage2Row, getRowMeta: Stage2RowMetaLookup): string {
	const rowKey = getStage2RowStrictKey(row);
	return getRowMeta(rowKey)?.server?.trim() ?? "";
}

function buildSourceGlyphParts(sourceBranch: Stage2TreeBranch, hasDerivedBelow: boolean): Stage2TreeGlyphParts {
	return {
		continuation: "",
		branch: sourceBranch,
		depth: 1,
		childGuide: hasDerivedBelow,
	};
}

function buildDerivedGlyphParts(
	sourceBranch: Stage2TreeBranch,
	derivedBranch: Stage2TreeBranch,
): Stage2TreeGlyphParts {
	return {
		continuation: sourceBranch === "mid" ? "│" : "",
		branch: derivedBranch,
		depth: 2,
	};
}

export function formatStage2TreeGlyph(parts: Stage2TreeGlyphParts): string {
	const connector = parts.branch === "mid" ? "├── " : "└── ";
	if (parts.depth === 1) {
		return connector;
	}
	const indent = parts.continuation === "│" ? "   " : "    ";
	return `${parts.continuation}${indent}${connector}`;
}

/** SVG 导轨占位宽度（px），与 Stage2TreeGlyph 渲染一致。 */
export const STAGE2_TREE_GLYPH_WIDTH_PX = 24;

export function getStage2TreeGlyphWidthPx(_parts?: Stage2TreeGlyphParts): number {
	return STAGE2_TREE_GLYPH_WIDTH_PX;
}

/** 列宽 canvas 测量用等宽占位，对齐 SVG 导轨 + flex gap。 */
export function formatStage2TreeGlyphMeasureSpacer(_parts?: Stage2TreeGlyphParts): string {
	return "\u2007".repeat(3);
}

function sortRowsByDisplayName(rows: Stage2Row[]): Stage2Row[] {
	return [...rows].sort((left, right) =>
		getStage2RowDisplayName(left).localeCompare(getStage2RowDisplayName(right)),
	);
}

function partitionSourceGroups(rows: Stage2Row[]): Map<string, Stage2Row[]> {
	const groups = new Map<string, Stage2Row[]>();
	for (const row of rows) {
		const sourceLandingName = getStage2RowSourceLandingName(row);
		const bucket = groups.get(sourceLandingName) ?? [];
		bucket.push(row);
		groups.set(sourceLandingName, bucket);
	}
	return groups;
}

function orderSourceGroupRows(rows: Stage2Row[]): Stage2Row[] {
	const sourceRows = rows.filter((row) => isStage2SourceRow(row));
	const derivedRows = rows.filter((row) => !isStage2SourceRow(row));
	const primarySource = sourceRows[0] ?? derivedRows[0];
	if (!primarySource) {
		return [];
	}
	const orderedSource = sourceRows.length > 0 ? sortRowsByDisplayName(sourceRows)[0] : primarySource;
	const orderedDerived = sortRowsByDisplayName(
		derivedRows.filter((row) => getStage2RowStrictKey(row) !== getStage2RowStrictKey(orderedSource)),
	);
	return [orderedSource, ...orderedDerived];
}

export function buildStage2AggregationTree(
	rows: Stage2Row[],
	getRowMeta: Stage2RowMetaLookup,
): Stage2TreeNode[] {
	if (rows.length === 0) {
		return [];
	}

	const rowsByServer = new Map<string, Stage2Row[]>();
	for (const row of rows) {
		const serverKey = getRowServerKey(row, getRowMeta);
		const bucket = rowsByServer.get(serverKey) ?? [];
		bucket.push(row);
		rowsByServer.set(serverKey, bucket);
	}

	const serverKeys = [...rowsByServer.keys()].sort((left, right) => left.localeCompare(right));
	const nodes: Stage2TreeNode[] = [];

	for (const serverKey of serverKeys) {
		const serverRows = rowsByServer.get(serverKey) ?? [];
		if (serverRows.length === 0) {
			continue;
		}

		const anchorRow = serverRows[0];
		const anchorRowKey = getStage2RowStrictKey(anchorRow);
		const displayServer = getRowDisplayServer(anchorRow, getRowMeta) || serverKey.replace(/^source:/, "");

		nodes.push({
			kind: "server",
			server: serverKey,
			displayServer,
			anchorRowKey,
		});

		const sourceGroups = [...partitionSourceGroups(serverRows).entries()].sort(([left], [right]) =>
			left.localeCompare(right),
		);

		sourceGroups.forEach(([, groupRows], sourceIndex) => {
			const sourceBranch: Stage2TreeBranch = sourceIndex < sourceGroups.length - 1 ? "mid" : "last";
			const orderedRows = orderSourceGroupRows(groupRows);
			const derivedInGroup = orderedRows.filter((candidate) => !isStage2SourceRow(candidate));

			orderedRows.forEach((row) => {
				const rowKey = getStage2RowStrictKey(row);
				const isSource = isStage2SourceRow(row);
				if (isSource) {
					nodes.push({
						kind: "row",
						row,
						rowKey,
						depth: 1,
						glyphParts: buildSourceGlyphParts(sourceBranch, derivedInGroup.length > 0),
						isSource: true,
					});
					return;
				}

				const derivedRows = derivedInGroup;
				const derivedIndex = derivedRows.findIndex((candidate) => getStage2RowStrictKey(candidate) === rowKey);
				const derivedBranch: Stage2TreeBranch =
					derivedIndex >= 0 && derivedIndex < derivedRows.length - 1 ? "mid" : "last";

				nodes.push({
					kind: "row",
					row,
					rowKey,
					depth: 2,
					glyphParts: buildDerivedGlyphParts(sourceBranch, derivedBranch),
					isSource: false,
				});
			});
		});
	}

	return nodes;
}

export function formatServerGroupLabel(server: string): string {
	void server;
	return "server";
}

function getServerBlockBounds(
	nodes: Stage2TreeNode[],
	index: number,
): { blockStart: number; blockEnd: number } {
	let blockStart = index;
	while (blockStart > 0 && nodes[blockStart].kind !== "server") {
		blockStart -= 1;
	}

	let blockEnd = blockStart;
	while (blockEnd + 1 < nodes.length && nodes[blockEnd + 1].kind !== "server") {
		blockEnd += 1;
	}

	return { blockStart, blockEnd };
}

/** 与非聚合 `.a-stage2-row-inline` 一致的 dot + 竖线轨道类名；server 块内枝干从 server 行贯通至末行。 */
export function getStage2AggregationTreeRowInlineClassName(nodes: Stage2TreeNode[], index: number): string {
	const node = nodes[index];
	const { blockStart, blockEnd } = getServerBlockBounds(nodes, index);
	const hasSiblings = blockEnd > blockStart;
	const isBlockStart = index === blockStart;
	const isBlockEnd = index === blockEnd;

	const role =
		node.kind === "server" ? "server" : node.isSource ? "source" : "derived";

	return [
		"a-stage2-row-inline",
		hasSiblings ? "is-grouped" : "is-solo",
		role === "server" ? "is-server" : role === "source" ? "is-source" : "is-derived",
		isBlockStart ? "is-group-start" : "",
		isBlockEnd ? "is-group-end" : "",
	]
		.filter(Boolean)
		.join(" ");
}
