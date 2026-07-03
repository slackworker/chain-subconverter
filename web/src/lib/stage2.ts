import { getChainTargetGroups } from "./chainTargets";

import type { ChainTargetGroup } from "./chainTargets";
import type { ChainTarget, ServerAggregationGroup, Stage2Init, Stage2Row, Stage2Snapshot } from "../types/api";

export interface TargetChoice {
	value: string;
	label: string;
	disabled: boolean;
}

export interface ChainTargetChoiceGroup extends Omit<ChainTargetGroup, "targets"> {
	choices: TargetChoice[];
}

export type Stage2SnapshotRows = Stage2Row[];
export type ServerAggregationStrategy = ServerAggregationGroup["strategy"];

const STAGE2_ROW_KEY_PREFIX = "rowId:";

export function getStage2RowDisplayName(row: Pick<Stage2Row, "proxyName">) {
	return row.proxyName.trim();
}

export function getStage2RowEditableName(row: Pick<Stage2Row, "proxyName">) {
	return row.proxyName;
}

export function getStage2RowSourceLandingName(row: Pick<Stage2Row, "sourceLandingNodeName">) {
	return row.sourceLandingNodeName.trim();
}

export function getStage2SourceGroupSize(rows: Stage2SnapshotRows, sourceLandingNodeName: string) {
	const trimmedSourceLandingNodeName = sourceLandingNodeName.trim();
	if (trimmedSourceLandingNodeName === "") {
		return 0;
	}
	return rows.filter((row) => getStage2RowSourceLandingName(row) === trimmedSourceLandingNodeName).length;
}

export function getServerAggregationGroup(
	snapshot: Pick<Stage2Snapshot, "serverAggregationGroups">,
	server: string,
) {
	const trimmedServer = server.trim();
	if (trimmedServer === "") {
		return null;
	}
	return snapshot.serverAggregationGroups.find((group) => group.server.trim() === trimmedServer) ?? null;
}

export function getServerAggregationStrategy(
	snapshot: Pick<Stage2Snapshot, "serverAggregationGroups">,
	server: string,
) {
	return getServerAggregationGroup(snapshot, server)?.strategy ?? null;
}

function getLeadingFlagEmoji(name: string): string | null {
	const match = name.trim().match(/^(\p{Regional_Indicator}{2})(?:\s|$)/u);
	return match?.[1] ?? null;
}

export function detectServerGroupSourceFlagEmoji(rows: Stage2Row[]): string | null {
	const sourceRows = rows.filter((row) => isStage2SourceRow(row));
	if (sourceRows.length === 0) {
		return null;
	}

	let emoji: string | null = null;
	for (const row of sourceRows) {
		const currentEmoji = getLeadingFlagEmoji(getStage2RowDisplayName(row));
		if (!currentEmoji) {
			return null;
		}
		if (emoji === null) {
			emoji = currentEmoji;
			continue;
		}
		if (emoji !== currentEmoji) {
			return null;
		}
	}
	return emoji;
}

export function deriveManagedServerAggregationGroupBaseName(
	server: string,
	groupName: string | undefined,
	memberRows: Stage2Row[],
): string {
	const trimmedGroupName = groupName?.trim() ?? "";
	if (trimmedGroupName !== "") {
		return trimmedGroupName;
	}
	let baseName = server.trim();
	if (baseName === "") {
		baseName = "server";
	}
	const sourceFlagEmoji = detectServerGroupSourceFlagEmoji(memberRows);
	return sourceFlagEmoji ? `${sourceFlagEmoji} ${baseName}` : baseName;
}

export function nextManagedServerAggregationGroupName(baseName: string, usedNames: Set<string>): string {
	const trimmedBaseName = baseName.trim() === "" ? "server" : baseName.trim();
	if (!usedNames.has(trimmedBaseName)) {
		return trimmedBaseName;
	}

	let suffix = 2;
	while (usedNames.has(`${trimmedBaseName} ${suffix}`)) {
		suffix += 1;
	}
	return `${trimmedBaseName} ${suffix}`;
}

export function collectTemplateProxyGroupNames(chainTargets: ChainTarget[]): Set<string> {
	return new Set(
		chainTargets
			.filter((target) => target.kind === "proxy-groups")
			.map((target) => target.name.trim())
			.filter((name) => name !== ""),
	);
}

