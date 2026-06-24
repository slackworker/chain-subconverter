import type { Stage2Init, Stage2Row } from "../../types/api";
import {
	getChainTargetChoiceGroups,
	getForwardRelayChoices,
	type Stage2SnapshotRows,
} from "../../lib/stage2";

type TargetMeasureCopy = {
	selectTarget: string;
	commonGroups: string;
	fixedNodes: string;
};

/** 收集目标列宽度测量所需的全部候选文案 */
export function collectStage2TargetOptionLabels(input: {
	stage2Init: Stage2Init | null;
	stage2Rows: Stage2SnapshotRows;
	row: Stage2Row;
	rowKey: string;
	copy: TargetMeasureCopy;
}): string[] {
	const { stage2Init, stage2Rows, row, rowKey, copy } = input;

	if (row.mode === "chain") {
		const groups = getChainTargetChoiceGroups(stage2Init);
		return [
			copy.commonGroups,
			copy.fixedNodes,
			...groups.flatMap((group) => group.choices.map((choice) => choice.label)),
		];
	}

	if (row.mode === "port_forward") {
		return [
			copy.selectTarget,
			...getForwardRelayChoices(stage2Init, stage2Rows, rowKey).map((choice) => choice.label),
		];
	}

	return ["--"];
}
