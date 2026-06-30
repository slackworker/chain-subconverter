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

const STAGE2_ROW_KEY_PREFIXES = {
	rowId: "rowId:",
	proxyName: "proxyName:",
	landingNodeName: "landingNodeName:",
	sourceLandingNodeName: "sourceLandingNodeName:",
} as const;

type Stage2RowKeyField = keyof typeof STAGE2_ROW_KEY_PREFIXES;

export function getStage2RowDisplayName(row: Pick<Stage2Row, "proxyName" | "landingNodeName">) {
	const proxyName = row.proxyName?.trim();
	if (proxyName) {
		return proxyName;
	}
	return row.landingNodeName.trim();
}

export function getStage2RowEditableName(row: Pick<Stage2Row, "proxyName" | "landingNodeName">) {
	return row.proxyName ?? row.landingNodeName;
}

export function getStage2RowSourceLandingName(row: Pick<Stage2Row, "sourceLandingNodeName" | "landingNodeName">) {
	const sourceLandingNodeName = row.sourceLandingNodeName?.trim();
	if (sourceLandingNodeName) {
		return sourceLandingNodeName;
	}
	return row.landingNodeName.trim();
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

function getTrimmedStage2RowFieldValue(
	row: Pick<Stage2Row, "rowId" | "sourceLandingNodeName" | "proxyName" | "landingNodeName">,
	field: Stage2RowKeyField,
) {
	switch (field) {
		case "rowId":
			return row.rowId?.trim() ?? "";
		case "proxyName":
			return row.proxyName?.trim() ?? "";
		case "landingNodeName":
			return row.landingNodeName.trim();
		case "sourceLandingNodeName":
			return row.sourceLandingNodeName?.trim() ?? "";
	}
}

function parsePrefixedStage2RowKey(rowKey: string): { field: Stage2RowKeyField; value: string } | null {
	for (const [field, prefix] of Object.entries(STAGE2_ROW_KEY_PREFIXES) as Array<[Stage2RowKeyField, string]>) {
		if (!rowKey.startsWith(prefix)) {
			continue;
		}
		const value = rowKey.slice(prefix.length).trim();
		if (value === "") {
			return null;
		}
		return { field, value };
	}
	return null;
}

function getStage2RowIdentifiers(row: Pick<Stage2Row, "rowId" | "sourceLandingNodeName" | "proxyName" | "landingNodeName">) {
	const identifiers = [row.rowId, row.proxyName, row.landingNodeName, row.sourceLandingNodeName];
	const seen = new Set<string>();
	const result: string[] = [];
	for (const value of identifiers) {
		const trimmed = value?.trim() ?? "";
		if (trimmed === "" || seen.has(trimmed)) {
			continue;
		}
		seen.add(trimmed);
		result.push(trimmed);
	}
	return result;
}

export function getStage2RowKey(row: Pick<Stage2Row, "rowId" | "sourceLandingNodeName" | "proxyName" | "landingNodeName">) {
	return getStage2RowIdentifiers(row)[0] ?? "";
}

export function getStage2RowStrictKey(
	row: Pick<Stage2Row, "rowId" | "sourceLandingNodeName" | "proxyName" | "landingNodeName">,
) {
	for (const field of ["rowId", "proxyName", "landingNodeName", "sourceLandingNodeName"] as Stage2RowKeyField[]) {
		const value = getTrimmedStage2RowFieldValue(row, field);
		if (value !== "") {
			return `${STAGE2_ROW_KEY_PREFIXES[field]}${value}`;
		}
	}
	return "";
}

export function isStage2SourceRow(
	row: Pick<Stage2Row, "rowId" | "sourceLandingNodeName" | "proxyName" | "landingNodeName">,
) {
	const sourceLandingNodeName = getStage2RowSourceLandingName(row);
	if (sourceLandingNodeName === "") {
		return false;
	}
	const rowId = row.rowId?.trim();
	if (rowId) {
		return rowId === sourceLandingNodeName;
	}
	const proxyName = row.proxyName?.trim();
	if (proxyName) {
		return proxyName === sourceLandingNodeName;
	}
	return row.landingNodeName.trim() === sourceLandingNodeName;
}

export function matchesStage2RowKey(
	row: Pick<Stage2Row, "rowId" | "sourceLandingNodeName" | "proxyName" | "landingNodeName">,
	rowKey: string,
) {
	const trimmedRowKey = rowKey.trim();
	if (trimmedRowKey === "") {
		return false;
	}
	const prefixedRowKey = parsePrefixedStage2RowKey(trimmedRowKey);
	if (prefixedRowKey !== null) {
		return getTrimmedStage2RowFieldValue(row, prefixedRowKey.field) === prefixedRowKey.value;
	}
	return getStage2RowIdentifiers(row).includes(trimmedRowKey);
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
	landingNodeName: string,
	mode: Stage2Row["mode"],
) {
	if (mode === "chain") {
		return getChainTargetChoiceGroups(stage2Init)
			.flatMap((group) => group.choices)
			.filter((choice) => !choice.disabled);
	}
	if (mode === "port_forward") {
		return getForwardRelayChoices(stage2Init, stage2Rows, landingNodeName).filter((choice) => !choice.disabled);
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
	landingNodeName: string,
	mode: Stage2Row["mode"],
	currentTarget: string | null,
) {
	if (mode === "none") {
		return null;
	}
	const choices = getSelectableChoices(stage2Init, stage2Rows, landingNodeName, mode);
	if (choices.some((choice) => choice.value === currentTarget)) {
		return currentTarget;
	}
	return null;
}