export function getServerAggregationMemberRows(
	snapshot: Pick<Stage2Snapshot, "rows">,
	group: ServerAggregationGroup,
): Stage2Row[] {
	const rowsById = new Map(
		snapshot.rows
			.map((row) => [getStage2RowKey(row), row] as const)
			.filter(([rowId]) => rowId !== ""),
	);
	const memberRows: Stage2Row[] = [];
	const seen = new Set<string>();
	for (const memberRowId of group.memberRowIds ?? []) {
		const trimmedMemberRowId = memberRowId.trim();
		if (trimmedMemberRowId === "" || seen.has(trimmedMemberRowId)) {
			continue;
		}
		seen.add(trimmedMemberRowId);
		const row = rowsById.get(trimmedMemberRowId);
		if (row !== undefined) {
			memberRows.push(row);
		}
	}
	return memberRows;
}

export function buildManagedServerAggregationGroupDisplayNames(
	snapshot: Pick<Stage2Snapshot, "rows" | "serverAggregationGroups">,
	existingProxyGroupNames: Iterable<string> = [],
): Map<string, string> {
	const usedNames = new Set(existingProxyGroupNames);
	const displayNames = new Map<string, string>();

	for (const group of snapshot.serverAggregationGroups) {
		const server = group.server.trim();
		if (server === "" || !group.enabled) {
			continue;
		}
		const memberRows = getServerAggregationMemberRows(snapshot, group);
		const baseName = deriveManagedServerAggregationGroupBaseName(server, group.groupName, memberRows);
		const managedName = nextManagedServerAggregationGroupName(baseName, usedNames);
		usedNames.add(managedName);
		displayNames.set(server, managedName);
	}

	return displayNames;
}

export function getServerAggregationGroupDisplayName(
	snapshot: Pick<Stage2Snapshot, "rows" | "serverAggregationGroups">,
	server: string,
	options: {
		groupName?: string;
		enabled?: boolean;
		memberRows?: Stage2Row[];
		existingProxyGroupNames?: Iterable<string>;
	} = {},
): string {
	const trimmedServer = server.trim();
	if (trimmedServer === "") {
		return "server";
	}

	const group = getServerAggregationGroup(snapshot, trimmedServer);
	const memberRows = options.memberRows ?? (group ? getServerAggregationMemberRows(snapshot, group) : []);
	const enabled = options.enabled ?? group?.enabled ?? false;
	const groupName = options.groupName ?? group?.groupName;

	if (enabled) {
		const managedNames = buildManagedServerAggregationGroupDisplayNames(
			snapshot,
			options.existingProxyGroupNames ?? [],
		);
		const managedName = managedNames.get(trimmedServer);
		if (managedName !== undefined) {
			return managedName;
		}
	}

	return deriveManagedServerAggregationGroupBaseName(trimmedServer, groupName, memberRows);
}

function parseStage2RowKey(rowKey: string): string | null {
	const trimmedRowKey = rowKey.trim();
	if (!trimmedRowKey.startsWith(STAGE2_ROW_KEY_PREFIX)) {
		return null;
	}
	const value = trimmedRowKey.slice(STAGE2_ROW_KEY_PREFIX.length).trim();
	return value === "" ? null : value;
}

export function getStage2RowKey(row: Pick<Stage2Row, "rowId">) {
	return row.rowId.trim();
}

export function getStage2RowStrictKey(row: Pick<Stage2Row, "rowId">) {
	const rowId = row.rowId.trim();
	return rowId === "" ? "" : `${STAGE2_ROW_KEY_PREFIX}${rowId}`;
}

export function isStage2SourceRow(row: Pick<Stage2Row, "rowId" | "sourceLandingNodeName">) {
	const sourceLandingNodeName = getStage2RowSourceLandingName(row);
	if (sourceLandingNodeName === "") {
		return false;
	}
	return row.rowId.trim() === sourceLandingNodeName;
}

export function matchesStage2RowKey(row: Pick<Stage2Row, "rowId">, rowKey: string) {
	const trimmedRowKey = rowKey.trim();
	if (trimmedRowKey === "") {
		return false;
	}
	const parsedRowId = parseStage2RowKey(trimmedRowKey);
	if (parsedRowId !== null) {
		return row.rowId.trim() === parsedRowId;
	}
	return row.rowId.trim() === trimmedRowKey;
}

export function findStage2RowByKey(rows: Stage2SnapshotRows, rowKey: string) {
	return rows.find((row) => matchesStage2RowKey(row, rowKey)) ?? null;
}

export function getStage2DerivedProxyNameBase(rows: Stage2SnapshotRows, sourceLandingNodeName: string) {
	const trimmedSource = sourceLandingNodeName.trim();
	if (trimmedSource === "") {
		return "";
	}
	const sourceRow = rows.find(
		(row) => getStage2RowSourceLandingName(row) === trimmedSource && isStage2SourceRow(row),
	);
	if (sourceRow !== undefined) {
		return getStage2RowDisplayName(sourceRow);
	}
	return trimmedSource;
}

