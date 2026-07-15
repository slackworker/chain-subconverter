import {
	detectServerGroupSourceFlagEmoji,
	flattenInstances,
	getStage2RowSourceLandingName,
	getStage2RowStableKey,
	getStage2RowStrictKey,
} from "../../lib/stage2";
import type { Stage2Catalog, Stage2Row, Stage2Snapshot } from "../../types/api";

export type Stage2TreeBranch = "mid" | "last";

/** 树状导轨语义：延续竖线、分支位置、子级导轨等。 */
export type Stage2TreeGlyphParts = {
	continuation: "│" | "";
	branch: Stage2TreeBranch;
	depth: 1 | 2;
	/** depth 1 默认实例行下方仍有副本时，向下引出子级竖线导轨。 */
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
	sourceFlagEmoji: string | null;
};

export type Stage2TreeRowNode = {
	kind: "row";
	row: Stage2Row;
	rowKey: string;
	stableKey: string;
	depth: 1 | 2;
	glyphParts: Stage2TreeGlyphParts;
	isDefaultInstance: boolean;
};

export type Stage2TreeNode = Stage2TreeServerNode | Stage2TreeRowNode;

export type Stage2RowMetaLookup = (rowKey: string) => unknown;

function getRowServerKey(row: Stage2Row, _getRowMeta: Stage2RowMetaLookup): string {
	return row.serverKey.trim() || `source:${getStage2RowSourceLandingName(row)}`;
}

function getRowDisplayServer(row: Stage2Row, _getRowMeta: Stage2RowMetaLookup): string {
	return row.serverKey.trim();
}

function buildDefaultInstanceGlyphParts(
	sourceBranch: Stage2TreeBranch,
	hasDuplicatesBelow: boolean,
): Stage2TreeGlyphParts {
	return {
		continuation: "",
		branch: sourceBranch,
		depth: 1,
		childGuide: hasDuplicatesBelow,
	};
}

