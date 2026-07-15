import {
	clearBlockingErrorsSupersededByStage2Stale,
	clearDuplicateProxyNameErrors,
	clearStage1FieldErrors,
	clearStage3ActionErrors,
	clearStage3FieldErrors,
	mergeDuplicateProxyNameErrors,
} from "../lib/notices";
import { collectDuplicateProxyNameErrors } from "../lib/stage2Validation";
import {
	cloneInstance,
	defaultSnapshotFromCatalog,
	deleteInstance,
	findInstance,
	flattenInstances,
	hydrateInstanceIds,
	mergeSnapshotAfterConvert,
	reorderInstances,
	updateInstance,
	updateServerAggregation,
} from "../lib/stage2";
import type { AppState, ResponseOriginStage, WorkflowLogEntry } from "../lib/state";
import { appendWorkflowLogEntries } from "../lib/workflow-log";
import type {
	AggregationStrategy,
	BlockingError,
	Message,
	RestoreConflict,
	Stage1Input,
	Stage2Aggregation,
	Stage2Bundle,
	Stage2Catalog,
	Stage2Instance,
	Stage2Snapshot,
} from "../types/api";

function expireGeneratedOutput(current: AppState) {
	return {
		generatedUrls: null,
		stage3Expired: current.generatedUrls !== null || current.stage3Expired,
	};
}

