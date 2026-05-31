import {
	clearBlockingErrorsSupersededByStage2Stale,
	clearStage1FieldErrors,
	clearStage3ActionErrors,
	clearStage3FieldErrors,
} from "../lib/notices";
import type { AppState, ResponseOriginStage, WorkflowLogEntry } from "../lib/state";
import { appendWorkflowLogEntries } from "../lib/workflow-log";
import {
	findStage2RowByKey,
	getStage2RowSourceLandingName,
	matchesStage2RowKey,
	pickNextDerivedProxyName,
} from "../lib/stage2";
import type { BlockingError, Message, Stage1Input, Stage2Init, Stage2Row } from "../types/api";

function expireGeneratedOutput(current: AppState) {
	return {
		generatedUrls: null,
		stage3Expired: current.generatedUrls !== null || current.stage3Expired,
	};
}

function clearStage2RowErrors(current: AppState) {
	return current.blockingErrors.filter((error) => error.scope !== "stage2_row");
}

interface RequestStartStateOptions {
	resetStage3Expired?: boolean;
}

interface RequestCompletionStateOptions {
	patch?: Partial<AppState>;
}

interface ShortURLPreferenceToggleOptions {
	requireShortURL: boolean;
	requiredLogEntry?: WorkflowLogEntry;
}

interface ShortURLCreationStateOptions {
	blockingErrors: BlockingError[];
	logEntries: WorkflowLogEntry[];
	messages: Message[];
	resolvedLongURL: string;
	resolvedShortURL?: string;
}

interface GenerateSuccessStateOptions {
	blockingErrors: BlockingError[];
	logEntries: WorkflowLogEntry[];
	messages: Message[];
	resolvedLongURL: string;
	resolvedShortURL?: string;
	preferShortURL?: boolean;
}

