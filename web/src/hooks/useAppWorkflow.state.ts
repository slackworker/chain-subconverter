import {
	clearBlockingErrorsSupersededByStage2Stale,
	clearStage1FieldErrors,
	clearStage3ActionErrors,
	clearStage3FieldErrors,
} from "../lib/notices";
import type { AppState } from "../lib/state";
import {
	findStage2RowByKey,
	getStage2RowSourceLandingName,
	matchesStage2RowKey,
	pickNextDerivedProxyName,
} from "../lib/stage2";
import type { Stage1Input, Stage2Init, Stage2Row } from "../types/api";

function expireGeneratedOutput(current: AppState) {
	return {
		generatedUrls: null,
		stage3Expired: current.generatedUrls !== null || current.stage3Expired,
	};
}

function clearStage2RowErrors(current: AppState) {
	return current.blockingErrors.filter((error) => error.scope !== "stage2_row");
}

export function buildStage2SnapshotRows(stage2Init: Stage2Init) {
	return stage2Init.rows.map((row) => ({
		rowId: row.rowId,
		sourceLandingNodeName: row.sourceLandingNodeName,
		proxyName: row.proxyName,
		landingNodeName: row.landingNodeName,
		mode: row.mode,
		targetName: row.targetName,
	}));
}

export function setCurrentLinkInputState(current: AppState, value: string): AppState {
	return {
		...current,
		currentLinkInput: value,
		stage3Expired: false,
		blockingErrors: clearStage3ActionErrors(clearStage3FieldErrors(current.blockingErrors, "currentLinkInput")),
	};
}

export function reportCurrentLinkInputErrorState(current: AppState, message: string, actionLabel: string): AppState {
	return {
		...current,
		responseOriginStage: "stage3",
		blockingErrors: [
			...clearStage3ActionErrors(clearStage3FieldErrors(current.blockingErrors, "currentLinkInput")),
			{
				code: "INVALID_CURRENT_LINK",
				message,
				scope: "stage3_field",
				context: {
					field: "currentLinkInput",
					action: actionLabel,
				},
			},
		],
	};
}

export function updateStage1InputState(
	current: AppState,
	nextStage1Input: Stage1Input,
	changedFields: string[],
): AppState {
	const becomesStale = current.stage2Snapshot.rows.length > 0;
	let blockingErrors = clearStage1FieldErrors(current.blockingErrors, changedFields);
	if (changedFields.length > 0 && current.responseOriginStage === "stage1") {
		blockingErrors = [];
	}
	if (becomesStale) {
		blockingErrors = clearBlockingErrorsSupersededByStage2Stale(blockingErrors, current.responseOriginStage);
	}

	return {
		...current,
		stage1Input: nextStage1Input,
		...expireGeneratedOutput(current),
		stage2Stale: becomesStale ? true : current.stage2Stale,
		blockingErrors,
	};
}

export function applyStage2InitState(current: AppState, stage2Init: Stage2Init): AppState {
	return {
		...current,
		stage2Init,
		stage2Snapshot: { rows: buildStage2SnapshotRows(stage2Init) },
		generatedUrls: null,
		stage3Expired: false,
		stage2Stale: false,
		restoreStatus: "idle",
	};
}

export function updateStage2RowState(
	current: AppState,
	landingNodeName: string,
	updater: (row: Stage2Row) => Stage2Row,
): AppState {
	const matchedRow = findStage2RowByKey(current.stage2Snapshot.rows, landingNodeName);
	if (matchedRow === null) {
		return current;
	}

	return {
		...current,
		...expireGeneratedOutput(current),
		blockingErrors: clearStage2RowErrors(current),
		stage2Snapshot: {
			rows: current.stage2Snapshot.rows.map((row) => (matchesStage2RowKey(row, landingNodeName) ? updater(row) : row)),
		},
	};
}

export function cloneStage2RowState(current: AppState, landingNodeName: string, rowID: string): AppState {
	const matchedRow = findStage2RowByKey(current.stage2Snapshot.rows, landingNodeName);
	if (matchedRow === null) {
		return current;
	}

	const sourceLandingNodeName = getStage2RowSourceLandingName(matchedRow);
	const clonedProxyName = pickNextDerivedProxyName(current.stage2Snapshot.rows, sourceLandingNodeName);
	const clonedRow: Stage2Row = {
		...matchedRow,
		rowId: rowID,
		proxyName: clonedProxyName,
		landingNodeName: clonedProxyName,
	};

	const matchedIndex = current.stage2Snapshot.rows.findIndex((row) => matchesStage2RowKey(row, landingNodeName));
	const groupLastIndex = current.stage2Snapshot.rows.reduce((lastIndex, row, index) => (
		getStage2RowSourceLandingName(row) === sourceLandingNodeName ? index : lastIndex
	), -1);
	const insertIndex = groupLastIndex >= 0 ? groupLastIndex + 1 : matchedIndex + 1;
	const nextRows = [...current.stage2Snapshot.rows];
	nextRows.splice(insertIndex, 0, clonedRow);

	return {
		...current,
		...expireGeneratedOutput(current),
		blockingErrors: clearStage2RowErrors(current),
		stage2Snapshot: {
			rows: nextRows,
		},
	};
}

export function deleteStage2RowState(current: AppState, landingNodeName: string): AppState {
	const matchedRow = findStage2RowByKey(current.stage2Snapshot.rows, landingNodeName);
	if (matchedRow === null) {
		return current;
	}
	const sourceLandingNodeName = getStage2RowSourceLandingName(matchedRow);
	if (current.stage2Snapshot.rows.filter((row) => getStage2RowSourceLandingName(row) === sourceLandingNodeName).length <= 1) {
		return current;
	}

	return {
		...current,
		...expireGeneratedOutput(current),
		blockingErrors: clearStage2RowErrors(current),
		stage2Snapshot: {
			rows: current.stage2Snapshot.rows.filter((row) => !matchesStage2RowKey(row, landingNodeName)),
		},
	};
}