export function pickNextDerivedProxyName(rows: Stage2SnapshotRows, baseName: string) {
	const trimmedBaseName = baseName.trim();
	if (trimmedBaseName === "") {
		return "";
	}

	const usedNames = new Set(
		rows
			.map((row) => getStage2RowDisplayName(row).trim())
			.filter((value) => value !== ""),
	);
	if (!usedNames.has(trimmedBaseName)) {
		return trimmedBaseName;
	}

	let suffix = 2;
	while (usedNames.has(`${trimmedBaseName} ${suffix}`)) {
		suffix += 1;
	}
	return `${trimmedBaseName} ${suffix}`;
}

function getSelectedForwardRelays(rows: Stage2SnapshotRows) {
	const selected = new Set<string>();
	for (const row of rows) {
		if (row.mode !== "port_forward" || row.targetName === null) {
			continue;
		}
		selected.add(row.targetName);
	}
	return selected;
}

function toChainTargetChoiceGroup(group: ChainTargetGroup): ChainTargetChoiceGroup {
	return {
		kind: group.kind,
		priority: group.priority,
		title: group.title,
		description: group.description,
		emptyText: group.emptyText,
		choices: group.targets.map((target) => ({
			value: target.name,
			label: target.isEmpty ? `${target.name}（策略组为空）` : target.name,
			disabled: target.isEmpty === true,
		})),
	};
}

export function getChainTargetChoiceGroups(stage2Init: Stage2Init | null) {
	if (stage2Init === null) {
		return [];
	}

	return getChainTargetGroups(stage2Init.chainTargets).map(toChainTargetChoiceGroup);
}

export function findChainTarget(stage2Init: Stage2Init | null, targetName: string | null) {
	if (stage2Init === null || targetName === null) {
		return null;
	}
	return stage2Init.chainTargets.find((target) => target.name === targetName) ?? null;
}

export function isSwitchOptimizationEligible(stage2Init: Stage2Init | null, row: Stage2Row) {
	if (row.mode !== "chain" || row.targetName === null) {
		return false;
	}
	const target = findChainTarget(stage2Init, row.targetName);
	return target?.kind === "proxy-groups";
}

export function getForwardRelayChoices(stage2Init: Stage2Init | null, stage2Rows: Stage2SnapshotRows, rowKey: string) {
	if (stage2Init === null) {
		return [];
	}

	const currentRow = findStage2RowByKey(stage2Rows, rowKey);
	const selectedRelays = getSelectedForwardRelays(stage2Rows);
	if (currentRow?.mode === "port_forward" && currentRow.targetName !== null) {
		selectedRelays.delete(currentRow.targetName);
	}

	return stage2Init.forwardRelays.map((relay) => ({
		value: relay.name,
		label: relay.name,
		disabled: selectedRelays.has(relay.name),
	}));
}

export function getSelectableChoices(
	stage2Init: Stage2Init | null,
	stage2Rows: Stage2SnapshotRows,
	rowKey: string,
	mode: Stage2Row["mode"],
) {
	if (mode === "chain") {
		return getChainTargetChoiceGroups(stage2Init)
			.flatMap((group) => group.choices)
			.filter((choice) => !choice.disabled);
	}
	if (mode === "port_forward") {
		return getForwardRelayChoices(stage2Init, stage2Rows, rowKey).filter((choice) => !choice.disabled);
	}
	return [];
}

export function getStage2DisplayModeOptions(stage2Init: Stage2Init | null, currentMode: Stage2Row["mode"]) {
	if (stage2Init?.availableModes.length) {
		return stage2Init.availableModes;
	}
	return [currentMode];
}

export function getStage2TargetDisplayLabel(
	stage2Init: Stage2Init | null,
	stage2Rows: Stage2SnapshotRows,
	row: Stage2Row,
) {
	if (row.mode === "none" || row.targetName === null) {
		return null;
	}

	if (row.mode === "chain") {
		return getChainTargetChoiceGroups(stage2Init)
			.flatMap((group) => group.choices)
			.find((choice) => choice.value === row.targetName)?.label ?? row.targetName;
	}

	return getForwardRelayChoices(stage2Init, stage2Rows, getStage2RowKey(row))
		.find((choice) => choice.value === row.targetName)?.label ?? row.targetName;
}

export function pickNextTarget(
	stage2Init: Stage2Init | null,
	stage2Rows: Stage2SnapshotRows,
	rowKey: string,
	mode: Stage2Row["mode"],
	currentTarget: string | null,
) {
	if (mode === "none") {
		return null;
	}
	const choices = getSelectableChoices(stage2Init, stage2Rows, rowKey, mode);
	if (choices.some((choice) => choice.value === currentTarget)) {
		return currentTarget;
	}
	return null;
}