interface GenerateShortURLFailureStateOptions extends ShortURLCreationStateOptions {
	requireShortURL: boolean;
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

function getDisplayedGeneratedURL(generatedUrls: AppState["generatedUrls"], preferShortURL: boolean) {
	if (generatedUrls === null) {
		return "";
	}
	if (preferShortURL && generatedUrls.shortUrl) {
		return generatedUrls.shortUrl;
	}
	return generatedUrls.longUrl;
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

export function startWorkflowRequestState(
	current: AppState,
	originStage: ResponseOriginStage,
	actionEntry: WorkflowLogEntry,
	options: RequestStartStateOptions = {},
): AppState {
	return {
		...current,
		responseOriginStage: originStage,
		messages: [],
		stage3Expired: options.resetStage3Expired ? false : current.stage3Expired,
		workflowLog: appendWorkflowLogEntries(current.workflowLog, [actionEntry]),
		blockingErrors: [],
	};
}

export function completeWorkflowRequestState(
	current: AppState,
	originStage: ResponseOriginStage,
	messages: Message[],
	blockingErrors: BlockingError[],
	logEntries: WorkflowLogEntry[],
	options: RequestCompletionStateOptions = {},
): AppState {
	return {
		...current,
		...options.patch,
		responseOriginStage: originStage,
		messages,
		workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
		blockingErrors,
	};
}

export function applyShortURLPreferenceToggleState(
	current: AppState,
	checked: boolean,
	options: ShortURLPreferenceToggleOptions,
): AppState {
	if (!checked) {
		if (options.requireShortURL) {
			return {
				...current,
				preferShortUrl: true,
				currentLinkInput: getDisplayedGeneratedURL(current.generatedUrls, true) || current.currentLinkInput,
				workflowLog: options.requiredLogEntry
					? appendWorkflowLogEntries(current.workflowLog, [options.requiredLogEntry])
					: current.workflowLog,
			};
		}
		return {
			...current,
			preferShortUrl: false,
			currentLinkInput: getDisplayedGeneratedURL(current.generatedUrls, false) || current.currentLinkInput,
		};
	}

	if (current.generatedUrls === null) {
		return {
			...current,
			preferShortUrl: true,
		};
	}
	if (current.generatedUrls.shortUrl) {
		return {
			...current,
			preferShortUrl: true,
			currentLinkInput: getDisplayedGeneratedURL(current.generatedUrls, true) || current.currentLinkInput,
		};
	}

	return current;
}

export function startShortURLCreationState(current: AppState, actionEntry: WorkflowLogEntry): AppState {
	return startWorkflowRequestState(
		{
			...current,
			preferShortUrl: true,
		},
		"stage3",
		actionEntry,
	);
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

export function applyStage1ConvertSuccessState(
	current: AppState,
	stage2Init: Stage2Init,
	messages: Message[],
	blockingErrors: BlockingError[],
	logEntries: WorkflowLogEntry[],
): AppState {
	return completeWorkflowRequestState(
		applyStage2InitState(current, stage2Init),
		"stage1",
		messages,
		blockingErrors,
		logEntries,
	);
}

interface RestoreStateOptions {
	blockingErrors: BlockingError[];
	logEntries: WorkflowLogEntry[];
	messages: Message[];
	restoredStage1Input: Stage1Input;
	restoreStatus: AppState["restoreStatus"];
	resolvedLongUrl: string;
	resolvedShortUrl?: string;
	stage2Snapshot: AppState["stage2Snapshot"];
}

function buildRestorePatch(options: RestoreStateOptions) {
	return {
		currentLinkInput: options.resolvedShortUrl ?? options.resolvedLongUrl,
		preferShortUrl: Boolean(options.resolvedShortUrl),
		stage1Input: options.restoredStage1Input,
		stage2Snapshot: options.stage2Snapshot,
		generatedUrls: {
			longUrl: options.resolvedLongUrl,
			shortUrl: options.resolvedShortUrl ?? null,
		},
		stage3Expired: false,
		restoreStatus: options.restoreStatus,
	};
}

export function applyRestoreConflictState(current: AppState, options: RestoreStateOptions): AppState {
	return completeWorkflowRequestState(
		current,
		"stage3",
		options.messages,
		options.blockingErrors.filter((error) => error.scope !== "stage2_row"),
		options.logEntries,
		{
			patch: {
				...buildRestorePatch(options),
				stage2Init: null,
				stage2Stale: false,
			},
		},
	);
}

export function applyRestoreReinitializedState(
	current: AppState,
	stage2Init: Stage2Init,
	options: RestoreStateOptions,
): AppState {
	return completeWorkflowRequestState(
		current,
		"stage3",
		options.messages,
		options.blockingErrors,
		options.logEntries,
		{
			patch: {
				...buildRestorePatch(options),
				stage2Init,
				stage2Stale: false,
			},
		},
	);
}

export function applyRestoreReinitFailedState(current: AppState, options: RestoreStateOptions): AppState {
	return completeWorkflowRequestState(
		current,
		"stage3",
		options.messages,
		options.blockingErrors,
		options.logEntries,
		{
			patch: {
				...buildRestorePatch(options),
				stage2Init: null,
				stage2Stale: true,
			},
		},
	);
}

export function applyGenerateLongURLSuccessState(current: AppState, options: GenerateSuccessStateOptions): AppState {
	return completeWorkflowRequestState(
		current,
		"stage2",
		options.messages,
		options.blockingErrors,
		options.logEntries,
		{
			patch: {
				generatedUrls: {
					longUrl: options.resolvedLongURL,
					shortUrl: null,
				},
				currentLinkInput: options.resolvedLongURL,
				stage3Expired: false,
			},
		},
	);
}

export function applyGenerateShortURLSuccessState(current: AppState, options: GenerateSuccessStateOptions): AppState {
	return completeWorkflowRequestState(
		current,
		"stage2",
		options.messages,
		options.blockingErrors,
		options.logEntries,
		{
			patch: {
				preferShortUrl: options.preferShortURL ?? current.preferShortUrl,
				generatedUrls: {
					longUrl: options.resolvedLongURL,
					shortUrl: options.resolvedShortURL ?? null,
				},
				currentLinkInput: options.resolvedShortURL ?? options.resolvedLongURL,
				stage3Expired: false,
			},
		},
	);
}

export function applyGenerateShortURLFailureState(
	current: AppState,
	options: GenerateShortURLFailureStateOptions,
): AppState {
	return completeWorkflowRequestState(
		current,
		"stage3",
		options.messages,
		options.blockingErrors,
		options.logEntries,
		{
			patch: {
				preferShortUrl: options.requireShortURL,
				generatedUrls: options.requireShortURL
					? null
					: {
						longUrl: options.resolvedLongURL,
						shortUrl: null,
					},
				currentLinkInput: options.requireShortURL ? current.currentLinkInput : options.resolvedLongURL,
				stage3Expired: options.requireShortURL ? current.stage3Expired : false,
			},
		},
	);
}

export function applyShortURLCreationSuccessState(current: AppState, options: ShortURLCreationStateOptions): AppState {
	return completeWorkflowRequestState(
		current,
		"stage3",
		options.messages,
		options.blockingErrors,
		options.logEntries,
		{
			patch: {
				generatedUrls: {
					longUrl: options.resolvedLongURL,
					shortUrl: options.resolvedShortURL ?? null,
				},
				currentLinkInput: options.resolvedShortURL ?? options.resolvedLongURL,
				stage3Expired: false,
			},
		},
	);
}

export function applyShortURLCreationFailureState(current: AppState, options: ShortURLCreationStateOptions): AppState {
	return completeWorkflowRequestState(
		current,
		"stage3",
		options.messages,
		options.blockingErrors,
		options.logEntries,
		{
			patch: {
				preferShortUrl: false,
			},
		},
	);
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