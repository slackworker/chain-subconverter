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
	getSelectableChoices,
	getStage2RowKey,
	getServerAggregationGroup,
	getServerAggregationStrategy,
	getStage2RowSourceLandingName,
	isSwitchOptimizationEligible,
	isStage2SourceRow,
	matchesStage2RowKey,
	pickNextDerivedProxyName,
} from "../lib/stage2";
import type { BlockingError, Message, ServerAggregationGroup, Stage1Input, Stage2Init, Stage2Row } from "../types/api";

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

export interface Stage2SnapshotMergeReport {
	droppedDerivedRows: number;
	resetModes: number;
	clearedTargets: number;
	filteredAggregationMembers: number;
	disabledAggregationGroups: number;
	removedAggregationGroups: number;
}

function createStage2SnapshotMergeReport(): Stage2SnapshotMergeReport {
	return {
		droppedDerivedRows: 0,
		resetModes: 0,
		clearedTargets: 0,
		filteredAggregationMembers: 0,
		disabledAggregationGroups: 0,
		removedAggregationGroups: 0,
	};
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

function normalizeServerAggregationGroups(rows: Stage2Row[], serverAggregationGroups: ServerAggregationGroup[]) {
	const rowIds = new Set(rows.map((row) => row.rowId?.trim()).filter((rowId): rowId is string => Boolean(rowId)));
	const normalized: ServerAggregationGroup[] = [];
	const seen = new Set<string>();
	for (const group of serverAggregationGroups) {
		const server = group.server.trim();
		if (server === "" || seen.has(server)) {
			continue;
		}
		if (group.strategy !== "fallback" && group.strategy !== "url-test") {
			continue;
		}
		const memberRowIds = Array.from(
			new Set((group.memberRowIds ?? []).map((rowId) => rowId.trim()).filter((rowId) => rowId !== "" && rowIds.has(rowId))),
		);
		seen.add(server);
		normalized.push({
			server,
			enabled: group.enabled,
			strategy: group.strategy,
			memberRowIds,
		});
	}
	return normalized;
}

function normalizeStage2SnapshotRowsAndGroups(
	rows: Stage2Row[],
	serverAggregationGroups: ServerAggregationGroup[],
	chainProxyTargetGroupSwitchOptimizationEnabled = false,
) {
	return {
		rows,
		chainProxyTargetGroupSwitchOptimizationEnabled,
		serverAggregationGroups: normalizeServerAggregationGroups(rows, serverAggregationGroups),
	};
}

function getStage2InitRowsBySource(stage2Init: Stage2Init) {
	const bySource = new Map<string, Stage2Init["rows"][number]>();
	for (const row of stage2Init.rows) {
		const sourceLandingNodeName = getStage2RowSourceLandingName(row);
		if (sourceLandingNodeName === "" || bySource.has(sourceLandingNodeName)) {
			continue;
		}
		bySource.set(sourceLandingNodeName, row);
	}
	return bySource;
}

function getRowServerFromStage2Init(
	row: Stage2Row,
	stage2InitRowsBySource: Map<string, Stage2Init["rows"][number]>,
) {
	const sourceLandingNodeName = getStage2RowSourceLandingName(row);
	const stage2InitRow = stage2InitRowsBySource.get(sourceLandingNodeName);
	const server = stage2InitRow?.server?.trim() ?? "";
	if (server !== "") {
		return server;
	}
	return sourceLandingNodeName === "" ? "" : `source:${sourceLandingNodeName}`;
}

function getAllowedModes(
	stage2Init: Stage2Init,
	stage2InitRowsBySource: Map<string, Stage2Init["rows"][number]>,
	sourceLandingNodeName: string,
) {
	const restrictedModes = stage2InitRowsBySource.get(sourceLandingNodeName)?.restrictedModes ?? {};
	return stage2Init.availableModes.filter((mode) => restrictedModes[mode] === undefined);
}

export function mergeStage2SnapshotAfterConvert(
	current: AppState,
	stage2Init: Stage2Init,
): { snapshot: AppState["stage2Snapshot"]; report: Stage2SnapshotMergeReport } {
	const report = createStage2SnapshotMergeReport();
	const stage2InitRowsBySource = getStage2InitRowsBySource(stage2Init);
	const baseRows = buildStage2SnapshotRows(stage2Init);
	if (current.stage2Snapshot.rows.length === 0) {
		return {
			snapshot: { rows: baseRows, chainProxyTargetGroupSwitchOptimizationEnabled: false, serverAggregationGroups: [] },
			report,
		};
	}

	const existingSourceRows = new Map<string, Stage2Row>();
	for (const row of current.stage2Snapshot.rows) {
		const sourceLandingNodeName = getStage2RowSourceLandingName(row);
		if (sourceLandingNodeName === "") {
			continue;
		}
		const existing = existingSourceRows.get(sourceLandingNodeName);
		if (existing === undefined) {
			existingSourceRows.set(sourceLandingNodeName, row);
			continue;
		}
		if (!isStage2SourceRow(existing) && isStage2SourceRow(row)) {
			existingSourceRows.set(sourceLandingNodeName, row);
		}
	}

	const mergedRows: Stage2Row[] = baseRows.map((baseRow) => {
		const sourceLandingNodeName = getStage2RowSourceLandingName(baseRow);
		const existingSourceRow = existingSourceRows.get(sourceLandingNodeName);
		if (existingSourceRow === undefined) {
			return baseRow;
		}
		const mergedProxyName = existingSourceRow.proxyName ?? existingSourceRow.landingNodeName;
		return {
			...baseRow,
			rowId: existingSourceRow.rowId ?? baseRow.rowId,
			sourceLandingNodeName: existingSourceRow.sourceLandingNodeName ?? sourceLandingNodeName,
			proxyName: mergedProxyName,
			landingNodeName: existingSourceRow.landingNodeName ?? mergedProxyName ?? baseRow.landingNodeName,
			mode: existingSourceRow.mode,
			targetName: existingSourceRow.targetName,
		};
	});

	for (const row of current.stage2Snapshot.rows) {
		if (isStage2SourceRow(row)) {
			continue;
		}
		const sourceLandingNodeName = getStage2RowSourceLandingName(row);
		if (sourceLandingNodeName === "" || !stage2InitRowsBySource.has(sourceLandingNodeName)) {
			report.droppedDerivedRows += 1;
			continue;
		}
		mergedRows.push({
			...row,
			sourceLandingNodeName: row.sourceLandingNodeName ?? sourceLandingNodeName,
		});
	}

	const validatedRows = mergedRows.map((row) => {
		const sourceLandingNodeName = getStage2RowSourceLandingName(row);
		const allowedModes = getAllowedModes(stage2Init, stage2InitRowsBySource, sourceLandingNodeName);
		let mode = row.mode;
		let targetName = row.targetName;
		if (!allowedModes.includes(mode)) {
			const fallbackMode = allowedModes.includes("none")
				? "none"
				: (allowedModes[0] ?? "none");
			if (mode !== fallbackMode) {
				report.resetModes += 1;
			}
			mode = fallbackMode;
			targetName = null;
		}

		if (mode === "none") {
			targetName = null;
		} else {
			const selectableChoices = getSelectableChoices(
				stage2Init,
				mergedRows,
				getStage2RowKey(row),
				mode,
			);
			const selectableValues = new Set(selectableChoices.map((choice) => choice.value));
			if (targetName === null || !selectableValues.has(targetName)) {
				if (targetName !== null) {
					report.clearedTargets += 1;
				}
				targetName = null;
			}
		}

		const nextRow: Stage2Row = {
			...row,
			mode,
			targetName,
		};
		return nextRow;
	});

	const rowsByID = new Map(
		validatedRows
			.map((row) => {
				const rowID = row.rowId?.trim() ?? "";
				return rowID === "" ? null : ([rowID, row] as const);
			})
			.filter((entry): entry is readonly [string, Stage2Row] => entry !== null),
	);
	const nextServerAggregationGroups: ServerAggregationGroup[] = [];
	const seenServers = new Set<string>();
	for (const group of current.stage2Snapshot.serverAggregationGroups) {
		const server = group.server.trim();
		if (server === "" || seenServers.has(server) || (group.strategy !== "fallback" && group.strategy !== "url-test")) {
			report.removedAggregationGroups += 1;
			continue;
		}
		seenServers.add(server);
		const existingMemberRowIds = Array.from(
			new Set(group.memberRowIds.map((rowID) => rowID.trim()).filter(Boolean)),
		);
		const memberRowIds = existingMemberRowIds.filter((rowID) => {
			const row = rowsByID.get(rowID);
			if (row === undefined) {
				return false;
			}
			return getRowServerFromStage2Init(row, stage2InitRowsBySource) === server;
		});
		report.filteredAggregationMembers += Math.max(0, existingMemberRowIds.length - memberRowIds.length);
		let enabled = group.enabled;
		if (enabled && memberRowIds.length < 2) {
			enabled = false;
			report.disabledAggregationGroups += 1;
		}
		nextServerAggregationGroups.push({
			server,
			enabled,
			strategy: group.strategy,
			memberRowIds,
		});
	}

	const hasEligibleRows = validatedRows.some((row) => isSwitchOptimizationEligible(stage2Init, row));
	const chainProxyTargetGroupSwitchOptimizationEnabled = hasEligibleRows && Boolean(current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled);
	return {
		snapshot: normalizeStage2SnapshotRowsAndGroups(validatedRows, nextServerAggregationGroups, chainProxyTargetGroupSwitchOptimizationEnabled),
		report,
	};
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
	const becomesStale = changedFields.length > 0 && current.stage2Snapshot.rows.length > 0;
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

export function applyStage2InitState(
	current: AppState,
	stage2Init: Stage2Init,
	stage2SnapshotOverride?: AppState["stage2Snapshot"],
): AppState {
	return {
		...current,
		stage2Init,
		stage2Snapshot: stage2SnapshotOverride
			? normalizeStage2SnapshotRowsAndGroups(
				stage2SnapshotOverride.rows,
				stage2SnapshotOverride.serverAggregationGroups,
					Boolean(stage2SnapshotOverride.chainProxyTargetGroupSwitchOptimizationEnabled),
			)
				: { rows: buildStage2SnapshotRows(stage2Init), chainProxyTargetGroupSwitchOptimizationEnabled: false, serverAggregationGroups: [] },
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
	stage2SnapshotOverride?: AppState["stage2Snapshot"],
): AppState {
	return completeWorkflowRequestState(
		applyStage2InitState(current, stage2Init, stage2SnapshotOverride),
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
		stage2Snapshot: normalizeStage2SnapshotRowsAndGroups(
			options.stage2Snapshot.rows,
			options.stage2Snapshot.serverAggregationGroups ?? [],
			Boolean(options.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled),
		),
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

export function applySwitchOptimizationState(
	current: AppState,
	enabled: boolean,
	isEligible: (row: Stage2Row) => boolean,
): AppState {
	const hasEligibleRows = current.stage2Snapshot.rows.some((row) => isEligible(row));
	const nextEnabled = enabled && hasEligibleRows;
	if (Boolean(current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled) === nextEnabled) {
		return current;
	}
	return {
		...current,
		...expireGeneratedOutput(current),
		blockingErrors: clearStage2RowErrors(current),
		stage2Snapshot: {
			rows: current.stage2Snapshot.rows,
			chainProxyTargetGroupSwitchOptimizationEnabled: nextEnabled,
			serverAggregationGroups: current.stage2Snapshot.serverAggregationGroups,
		},
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
		stage2Snapshot: normalizeStage2SnapshotRowsAndGroups(
			current.stage2Snapshot.rows.map((row) => (matchesStage2RowKey(row, landingNodeName) ? updater(row) : row)),
			current.stage2Snapshot.serverAggregationGroups,
			Boolean(current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled),
		),
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
		stage2Snapshot: normalizeStage2SnapshotRowsAndGroups(
			nextRows,
			current.stage2Snapshot.serverAggregationGroups,
			Boolean(current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled),
		),
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
		stage2Snapshot: normalizeStage2SnapshotRowsAndGroups(
			current.stage2Snapshot.rows.filter((row) => !matchesStage2RowKey(row, landingNodeName)),
			current.stage2Snapshot.serverAggregationGroups,
			Boolean(current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled),
		),
	};
}

export function updateServerAggregationStrategyState(
	current: AppState,
	server: string,
	strategy: ServerAggregationGroup["strategy"] | null,
): AppState {
	const trimmedServer = server.trim();
	if (trimmedServer === "") {
		return current;
	}
	const existingGroup = getServerAggregationGroup(current.stage2Snapshot, trimmedServer);
	const nextServerAggregationGroups = current.stage2Snapshot.serverAggregationGroups.filter(
		(group) => group.server.trim() !== trimmedServer,
	);
	if (strategy !== null && existingGroup !== null) {
		nextServerAggregationGroups.push({
			...existingGroup,
			strategy,
		});
	}
	const currentStrategy = getServerAggregationStrategy(current.stage2Snapshot, trimmedServer);
	if (currentStrategy === strategy || (strategy !== null && existingGroup === null)) {
		return current;
	}

	return {
		...current,
		...expireGeneratedOutput(current),
		blockingErrors: clearStage2RowErrors(current),
		stage2Snapshot: normalizeStage2SnapshotRowsAndGroups(
			current.stage2Snapshot.rows,
			nextServerAggregationGroups,
			Boolean(current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled),
		),
	};
}

export function updateServerAggregationGroupState(
	current: AppState,
	server: string,
	enabled: boolean,
	strategy: ServerAggregationGroup["strategy"],
	memberRowID: string,
	checked: boolean,
): AppState {
	const trimmedServer = server.trim();
	const trimmedMemberRowID = memberRowID.trim();
	if (trimmedServer === "" || trimmedMemberRowID === "") {
		return current;
	}
	const existingGroup = getServerAggregationGroup(current.stage2Snapshot, trimmedServer);
	const nextServerAggregationGroups = current.stage2Snapshot.serverAggregationGroups.filter(
		(group) => group.server.trim() !== trimmedServer,
	);
	const existingMemberRowIds = (existingGroup?.memberRowIds ?? [])
		.map((rowID) => rowID.trim())
		.filter(Boolean);
	let memberRowIds: string[];
	if (checked) {
		memberRowIds = existingMemberRowIds.includes(trimmedMemberRowID)
			? existingMemberRowIds
			: [...existingMemberRowIds, trimmedMemberRowID];
	} else {
		memberRowIds = existingMemberRowIds.filter((rowID) => rowID !== trimmedMemberRowID);
	}
	const nextGroup: ServerAggregationGroup = {
		server: trimmedServer,
		enabled,
		strategy,
		memberRowIds,
	};
	if (!enabled && nextGroup.memberRowIds.length === 0) {
		if (existingGroup === null) {
			return current;
		}
	} else {
		nextServerAggregationGroups.push(nextGroup);
	}

	return {
		...current,
		...expireGeneratedOutput(current),
		blockingErrors: clearStage2RowErrors(current),
		stage2Snapshot: normalizeStage2SnapshotRowsAndGroups(
			current.stage2Snapshot.rows,
			nextServerAggregationGroups,
			Boolean(current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled),
		),
	};
}

export function reorderServerAggregationMemberState(
	current: AppState,
	server: string,
	memberRowID: string,
	direction: "up" | "down",
): AppState {
	const trimmedServer = server.trim();
	const trimmedMemberRowID = memberRowID.trim();
	if (trimmedServer === "" || trimmedMemberRowID === "") {
		return current;
	}
	const existingGroup = getServerAggregationGroup(current.stage2Snapshot, trimmedServer);
	if (existingGroup === null || !existingGroup.enabled) {
		return current;
	}
	const memberRowIds = existingGroup.memberRowIds.map((rowID) => rowID.trim()).filter(Boolean);
	const currentIndex = memberRowIds.indexOf(trimmedMemberRowID);
	if (currentIndex < 0) {
		return current;
	}
	const swapIndex = direction === "up" ? currentIndex - 1 : currentIndex + 1;
	if (swapIndex < 0 || swapIndex >= memberRowIds.length) {
		return current;
	}
	const nextMemberRowIds = [...memberRowIds];
	[nextMemberRowIds[currentIndex], nextMemberRowIds[swapIndex]] = [
		nextMemberRowIds[swapIndex],
		nextMemberRowIds[currentIndex],
	];
	const nextServerAggregationGroups = current.stage2Snapshot.serverAggregationGroups.filter(
		(group) => group.server.trim() !== trimmedServer,
	);
	nextServerAggregationGroups.push({
		...existingGroup,
		memberRowIds: nextMemberRowIds,
	});

	return {
		...current,
		...expireGeneratedOutput(current),
		blockingErrors: clearStage2RowErrors(current),
		stage2Snapshot: normalizeStage2SnapshotRowsAndGroups(
			current.stage2Snapshot.rows,
			nextServerAggregationGroups,
			Boolean(current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled),
		),
	};
}

export function moveServerAggregationMemberToIndexState(
	current: AppState,
	server: string,
	memberRowID: string,
	toIndex: number,
): AppState {
	const trimmedServer = server.trim();
	const trimmedMemberRowID = memberRowID.trim();
	if (trimmedServer === "" || trimmedMemberRowID === "") {
		return current;
	}
	const existingGroup = getServerAggregationGroup(current.stage2Snapshot, trimmedServer);
	if (existingGroup === null || !existingGroup.enabled) {
		return current;
	}
	const memberRowIds = existingGroup.memberRowIds.map((rowID) => rowID.trim()).filter(Boolean);
	const currentIndex = memberRowIds.indexOf(trimmedMemberRowID);
	if (currentIndex < 0) {
		return current;
	}
	const clampedToIndex = Math.max(0, Math.min(toIndex, memberRowIds.length - 1));
	if (currentIndex === clampedToIndex) {
		return current;
	}
	const nextMemberRowIds = [...memberRowIds];
	const [removed] = nextMemberRowIds.splice(currentIndex, 1);
	nextMemberRowIds.splice(clampedToIndex, 0, removed);
	const nextServerAggregationGroups = current.stage2Snapshot.serverAggregationGroups.filter(
		(group) => group.server.trim() !== trimmedServer,
	);
	nextServerAggregationGroups.push({
		...existingGroup,
		memberRowIds: nextMemberRowIds,
	});

	return {
		...current,
		...expireGeneratedOutput(current),
		blockingErrors: clearStage2RowErrors(current),
		stage2Snapshot: normalizeStage2SnapshotRowsAndGroups(
			current.stage2Snapshot.rows,
			nextServerAggregationGroups,
			Boolean(current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled),
		),
	};
}

export function clearServerAggregationGroupsState(current: AppState): AppState {
	if (current.stage2Snapshot.serverAggregationGroups.length === 0) {
		return current;
	}
	return {
		...current,
		...expireGeneratedOutput(current),
		blockingErrors: clearStage2RowErrors(current),
		stage2Snapshot: {
			rows: current.stage2Snapshot.rows,
			chainProxyTargetGroupSwitchOptimizationEnabled: current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled,
			serverAggregationGroups: [],
		},
	};
}