function clearStage2Errors(current: AppState) {
	return current.blockingErrors.filter((error) =>
		error.scope !== "stage2_instance" && error.scope !== "stage2_server");
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

interface GenerateSuccessStateOptions extends ShortURLCreationStateOptions {
	preferShortURL?: boolean;
}

interface GenerateShortURLFailureStateOptions extends ShortURLCreationStateOptions {
	requireShortURL: boolean;
}

export interface Stage2SnapshotMergeReport {
	droppedSources: number;
	filteredAggregationMembers: number;
}

export function buildStage2SnapshotRows(catalog: Stage2Catalog) {
	return flattenInstances(defaultSnapshotFromCatalog(catalog), catalog);
}

export function mergeStage2SnapshotAfterConvert(
	current: AppState,
	catalog: Stage2Catalog,
	defaultSnapshot = defaultSnapshotFromCatalog(catalog),
): { snapshot: Stage2Snapshot; report: Stage2SnapshotMergeReport } {
	const oldSourceIds = new Set(
		current.stage2Snapshot.servers.flatMap((server) => server.sources.map((source) => source.sourceId.trim())),
	);
	const newSourceIds = new Set(
		catalog.servers.flatMap((server) => server.sources.map((source) => source.sourceId.trim())),
	);
	const beforeMembers = current.stage2Snapshot.servers.reduce(
		(count, server) => count + (server.aggregation.memberLocalInstanceIds?.length ?? 0),
		0,
	);
	const snapshot = mergeSnapshotAfterConvert(current.stage2Snapshot, catalog, defaultSnapshot);
	const afterMembers = snapshot.servers.reduce(
		(count, server) => count + (server.aggregation.memberLocalInstanceIds?.length ?? 0),
		0,
	);
	return {
		snapshot,
		report: {
			droppedSources: [...oldSourceIds].filter((id) => !newSourceIds.has(id)).length,
			filteredAggregationMembers: Math.max(0, beforeMembers - afterMembers),
		},
	};
}

function getDisplayedGeneratedURL(generatedUrls: AppState["generatedUrls"], preferShortURL: boolean) {
	if (!generatedUrls) return "";
	return preferShortURL && generatedUrls.shortUrl ? generatedUrls.shortUrl : generatedUrls.longUrl;
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
				context: { field: "currentLinkInput", action: actionLabel },
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
	if (!current.generatedUrls || current.generatedUrls.shortUrl) {
		return {
			...current,
			preferShortUrl: true,
			currentLinkInput: getDisplayedGeneratedURL(current.generatedUrls, true) || current.currentLinkInput,
		};
	}
	return current;
}

export function startShortURLCreationState(current: AppState, actionEntry: WorkflowLogEntry): AppState {
	return startWorkflowRequestState({ ...current, preferShortUrl: true }, "stage3", actionEntry);
}

export function updateStage1InputState(
	current: AppState,
	nextStage1Input: Stage1Input,
	changedFields: string[],
): AppState {
	const becomesStale = changedFields.length > 0 && flattenInstances(current.stage2Snapshot).length > 0;
	let blockingErrors = clearStage1FieldErrors(current.blockingErrors, changedFields);
	if (changedFields.length > 0 && current.responseOriginStage === "stage1") blockingErrors = [];
	if (becomesStale) {
		blockingErrors = clearBlockingErrorsSupersededByStage2Stale(blockingErrors, current.responseOriginStage);
	}
	return {
		...current,
		stage1Input: nextStage1Input,
		...expireGeneratedOutput(current),
		stage2Stale: becomesStale || current.stage2Stale,
		blockingErrors,
	};
}

export function applyStage2InitState(
	current: AppState,
	catalog: Stage2Catalog,
	snapshot = defaultSnapshotFromCatalog(catalog),
): AppState {
	return {
		...current,
		stage2Catalog: catalog,
		stage2Init: catalog,
		stage2Snapshot: snapshot,
		aggregationDraftsByServerKey: {},
		generatedUrls: null,
		stage3Expired: false,
		stage2Stale: false,
		restoreStatus: "idle",
		restoreConflicts: [],
	};
}

export function applyStage1ConvertSuccessState(
	current: AppState,
	stage2: Stage2Bundle,
	messages: Message[],
	blockingErrors: BlockingError[],
	logEntries: WorkflowLogEntry[],
	overwriteReset = false,
): AppState {
	const snapshot = hydrateInstanceIds(overwriteReset
		? stage2.snapshot
		: mergeSnapshotAfterConvert(current.stage2Snapshot, stage2.catalog, stage2.snapshot));
	const validServerKeys = new Set(stage2.catalog.servers.map((server) => server.serverKey));
	const drafts = overwriteReset
		? {}
		: Object.fromEntries(
			Object.entries(current.aggregationDraftsByServerKey)
				.filter(([serverKey]) => validServerKeys.has(serverKey)),
		);
	return completeWorkflowRequestState(
		{
			...applyStage2InitState(current, stage2.catalog, snapshot),
			aggregationDraftsByServerKey: drafts,
		},
		overwriteReset ? "stage2" : "stage1",
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
	restoreConflicts?: RestoreConflict[];
	restoreStatus: AppState["restoreStatus"];
	resolvedLongUrl: string;
	resolvedShortUrl?: string;
	stage2Snapshot: Stage2Snapshot;
}

function buildRestorePatch(options: RestoreStateOptions): Partial<AppState> {
	return {
		currentLinkInput: options.resolvedShortUrl ?? options.resolvedLongUrl,
		preferShortUrl: Boolean(options.resolvedShortUrl),
		stage1Input: options.restoredStage1Input,
		stage2Snapshot: hydrateInstanceIds(options.stage2Snapshot),
		aggregationDraftsByServerKey: {},
		generatedUrls: { longUrl: options.resolvedLongUrl, shortUrl: options.resolvedShortUrl ?? null },
		stage3Expired: false,
		restoreStatus: options.restoreStatus,
		restoreConflicts: options.restoreConflicts ?? [],
	};
}

export function applyRestoreConflictState(current: AppState, options: RestoreStateOptions): AppState {
	return completeWorkflowRequestState(current, "stage3", options.messages, options.blockingErrors, options.logEntries, {
		patch: { ...buildRestorePatch(options), stage2Catalog: null, stage2Init: null, stage2Stale: false },
	});
}

export function applyRestoreReinitializedState(
	current: AppState,
	catalog: Stage2Catalog,
	options: RestoreStateOptions,
): AppState {
	return completeWorkflowRequestState(current, "stage3", options.messages, options.blockingErrors, options.logEntries, {
		patch: { ...buildRestorePatch(options), stage2Catalog: catalog, stage2Init: catalog, stage2Stale: false },
	});
}

export function applyRestoreReinitFailedState(current: AppState, options: RestoreStateOptions): AppState {
	return completeWorkflowRequestState(current, "stage3", options.messages, options.blockingErrors, options.logEntries, {
		patch: { ...buildRestorePatch(options), stage2Catalog: null, stage2Init: null, stage2Stale: true },
	});
}

export function applyGenerateLongURLSuccessState(current: AppState, options: GenerateSuccessStateOptions): AppState {
	return completeWorkflowRequestState(current, "stage2", options.messages, options.blockingErrors, options.logEntries, {
		patch: {
			generatedUrls: { longUrl: options.resolvedLongURL, shortUrl: null },
			currentLinkInput: options.resolvedLongURL,
			stage3Expired: false,
		},
	});
}

export function applyGenerateShortURLSuccessState(current: AppState, options: GenerateSuccessStateOptions): AppState {
	return completeWorkflowRequestState(current, "stage2", options.messages, options.blockingErrors, options.logEntries, {
		patch: {
			preferShortUrl: options.preferShortURL ?? current.preferShortUrl,
			generatedUrls: { longUrl: options.resolvedLongURL, shortUrl: options.resolvedShortURL ?? null },
			currentLinkInput: options.resolvedShortURL ?? options.resolvedLongURL,
			stage3Expired: false,
		},
	});
}

export function applyGenerateShortURLFailureState(
	current: AppState,
	options: GenerateShortURLFailureStateOptions,
): AppState {
	return completeWorkflowRequestState(current, "stage3", options.messages, options.blockingErrors, options.logEntries, {
		patch: {
			preferShortUrl: options.requireShortURL,
			generatedUrls: options.requireShortURL ? null : { longUrl: options.resolvedLongURL, shortUrl: null },
			currentLinkInput: options.requireShortURL ? current.currentLinkInput : options.resolvedLongURL,
			stage3Expired: options.requireShortURL ? current.stage3Expired : false,
		},
	});
}

export function applyShortURLCreationSuccessState(current: AppState, options: ShortURLCreationStateOptions): AppState {
	return completeWorkflowRequestState(current, "stage3", options.messages, options.blockingErrors, options.logEntries, {
		patch: {
			generatedUrls: { longUrl: options.resolvedLongURL, shortUrl: options.resolvedShortURL ?? null },
			currentLinkInput: options.resolvedShortURL ?? options.resolvedLongURL,
			stage3Expired: false,
		},
	});
}

export function applyShortURLCreationFailureState(current: AppState, options: ShortURLCreationStateOptions): AppState {
	return completeWorkflowRequestState(current, "stage3", options.messages, options.blockingErrors, options.logEntries, {
		patch: { preferShortUrl: false },
	});
}

function withStage2Mutation(current: AppState, snapshot: Stage2Snapshot, drafts = current.aggregationDraftsByServerKey): AppState {
	if (snapshot === current.stage2Snapshot && drafts === current.aggregationDraftsByServerKey) return current;
	return {
		...current,
		...expireGeneratedOutput(current),
		blockingErrors: clearStage2Errors(current),
		stage2Snapshot: snapshot,
		aggregationDraftsByServerKey: drafts,
	};
}

export function applySwitchOptimizationState(current: AppState, enabled: boolean): AppState {
	if (Boolean(current.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled) === enabled) return current;
	return withStage2Mutation(current, {
		...current.stage2Snapshot,
		chainProxyTargetGroupSwitchOptimizationEnabled: enabled,
	});
}

export function updateStage2RowState(
	current: AppState,
	instanceId: string,
	updater: (instance: Stage2Instance) => Stage2Instance,
): AppState {
	const path = findInstance(current.stage2Snapshot, instanceId);
	if (!path) return current;
	const next = updater(path.instance);
	const snapshot = updateInstance(current.stage2Snapshot, instanceId, () => next);
	return withStage2Mutation(current, snapshot);
}

export function updateStage2ProxyNameState(
	current: AppState,
	instanceId: string,
	proxyName: string,
): AppState {
	const path = findInstance(current.stage2Snapshot, instanceId);
	if (!path || path.instance.proxyName === proxyName) {
		return current;
	}
	const snapshot = updateInstance(current.stage2Snapshot, instanceId, (instance) => ({
		...instance,
		proxyName,
	}));
	return {
		...current,
		...expireGeneratedOutput(current),
		stage2Snapshot: snapshot,
		blockingErrors: clearDuplicateProxyNameErrors(current.blockingErrors),
	};
}

export function applyDuplicateProxyNameValidationState(current: AppState): AppState {
	const rows = flattenInstances(current.stage2Snapshot, current.stage2Catalog);
	const duplicateErrors = collectDuplicateProxyNameErrors(rows);
	const blockingErrors = mergeDuplicateProxyNameErrors(current.blockingErrors, duplicateErrors);
	const hasStage2Blocking = blockingErrors.some(
		(error) => error.scope === "stage2_instance" || error.scope === "stage2_server",
	);

	return {
		...current,
		blockingErrors,
		responseOriginStage: hasStage2Blocking ? "stage2" : current.responseOriginStage,
	};
}

export function cloneStage2RowState(current: AppState, instanceId: string): AppState {
	return withStage2Mutation(current, cloneInstance(current.stage2Snapshot, instanceId));
}

export function deleteStage2RowState(current: AppState, instanceId: string): AppState {
	return withStage2Mutation(current, deleteInstance(current.stage2Snapshot, instanceId));
}

function enabledAggregation(
	aggregation: Stage2Aggregation | undefined,
	strategy: AggregationStrategy,
): Stage2Aggregation {
	return {
		enabled: true,
		...(aggregation?.groupName?.trim() ? { groupName: aggregation.groupName.trim() } : {}),
		strategy: aggregation?.strategy ?? strategy,
		memberLocalInstanceIds: [...(aggregation?.memberLocalInstanceIds ?? [])],
	};
}

export function setServerAggregationEnabledState(
	current: AppState,
	serverKey: string,
	enabled: boolean,
	strategy: AggregationStrategy = "fallback",
): AppState {
	const server = current.stage2Snapshot.servers.find((candidate) => candidate.serverKey.trim() === serverKey.trim());
	if (!server) return current;
	if (!enabled) {
		if (!server.aggregation.enabled) return current;
		const drafts = { ...current.aggregationDraftsByServerKey, [server.serverKey]: { ...server.aggregation } };
		return withStage2Mutation(
			current,
			updateServerAggregation(current.stage2Snapshot, serverKey, () => ({ enabled: false })),
			drafts,
		);
	}
	const draft = current.aggregationDraftsByServerKey[server.serverKey];
	const aggregation = enabledAggregation(draft ?? server.aggregation, strategy);
	const drafts = { ...current.aggregationDraftsByServerKey };
	delete drafts[server.serverKey];
	return withStage2Mutation(
		current,
		updateServerAggregation(current.stage2Snapshot, serverKey, () => aggregation),
		drafts,
	);
}

export function updateServerAggregationStrategyState(
	current: AppState,
	serverKey: string,
	strategy: AggregationStrategy | null,
): AppState {
	if (strategy === null) return setServerAggregationEnabledState(current, serverKey, false);
	const enabled = setServerAggregationEnabledState(current, serverKey, true, strategy);
	return withStage2Mutation(
		enabled,
		updateServerAggregation(enabled.stage2Snapshot, serverKey, (aggregation) => ({ ...aggregation, strategy })),
	);
}

export function updateServerAggregationGroupState(
	current: AppState,
	serverKey: string,
	enabled: boolean,
	strategy: AggregationStrategy,
	memberInstanceId: string,
	checked: boolean,
): AppState {
	let next = setServerAggregationEnabledState(current, serverKey, enabled, strategy);
	if (!enabled) return next;
	const snapshot = updateServerAggregation(next.stage2Snapshot, serverKey, (aggregation, server) => {
		const valid = new Set(server.sources.flatMap((source) => source.instances.map((instance) => instance.instanceId)));
		if (!valid.has(memberInstanceId)) return aggregation;
		const members = [...(aggregation.memberLocalInstanceIds ?? [])].filter((id) => id !== memberInstanceId);
		if (checked) members.push(memberInstanceId);
		return { ...aggregation, strategy, memberLocalInstanceIds: members };
	});
	next = withStage2Mutation(next, snapshot);
	return next;
}

export function updateServerAggregationGroupNameState(
	current: AppState,
	serverKey: string,
	groupName: string,
): AppState {
	const normalized = groupName.trim();
	return withStage2Mutation(
		current,
		updateServerAggregation(current.stage2Snapshot, serverKey, (aggregation) => ({
			...aggregation,
			...(normalized ? { groupName: normalized } : { groupName: undefined }),
		})),
	);
}

export function reorderStage2RowsState(current: AppState, orderedInstanceIds: string[]): AppState {
	const rows = flattenInstances(current.stage2Snapshot);
	if (!rows.length || orderedInstanceIds.length !== rows.length) return current;
	let snapshot = current.stage2Snapshot;
	for (const sourceId of new Set(rows.map((row) => row.sourceId))) {
		snapshot = reorderInstances(
			snapshot,
			sourceId,
			orderedInstanceIds.filter((id) => rows.find((row) => row.instanceId === id)?.sourceId === sourceId),
		);
	}
	return withStage2Mutation(current, snapshot);
}

function moveMember(
	current: AppState,
	serverKey: string,
	memberInstanceId: string,
	toIndex: number,
): AppState {
	return withStage2Mutation(
		current,
		updateServerAggregation(current.stage2Snapshot, serverKey, (aggregation) => {
			if (!aggregation.enabled) return aggregation;
			const members = [...(aggregation.memberLocalInstanceIds ?? [])];
			const from = members.indexOf(memberInstanceId);
			if (from < 0) return aggregation;
			const target = Math.max(0, Math.min(toIndex, members.length - 1));
			if (from === target) return aggregation;
			const [member] = members.splice(from, 1);
			members.splice(target, 0, member);
			return { ...aggregation, memberLocalInstanceIds: members };
		}),
	);
}

export function reorderServerAggregationMemberState(
	current: AppState,
	serverKey: string,
	memberInstanceId: string,
	direction: "up" | "down",
): AppState {
	const aggregation = current.stage2Snapshot.servers.find((server) => server.serverKey === serverKey)?.aggregation;
	const index = aggregation?.memberLocalInstanceIds?.indexOf(memberInstanceId) ?? -1;
	if (index < 0) return current;
	return moveMember(current, serverKey, memberInstanceId, direction === "up" ? index - 1 : index + 1);
}

export function moveServerAggregationMemberToIndexState(
	current: AppState,
	serverKey: string,
	memberInstanceId: string,
	toIndex: number,
): AppState {
	return moveMember(current, serverKey, memberInstanceId, toIndex);
}

export function clearServerAggregationGroupsState(current: AppState): AppState {
	let snapshot = current.stage2Snapshot;
	const drafts = { ...current.aggregationDraftsByServerKey };
	for (const server of snapshot.servers) {
		if (server.aggregation.enabled) drafts[server.serverKey] = { ...server.aggregation };
		snapshot = updateServerAggregation(snapshot, server.serverKey, () => ({ enabled: false }));
	}
	return withStage2Mutation(current, snapshot, drafts);
}