function buildDuplicateInstanceGlyphParts(
	sourceBranch: Stage2TreeBranch,
	duplicateBranch: Stage2TreeBranch,
): Stage2TreeGlyphParts {
	return {
		continuation: sourceBranch === "mid" ? "│" : "",
		branch: duplicateBranch,
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

/** 按 sourceId 分组；组内行保持 rows 原始顺序。 */
function getSourceGroupsInRowOrder(serverRows: Stage2Row[]): Stage2Row[][] {
	const groups = partitionSourceGroups(serverRows);
	const ordered: Stage2Row[][] = [];
	const seen = new Set<string>();
	for (const row of serverRows) {
		const sourceLandingName = getStage2RowSourceLandingName(row);
		if (seen.has(sourceLandingName)) {
			continue;
		}
		seen.add(sourceLandingName);
		const groupRows = groups.get(sourceLandingName);
		if (groupRows !== undefined) {
			ordered.push(groupRows);
		}
	}
	return ordered;
}

/** server 分组按 rows 中首次出现的顺序排列。 */
function getServerKeysInRowOrder(rows: Stage2Row[], getRowMeta: Stage2RowMetaLookup): string[] {
	const ordered: string[] = [];
	const seen = new Set<string>();
	for (const row of rows) {
		const serverKey = getRowServerKey(row, getRowMeta);
		if (seen.has(serverKey)) {
			continue;
		}
		seen.add(serverKey);
		ordered.push(serverKey);
	}
	return ordered;
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

	const serverKeys = getServerKeysInRowOrder(rows, getRowMeta);
	const nodes: Stage2TreeNode[] = [];

	for (const serverKey of serverKeys) {
		const serverRows = rowsByServer.get(serverKey) ?? [];
		if (serverRows.length === 0) {
			continue;
		}

		const anchorRow = serverRows[0];
		const anchorRowKey = getStage2RowStrictKey(anchorRow);
		const displayServer = getRowDisplayServer(anchorRow, getRowMeta);

		nodes.push({
			kind: "server",
			server: serverKey,
			displayServer,
			anchorRowKey,
			sourceFlagEmoji: detectServerGroupSourceFlagEmoji(serverRows),
		});

		const sourceGroups = getSourceGroupsInRowOrder(serverRows);

		sourceGroups.forEach((groupRows, sourceIndex) => {
			const sourceBranch: Stage2TreeBranch = sourceIndex < sourceGroups.length - 1 ? "mid" : "last";
			const orderedRows = groupRows;
			const defaultInstanceRowKey = getStage2RowStrictKey(orderedRows[0]);
			const duplicateRowsInGroup = orderedRows.slice(1);

			orderedRows.forEach((row) => {
				const rowKey = getStage2RowStrictKey(row);
				const isDefaultInstance = rowKey === defaultInstanceRowKey;
				if (isDefaultInstance) {
					nodes.push({
						kind: "row",
						row,
						rowKey,
						stableKey: getStage2RowStableKey(row),
						depth: 1,
						glyphParts: buildDefaultInstanceGlyphParts(sourceBranch, duplicateRowsInGroup.length > 0),
						isDefaultInstance: true,
					});
					return;
				}

				const duplicateRows = duplicateRowsInGroup;
				const duplicateIndex = duplicateRows.findIndex((candidate) => getStage2RowStrictKey(candidate) === rowKey);
				const duplicateBranch: Stage2TreeBranch =
					duplicateIndex >= 0 && duplicateIndex < duplicateRows.length - 1 ? "mid" : "last";

				nodes.push({
					kind: "row",
					row,
					rowKey,
					stableKey: getStage2RowStableKey(row),
					depth: 2,
					glyphParts: buildDuplicateInstanceGlyphParts(sourceBranch, duplicateBranch),
					isDefaultInstance: false,
				});
			});
		});
	}

	return nodes;
}

/** Default scheme projection that preserves the snapshot's server/source/instance nesting. */
export function buildStage2AggregationTreeFromSnapshot(
	snapshot: Stage2Snapshot,
	catalog: Stage2Catalog | null,
): Stage2TreeNode[] {
	const flatById = new Map(
		flattenInstances(snapshot, catalog).map((row) => [row.instanceId, row] as const),
	);
	const nodes: Stage2TreeNode[] = [];
	for (const server of snapshot.servers) {
		const serverRows = server.sources.flatMap((source) =>
			source.instances.flatMap((instance) => {
				const row = flatById.get(instance.instanceId);
				return row ? [row] : [];
			}),
		);
		const anchorRow = serverRows[0];
		if (!anchorRow) continue;
		nodes.push({
			kind: "server",
			server: server.serverKey,
			displayServer: server.serverKey,
			anchorRowKey: getStage2RowStrictKey(anchorRow),
			sourceFlagEmoji: detectServerGroupSourceFlagEmoji(serverRows),
		});
		server.sources.forEach((source, sourceIndex) => {
			const sourceBranch: Stage2TreeBranch = sourceIndex < server.sources.length - 1 ? "mid" : "last";
			source.instances.forEach((instance, instanceIndex) => {
				const row = flatById.get(instance.instanceId);
				if (!row) return;
				const isDefaultInstance = instanceIndex === 0;
				nodes.push({
					kind: "row",
					row,
					rowKey: getStage2RowStrictKey(row),
					stableKey: getStage2RowStableKey(row),
					depth: isDefaultInstance ? 1 : 2,
					glyphParts: isDefaultInstance
						? buildDefaultInstanceGlyphParts(sourceBranch, source.instances.length > 1)
						: buildDuplicateInstanceGlyphParts(
							sourceBranch,
							instanceIndex < source.instances.length - 1 ? "mid" : "last",
						),
					isDefaultInstance,
				});
			});
		});
	}
	return nodes;
}

export function formatServerGroupLabel(server: string): string {
	const trimmed = server.trim();
	if (trimmed === "") {
		return "--";
	}
	return trimmed;
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

function getFlatSourceGroupInlineClassName(blockRowNodes: Stage2TreeRowNode[], rowNode: Stage2TreeRowNode): string {
	const rowIndexInBlock = blockRowNodes.findIndex((candidate) => candidate.rowKey === rowNode.rowKey);
	const sourceLandingName = getStage2RowSourceLandingName(rowNode.row);
	const previousSourceLandingName =
		rowIndexInBlock > 0 ? getStage2RowSourceLandingName(blockRowNodes[rowIndexInBlock - 1].row) : null;
	const nextSourceLandingName =
		rowIndexInBlock + 1 < blockRowNodes.length
			? getStage2RowSourceLandingName(blockRowNodes[rowIndexInBlock + 1].row)
			: null;
	const groupedBySource =
		previousSourceLandingName === sourceLandingName || nextSourceLandingName === sourceLandingName;
	const groupStart = previousSourceLandingName !== sourceLandingName;
	const groupEnd = nextSourceLandingName !== sourceLandingName;

	return [
		"a-stage2-row-inline",
		groupedBySource ? "is-grouped" : "is-solo",
		rowNode.isDefaultInstance ? "is-default-instance" : "is-duplicate-instance",
		groupStart ? "is-group-start" : "",
		groupEnd ? "is-group-end" : "",
	]
		.filter(Boolean)
		.join(" ");
}

/** 与非聚合 `.a-stage2-row-inline` 一致的 dot + 竖线轨道类名；聚合开启时 server 块内枝干贯通至末行。 */
export function getStage2AggregationTreeRowInlineClassName(
	nodes: Stage2TreeNode[],
	index: number,
	options?: { serverAggregationEnabled?: boolean },
): string {
	const node = nodes[index];
	const serverAggregationEnabled = options?.serverAggregationEnabled ?? true;

	if (node.kind === "server") {
		if (!serverAggregationEnabled) {
			return "a-stage2-row-inline is-solo is-aggregation-off";
		}

		const { blockStart, blockEnd } = getServerBlockBounds(nodes, index);
		const hasSiblings = blockEnd > blockStart;
		const isBlockStart = index === blockStart;

		return [
			"a-stage2-row-inline",
			hasSiblings ? "is-grouped" : "is-solo",
			"is-server",
			isBlockStart ? "is-group-start" : "",
		]
			.filter(Boolean)
			.join(" ");
	}

	if (!serverAggregationEnabled) {
		const { blockStart, blockEnd } = getServerBlockBounds(nodes, index);
		const blockRowNodes = nodes
			.slice(blockStart + 1, blockEnd + 1)
			.filter((candidate): candidate is Stage2TreeRowNode => candidate.kind === "row");
		return getFlatSourceGroupInlineClassName(blockRowNodes, node);
	}

	const { blockStart, blockEnd } = getServerBlockBounds(nodes, index);
	const hasSiblings = blockEnd > blockStart;
	const isBlockStart = index === blockStart;
	const isBlockEnd = index === blockEnd;
	const role = node.isDefaultInstance ? "default-instance" : "duplicate-instance";

	return [
		"a-stage2-row-inline",
		hasSiblings ? "is-grouped" : "is-solo",
		role === "default-instance" ? "is-default-instance" : "is-duplicate-instance",
		isBlockStart ? "is-group-start" : "",
		isBlockEnd ? "is-group-end" : "",
	]
		.filter(Boolean)
		.join(" ");
}

export function getServerBlockAggregationEnabled(
	nodes: Stage2TreeNode[],
	index: number,
	isEnabled: (anchorRowKey: string) => boolean,
): boolean {
	const { blockStart } = getServerBlockBounds(nodes, index);
	const serverNode = nodes[blockStart];
	if (serverNode.kind !== "server") {
		return true;
	}
	return isEnabled(serverNode.anchorRowKey);
}
