import { getChainTargetGroups } from "./chainTargets";

import type { ChainTargetGroup } from "./chainTargets";
import type { Stage2Init, Stage2Row } from "../types/api";

export interface TargetChoice {
	value: string;
	label: string;
	disabled: boolean;
}

export interface ChainTargetChoiceGroup extends Omit<ChainTargetGroup, "targets"> {
	choices: TargetChoice[];
}

export type Stage2SnapshotRows = Stage2Row[];

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

export function getForwardRelayChoices(stage2Init: Stage2Init | null, stage2Rows: Stage2SnapshotRows, landingNodeName: string) {
	if (stage2Init === null) {
		return [];
	}

	const currentRow = stage2Rows.find((row) => row.landingNodeName === landingNodeName) ?? null;
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

	return getForwardRelayChoices(stage2Init, stage2Rows, row.landingNodeName)
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