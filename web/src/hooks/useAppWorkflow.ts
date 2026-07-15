import { useState } from "react";

import { getErrorResponse, postGenerate, postResolveURL, postShortLink, postStage1Convert } from "../lib/api";
import { DEFAULT_MAX_PUBLIC_LONG_URL_LENGTH } from "../lib/defaults";
import {
	clearBlockingErrorsSupersededByStage2Stale,
	clearStage1FieldErrors,
	clearStage3ActionErrors,
	clearStage3FieldErrors,
	getFieldErrors,
	getOriginStageLabel,
	getPrimaryBlockingErrorsForStage,
	getRowErrors,
	getStage3FieldErrors,
	getVisibleMessages,
	shouldPromoteStage2StaleNotice,
} from "../lib/notices";
import {
	findStage2RowByKey,
	findCatalogSource,
	flattenInstances,
	getServerAggregationGroup,
	getServerAggregationStrategy,
	getChainTargetChoiceGroups,
	getForwardRelayChoices,
	getStage2RowDisplayName,
	getStage2RowKey,
	normalizeSnapshotForRequest,
	pickNextTarget,
} from "../lib/stage2";
import { collectDuplicateProxyNameErrors } from "../lib/stage2Validation";
import {
	hydrateStage1Input,
	initialAppState,
	initialStage1Input,
	isInitialStage1Input,
	normalizeRawTextareaInput,
	toStage1InputPayload,
} from "../lib/state";
import {
	appendWorkflowLogEntries,
	backendMessagesToWorkflowLog,
	buildWorkflowLogEntry,
	frontendWorkflowEvent,
	frontendWorkflowFailureEvent,
	workflowActionSeparator,
} from "../lib/workflow-log";
import type { ResponseOriginStage, WorkflowLogEntry } from "../lib/state";
import { WORKFLOW_EVENTS, type WorkflowEventCode } from "../lib/workflow-log-events";
import type {
	AggregationStrategy,
	BlockingError,
	Message,
	Stage1Input,
	Stage2CatalogSource,
	Stage2Instance,
	Stage2Mode,
	Stage2Row,
} from "../types/api";
import type { APIRequestError } from "../lib/api";
import type { ChainTargetChoiceGroup, TargetChoice } from "../lib/stage2";
import {
	applyGenerateLongURLSuccessState,
	applyGenerateShortURLFailureState,
	applyGenerateShortURLSuccessState,
	applyRestoreConflictState,
	applyRestoreReinitializedState,
	applyShortURLCreationFailureState,
	applyShortURLCreationSuccessState,
	applyShortURLPreferenceToggleState,
	applyStage1ConvertSuccessState,
	cloneStage2RowState,
	clearServerAggregationGroupsState,
	completeWorkflowRequestState,
	deleteStage2RowState,
	mergeStage2SnapshotAfterConvert,
	reportCurrentLinkInputErrorState,
	moveServerAggregationMemberToIndexState,
	reorderServerAggregationMemberState,
	setCurrentLinkInputState,
	startShortURLCreationState,
	startWorkflowRequestState,
	updateServerAggregationGroupState,
	updateServerAggregationGroupNameState,
	updateServerAggregationStrategyState,
	updateStage1InputState,
	applyDuplicateProxyNameValidationState,
	applySwitchOptimizationState,
	updateStage2ProxyNameState,
	updateStage2RowState,
} from "./useAppWorkflow.state";
import type { Stage2SnapshotMergeReport } from "./useAppWorkflow.state";

export type WorkflowTone = "neutral" | "warning" | "success";

export interface WorkflowStatus {
	label: string;
	tone: WorkflowTone;
}

interface RequestFailureContext {
	stageLabel: string;
	actionLabel: string;
	requestPath: string;
}

type Stage2SnapshotRows = Stage2Row[];

function buildStage2MergeMessages(
	report: Stage2SnapshotMergeReport,
): Message[] {
	const messages: Message[] = [];
	if (report.droppedSources > 0) {
		messages.push({
			level: "warning",
			code: "STAGE2_MERGE_ROW_DROPPED",
			message: `已移除 ${report.droppedSources} 个失效来源及其实例。`,
		});
	}
	if (report.filteredAggregationMembers > 0) {
		messages.push({
			level: "warning",
			code: "STAGE2_MERGE_AGG_MEMBER_FILTERED",
			message: `聚合组已移除 ${report.filteredAggregationMembers} 个失效成员引用。`,
		});
	}
	return messages;
}

export interface AppWorkflowViewModel {
	state: typeof initialAppState;
	stage2Rows: Stage2Row[];
	modeOptions: Stage2Mode[];
	responseOriginStage: ResponseOriginStage | null;
	originStageLabel?: string;
	visibleMessages: Message[];
	workflowLog: WorkflowLogEntry[];
	shouldShowStage2StaleNotice: boolean;
	isConverting: boolean;
	isRestoring: boolean;
	isGenerating: boolean;
	isResettingStage2: boolean;
	isCreatingShortUrl: boolean;
	isConflictReadonly: boolean;
	isStage2Editable: boolean;
	canGenerate: boolean;
	stage1Status: WorkflowStatus;
	stage2Status: WorkflowStatus;
	stage3Status: WorkflowStatus;
	applyDefaultTemplateURL: (templateURL: string) => void;
	setCurrentLinkInput: (value: string) => void;
	reportCurrentLinkInputError: (message: string, actionLabel: string) => void;
	updateStage1Input: (updater: (current: Stage1Input) => Stage1Input) => void;
	getStage1FieldErrors: (field: string) => BlockingError[];
	getStage3FieldErrors: (field: string) => BlockingError[];
	getStage2RowMeta: (rowKey: string) => Stage2CatalogSource | null;
	getStage2RowErrors: (rowKey: string) => BlockingError[];
	getPrimaryBlockingErrorsForStage: (stage: ResponseOriginStage) => BlockingError[];
	getStageMessages: (stage: ResponseOriginStage) => Message[];
	getChainTargetChoiceGroups: () => ChainTargetChoiceGroup[];
	getForwardRelayChoices: (rowKey: string) => TargetChoice[];
	getServerAggregationStrategy: (rowKey: string) => AggregationStrategy | null;
	canConfigureServerAggregationGroup: (rowKey: string) => boolean;
	getServerAggregationGroup: (rowKey: string) => { server: string; groupName: string; enabled: boolean; strategy: AggregationStrategy; memberChecked: boolean } | null;
	handleServerAggregationGroupNameChange: (rowKey: string, groupName: string) => void;
	getServerAggregationOrderedMembers: (
		rowKey: string,
	) => Array<{ instanceId: string; displayName: string; isDefaultInstance: boolean }>;
	handleStage1Convert: () => Promise<void>;
	handleStage1Reset: () => void;
	isStage1AtInitial: boolean;
	handleRestore: () => Promise<void>;
	handleProxyNameChange: (rowKey: string, proxyName: string) => void;
	handleProxyNameBlur: () => void;
	handleCloneStage2Row: (rowKey: string) => void;
	handleDeleteStage2Row: (rowKey: string) => void;
	canDeleteStage2Row: (rowKey: string) => boolean;
	handleModeChange: (rowKey: string, mode: Stage2Row["mode"]) => void;
	handleTargetChange: (rowKey: string, targetName: string) => void;
	handleServerAggregationStrategyChange: (rowKey: string, strategy: AggregationStrategy | null) => void;
	handleServerAggregationChange: (rowKey: string, payload: { enabled: boolean; strategy: AggregationStrategy; memberChecked: boolean }) => void;
	handleServerAggregationEnableWithDefaults: (rowKey: string, payload: { enabled: boolean; strategy: AggregationStrategy }) => void;
	handleServerAggregationMemberReorder: (
		rowKey: string,
		memberInstanceId: string,
		direction: "up" | "down",
	) => void;
	handleServerAggregationMemberMoveTo: (
		rowKey: string,
		memberInstanceId: string,
		toIndex: number,
	) => void;
	handleSwitchOptimizationChange: (enabled: boolean) => void;
	handleClearServerAggregationGroups: () => void;
	handleStage2Reset: () => Promise<void>;
	handleGenerate: () => Promise<void>;
	handlePreferShortUrl: (checked: boolean) => Promise<void>;
	recordWorkflowEvent: (code: WorkflowEventCode, originStage?: ResponseOriginStage | null) => void;
}

function fallbackBlockingError(error: unknown, context: RequestFailureContext): BlockingError {
	const requestError = typeof error === "object" && error !== null ? error as APIRequestError : null;
	const detail = error instanceof Error ? error.message : "请求失败";
	const requestPath = requestError?.requestPath ?? context.requestPath;
	const status = requestError?.status;
	const requestSummary = `${context.stageLabel}「${context.actionLabel}」 请求失败`;
	const isNetworkFailure = status === undefined && requestError?.errorBody === undefined;

	return {
		code: "REQUEST_FAILED",
		message: isNetworkFailure
			? `${requestSummary}：浏览器未拿到 ${requestPath} 的响应（${detail}）。这通常表示预览页 / API 服务不可达、代理未生效，或请求在到达后端前就已经中断。`
			: `${requestSummary}：${requestPath} 返回 HTTP ${status ?? "unknown"}${detail ? `（${detail}）` : ""}。`,
		scope: "global",
	};
}

function mergeMessages(...messageGroups: Message[][]): Message[] {
	const seen = new Set<string>();
	return messageGroups.flat().filter((message) => {
		const key = `${message.level}:${message.code}:${message.message}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function getDisplayedGeneratedUrl(
	generatedUrls: typeof initialAppState.generatedUrls,
	preferShortUrl: boolean,
) {
	if (generatedUrls === null) {
		return "";
	}
	if (preferShortUrl && generatedUrls.shortUrl) {
		return generatedUrls.shortUrl;
	}
	return generatedUrls.longUrl;
}

function exceedsPublicLongURLBudget(longUrl: string, maxPublicLongURLLength: number) {
	return maxPublicLongURLLength > 0 && longUrl.length > maxPublicLongURLLength;
}

function getModeOptions(stage2Init: typeof initialAppState.stage2Catalog) {
	return stage2Init?.availableModes ?? [];
}

function getSelectableChoices(stage2Init: typeof initialAppState.stage2Catalog, stage2Rows: Stage2SnapshotRows, rowKey: string, mode: Stage2Row["mode"]) {
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

function collectGeneratePrecheckBlockingErrors(
	stage2Snapshot: typeof initialAppState.stage2Snapshot,
	catalog: typeof initialAppState.stage2Catalog,
): BlockingError[] {
	const errors = collectDuplicateProxyNameErrors(flattenInstances(stage2Snapshot, catalog));
	for (const server of stage2Snapshot.servers) {
		const aggregation = server.aggregation;
		if (!aggregation.enabled) {
			continue;
		}
		const memberLocalInstanceIds = Array.from(new Set(
			(aggregation.memberLocalInstanceIds ?? []).map((id) => id.trim()).filter(Boolean),
		));
		if (memberLocalInstanceIds.length >= 2) {
			continue;
		}
		errors.push({
			code: "SERVER_AGGREGATION_GROUP_TOO_SMALL",
			message: `聚合/策略组（${server.serverKey || "--"}）至少需要入组 2 个成员，当前为 ${memberLocalInstanceIds.length} 个。`,
			scope: "stage2_server",
			context: {
				serverKey: server.serverKey,
			},
		});
	}

	return errors;
}

function resolveServerAggregationServer(
	row: Stage2Row,
	rowMeta: Stage2CatalogSource | null,
): string {
	return rowMeta === null ? "" : row.serverKey;
}

function sameStringArray(current: string[] | null | undefined, next: string[] | null | undefined) {
	if (current === next) {
		return true;
	}
	if ((current?.length ?? 0) !== (next?.length ?? 0)) {
		return false;
	}
	for (let index = 0; index < (current?.length ?? 0); index += 1) {
		if (current?.[index] !== next?.[index]) {
			return false;
		}
	}
	return true;
}

function sameNullableBoolean(current: boolean | null | undefined, next: boolean | null | undefined) {
	return (current ?? null) === (next ?? null);
}

function getChangedStage1Fields(current: Stage1Input, next: Stage1Input) {
	const changedFields = new Set<string>();

	if (normalizeRawTextareaInput(current.landingRawText) !== normalizeRawTextareaInput(next.landingRawText)) {
		changedFields.add("landingRawText");
	}
	if (normalizeRawTextareaInput(current.transitRawText) !== normalizeRawTextareaInput(next.transitRawText)) {
		changedFields.add("transitRawText");
	}
	if (!sameStringArray(current.forwardRelayItems, next.forwardRelayItems)) {
		changedFields.add("forwardRelayItems");
	}
	if (current.advancedOptions.config !== next.advancedOptions.config) {
		changedFields.add("config");
	}
	if (!sameStringArray(current.advancedOptions.include, next.advancedOptions.include)) {
		changedFields.add("include");
	}
	if (!sameStringArray(current.advancedOptions.exclude, next.advancedOptions.exclude)) {
		changedFields.add("exclude");
	}
	if (!sameNullableBoolean(current.advancedOptions.emoji, next.advancedOptions.emoji)) {
		changedFields.add("emoji");
	}
	if (!sameNullableBoolean(current.advancedOptions.udp, next.advancedOptions.udp)) {
		changedFields.add("udp");
	}
	if (!sameNullableBoolean(current.advancedOptions.skipCertVerify, next.advancedOptions.skipCertVerify)) {
		changedFields.add("skipCertVerify");
	}

	return Array.from(changedFields);
}

export function useAppWorkflow(maxPublicLongURLLength = DEFAULT_MAX_PUBLIC_LONG_URL_LENGTH) {
	const [state, setState] = useState(initialAppState);
	const [isConverting, setIsConverting] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isResettingStage2, setIsResettingStage2] = useState(false);
	const [isCreatingShortUrl, setIsCreatingShortUrl] = useState(false);

	const stage2Rows = flattenInstances(state.stage2Snapshot, state.stage2Catalog);
	const modeOptions = getModeOptions(state.stage2Catalog);
	const isConflictReadonly = state.restoreStatus === "conflicted";
	const isStage2Editable = state.stage2Init !== null && !state.stage2Stale && !isConflictReadonly;
	const canGenerate = stage2Rows.length > 0 && !state.stage2Stale && !isConflictReadonly && !isGenerating && !isResettingStage2;
	const originStageLabel = getOriginStageLabel(state.responseOriginStage);
	const visibleMessages = getVisibleMessages(state.messages, state.responseOriginStage);
	const workflowLog = state.workflowLog;
	const shouldShowStage2StaleNotice = shouldPromoteStage2StaleNotice({
		stage2Stale: state.stage2Stale,
		hasStage2Rows: stage2Rows.length > 0,
		hasBlockingErrors: state.blockingErrors.length > 0,
		isRequestInFlight: isConverting || isResettingStage2,
		isConflictReadonly,
	});

	const stage1Status: WorkflowStatus =
		state.stage1Input.landingRawText.trim() === "" && state.stage1Input.transitRawText.trim() === ""
			? { label: "Awaiting Input", tone: "neutral" }
			: state.stage2Stale && stage2Rows.length > 0
				? { label: "Changed", tone: "warning" }
				: state.stage2Init !== null
					? { label: "Converted", tone: "success" }
					: { label: "Editing", tone: "neutral" };

	const hasStage2Baseline = state.stage2Init !== null || stage2Rows.length > 0;
	const stage2Status: WorkflowStatus = isConflictReadonly
		? { label: "Conflict", tone: "warning" }
		: state.stage2Stale && hasStage2Baseline
			? { label: "Stage 2 Stale", tone: "warning" }
			: state.stage2Init === null
				? { label: "Awaiting Init", tone: "neutral" }
				: { label: "Ready", tone: "success" };

	const stage3Status: WorkflowStatus = state.stage3Expired
		? { label: "Expired", tone: "warning" }
		: state.generatedUrls === null
		? { label: "Awaiting Generate", tone: "neutral" }
		: state.generatedUrls.shortUrl
			? { label: "Short URL Ready", tone: "success" }
			: { label: "Long URL Ready", tone: "success" };

	function applyDefaultTemplateURL(templateURL: string) {
		const normalizedTemplateURL = templateURL.trim();
		if (normalizedTemplateURL === "") {
			return;
		}
		updateStage1Input((current) => {
			if ((current.advancedOptions.config ?? "").trim() !== "") {
				return current;
			}
			return {
				...current,
				advancedOptions: {
					...current.advancedOptions,
					config: normalizedTemplateURL,
				},
			};
		});
	}

	function setCurrentLinkInput(value: string) {
		setState((current) => setCurrentLinkInputState(current, value));
	}

	function reportCurrentLinkInputError(message: string, actionLabel: string) {
		setState((current) => reportCurrentLinkInputErrorState(current, message, actionLabel));
	}

	function summarizeBlockingErrors(errors: BlockingError[], fallback: string) {
		return errors[0]?.message ?? fallback;
	}

	function recordWorkflowEvent(
		code: WorkflowEventCode,
		originStage: ResponseOriginStage | null = WORKFLOW_EVENTS[code].originStage,
	) {
		const event = WORKFLOW_EVENTS[code];
		setState((current) => ({
			...current,
			workflowLog: appendWorkflowLogEntries(
				current.workflowLog,
				[buildWorkflowLogEntry(event.level, code, event.message, "frontend", originStage)],
			),
		}));
	}

	function updateStage1Input(updater: (current: Stage1Input) => Stage1Input) {
		setState((current) => {
			const nextStage1Input = updater(current.stage1Input);
			const changedFields = getChangedStage1Fields(current.stage1Input, nextStage1Input);
			return updateStage1InputState(current, nextStage1Input, changedFields);
		});
	}

	function handleStage1Reset() {
		if (isConverting || isInitialStage1Input(state.stage1Input)) {
			return;
		}
		updateStage1Input(() => initialStage1Input);
	}

	const isStage1AtInitial = isInitialStage1Input(state.stage1Input);

	function getStage1FieldErrors(field: string) {
		return getFieldErrors(state.blockingErrors, field);
	}

	function getStage3FieldErrorsForField(field: string) {
		return getStage3FieldErrors(state.blockingErrors, field);
	}

	function getStage2RowMeta(rowKey: string) {
		const snapshotRow = findStage2RowByKey(stage2Rows, rowKey);
		return snapshotRow ? findCatalogSource(state.stage2Catalog, snapshotRow.sourceId)?.source ?? null : null;
	}

	function getStage2RowErrors(rowKey: string) {
		if (!isStage2Editable) {
			return [];
		}
		const row = findStage2RowByKey(stage2Rows, rowKey);
		return row ? getRowErrors(state.blockingErrors, row) : getRowErrors(state.blockingErrors, rowKey);
	}

	function getPrimaryBlockingErrors(stage: ResponseOriginStage) {
		return getPrimaryBlockingErrorsForStage(state.blockingErrors, state.responseOriginStage, stage);
	}

	function getStageMessages(stage: ResponseOriginStage) {
		return getVisibleMessages(state.messages, state.responseOriginStage, stage);
	}

	async function handleStage1Convert() {
		const stage1Input = state.stage1Input;
		setIsConverting(true);
		setState((current) => startWorkflowRequestState(current, "stage1", workflowActionSeparator("ACTION_STAGE1_CONVERT")));

		try {
			const response = await postStage1Convert({ stage1Input: toStage1InputPayload(stage1Input) });
			setState((current) => {
				const mergeResult = mergeStage2SnapshotAfterConvert(current, response.stage2.catalog, response.stage2.snapshot);
				const mergeMessages = buildStage2MergeMessages(mergeResult.report);
				const mergedMessages = response.messages.concat(mergeMessages);
				const logEntries = backendMessagesToWorkflowLog(response.messages, "stage1").concat(
					mergeMessages.map((message) =>
						buildWorkflowLogEntry(message.level, message.code, message.message, "frontend", "stage1"),
					),
				);
				return applyStage1ConvertSuccessState(
					current,
					response.stage2,
					mergedMessages,
					response.blockingErrors,
					logEntries,
					false,
				);
			});
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			const blockingErrors = errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
				stageLabel: "Stage 1 / 输入区",
				actionLabel: "转换并自动填充",
				requestPath: "POST /api/stage1/convert",
			})];
			const messages = errorResponse?.messages ?? [];
			const logEntries = backendMessagesToWorkflowLog(messages, "stage1").concat(
				frontendWorkflowFailureEvent("STAGE1_CONVERT_FAILED", summarizeBlockingErrors(blockingErrors, "请求失败。")),
			);
			setState((current) => completeWorkflowRequestState(current, "stage1", messages, blockingErrors, logEntries));
		} finally {
			setIsConverting(false);
		}
	}

	async function handleRestore() {
		const restoreInput = state.currentLinkInput.trim();
		if (restoreInput === "") {
			return;
		}

		setIsRestoring(true);
		setState((current) => startWorkflowRequestState(current, "stage3", workflowActionSeparator("ACTION_RESTORE"), { resetStage3Expired: true }));

		try {
			const restoreResponse = await postResolveURL(restoreInput);
			const restoredStage1Input = hydrateStage1Input(restoreResponse.stage1Input);
			if (restoreResponse.restoreStatus === "conflicted") {
				const logEntries = backendMessagesToWorkflowLog(restoreResponse.messages, "stage3");
				setState((current) => applyRestoreConflictState(current, {
					blockingErrors: restoreResponse.blockingErrors,
					logEntries,
					messages: restoreResponse.messages,
					restoredStage1Input,
					restoreConflicts: restoreResponse.restoreConflicts ?? [],
					restoreStatus: restoreResponse.restoreStatus,
					resolvedLongUrl: restoreResponse.longUrl,
					resolvedShortUrl: restoreResponse.shortUrl,
					stage2Snapshot: restoreResponse.stage2.snapshot,
				}));
				return;
			}
			const logEntries = backendMessagesToWorkflowLog(restoreResponse.messages, "stage3");
			setState((current) => applyRestoreReinitializedState(current, restoreResponse.stage2.catalog, {
				blockingErrors: restoreResponse.blockingErrors,
				logEntries,
				messages: restoreResponse.messages,
				restoredStage1Input,
				restoreStatus: restoreResponse.restoreStatus,
				resolvedLongUrl: restoreResponse.longUrl,
				resolvedShortUrl: restoreResponse.shortUrl,
				stage2Snapshot: restoreResponse.stage2.snapshot,
			}));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			const blockingErrors = errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
				stageLabel: "Stage 3 / 输出区",
				actionLabel: "反向解析",
				requestPath: "POST /api/resolve-url",
			})];
			const messages = errorResponse?.messages ?? [];
			const logEntries = backendMessagesToWorkflowLog(messages, "stage3").concat(
				frontendWorkflowFailureEvent("RESTORE_FAILED", summarizeBlockingErrors(blockingErrors, "请求失败。")),
			);
			setState((current) => completeWorkflowRequestState(current, "stage3", messages, blockingErrors, logEntries, {
				patch: { stage3Expired: false },
			}));
		} finally {
			setIsRestoring(false);
		}
	}

	function updateStage2Row(rowKey: string, updater: (row: Stage2Instance) => Stage2Instance) {
		setState((current) => updateStage2RowState(current, rowKey, updater));
	}

	function handleProxyNameChange(rowKey: string, proxyName: string) {
		setState((current) => updateStage2ProxyNameState(current, rowKey, proxyName));
	}

	function handleProxyNameBlur() {
		setState((current) => applyDuplicateProxyNameValidationState(current));
	}

	function handleCloneStage2Row(rowKey: string) {
		setState((current) => cloneStage2RowState(current, rowKey));
	}

	function canDeleteStage2Row(rowKey: string) {
		const matchedRow = findStage2RowByKey(stage2Rows, rowKey);
		return matchedRow !== null
			&& stage2Rows.filter((row) => row.sourceId === matchedRow.sourceId).length > 1;
	}

	function handleDeleteStage2Row(rowKey: string) {
		setState((current) => deleteStage2RowState(current, rowKey));
	}

	function handleModeChange(rowKey: string, mode: Stage2Row["mode"]) {
		updateStage2Row(rowKey, (row) => ({
			...row,
			mode,
			targetName: pickNextTarget(state.stage2Catalog, stage2Rows, getStage2RowKey(row), mode, row.targetName),
		}));
	}

	function handleTargetChange(rowKey: string, targetName: string) {
		const nextTargetName = targetName === "" ? null : targetName;
		updateStage2Row(rowKey, (row) => ({
			...row,
			targetName: nextTargetName,
		}));
	}

	function getServerAggregationGroupForRow(rowKey: string) {
		const matchedRow = findStage2RowByKey(stage2Rows, rowKey);
		if (matchedRow === null) return null;
		const server = matchedRow.serverKey;
		const group = getServerAggregationGroup(state.stage2Snapshot, server);
		return {
			server,
			groupName: group?.groupName?.trim() ?? "",
			enabled: group?.enabled ?? false,
			strategy: getServerAggregationStrategy(state.stage2Snapshot, server) ?? "fallback",
			memberChecked: (group?.memberLocalInstanceIds ?? []).includes(matchedRow.instanceId),
		};
	}

	function handleServerAggregationGroupNameChange(rowKey: string, groupName: string) {
		const group = getServerAggregationGroupForRow(rowKey);
		if (group === null) {
			return;
		}
		setState((current) => updateServerAggregationGroupNameState(current, group.server, groupName));
	}

	function getServerAggregationStrategyForRow(rowKey: string) {
		if (!canConfigureServerAggregationGroup(rowKey)) {
			return null;
		}
		const matchedRow = findStage2RowByKey(stage2Rows, rowKey);
		return matchedRow ? getServerAggregationStrategy(state.stage2Snapshot, matchedRow.serverKey) : null;
	}

	function canConfigureServerAggregationGroup(rowKey: string) {
		const matchedRow = findStage2RowByKey(stage2Rows, rowKey);
		return matchedRow !== null
			&& stage2Rows.filter((row) => row.serverKey === matchedRow.serverKey).length > 1;
	}

	function handleServerAggregationStrategyChange(rowKey: string, strategy: AggregationStrategy | null) {
		const matchedRow = findStage2RowByKey(stage2Rows, rowKey);
		if (matchedRow === null) return;
		const server = matchedRow.serverKey;
		if (strategy === null) {
			setState((current) => updateServerAggregationStrategyState(current, server, null));
			return;
		}
		const memberRowIDs = stage2Rows
			.filter((row) => row.serverKey === server)
			.map((row) => getStage2RowKey(row))
			.filter((rowID) => rowID !== "");
		setState((current) => {
			let next = current;
			for (const rowID of memberRowIDs) {
				next = updateServerAggregationGroupState(next, server, true, strategy, rowID, true);
			}
			return updateServerAggregationStrategyState(next, server, strategy);
		});
	}

	function handleServerAggregationChange(
		rowKey: string,
		payload: { enabled: boolean; strategy: AggregationStrategy; memberChecked: boolean },
	) {
		const matchedRow = findStage2RowByKey(stage2Rows, rowKey);
		const rowMeta = getStage2RowMeta(rowKey);
		if (matchedRow === null || rowMeta === null) {
			return;
		}
		const server = resolveServerAggregationServer(matchedRow, rowMeta);
		const rowID = getStage2RowKey(matchedRow);
		if (server === "" || rowID === "") {
			return;
		}
		setState((current) => {
			const withMember = updateServerAggregationGroupState(
				current,
				server,
				payload.enabled,
				payload.strategy,
				rowID,
				payload.memberChecked,
			);
			return updateServerAggregationStrategyState(withMember, server, payload.enabled ? payload.strategy : null);
		});
	}

	function handleServerAggregationEnableWithDefaults(
		rowKey: string,
		payload: { enabled: boolean; strategy: AggregationStrategy },
	) {
		const anchorGroup = getServerAggregationGroupForRow(rowKey);
		if (anchorGroup === null) {
			return;
		}
		if (!payload.enabled) {
			handleServerAggregationChange(rowKey, {
				enabled: false,
				strategy: payload.strategy,
				memberChecked: anchorGroup.memberChecked,
			});
			return;
		}

		const targetServer = anchorGroup.server;
		const memberRows = stage2Rows.filter((row) => row.serverKey === targetServer);
		const shouldAutoSelectByMode = memberRows.length >= 2;

		setState((current) => {
			let next = current;
			for (const row of memberRows) {
				const rowKey = getStage2RowKey(row);
				if (rowKey === "") {
					continue;
				}
				const matchedRow = findStage2RowByKey(flattenInstances(current.stage2Snapshot), rowKey);
				if (matchedRow === null) continue;
				const server = matchedRow.serverKey;
				const rowID = getStage2RowKey(matchedRow);
				if (server === "" || rowID === "") {
					continue;
				}
				const group = getServerAggregationGroup(next.stage2Snapshot, server);
				const currentChecked = rowID !== "" && (group?.memberLocalInstanceIds ?? []).includes(rowID);
				const defaultChecked = shouldAutoSelectByMode && row.mode !== "none";
				next = updateServerAggregationGroupState(
					next,
					server,
					true,
					payload.strategy,
					rowID,
					currentChecked || defaultChecked,
				);
			}
			return updateServerAggregationStrategyState(next, targetServer, payload.strategy);
		});
	}

	function getServerAggregationOrderedMembersForRow(rowKey: string) {
		const anchorGroup = getServerAggregationGroupForRow(rowKey);
		if (anchorGroup === null) {
			return [];
		}
		const group = getServerAggregationGroup(state.stage2Snapshot, anchorGroup.server);
		if (group === null) {
			return [];
		}
		const rowsByID = new Map(stage2Rows.map((row) => [row.instanceId, row] as const));
		return (group.memberLocalInstanceIds ?? [])
			.map((rowID) => {
				const row = rowsByID.get(rowID.trim());
				if (row === undefined) {
					return null;
				}
				return {
					instanceId: rowID.trim(),
					displayName: getStage2RowDisplayName(row),
					isDefaultInstance: row.instanceIndex === 0,
				};
			})
			.filter((member): member is { instanceId: string; displayName: string; isDefaultInstance: boolean } => member !== null);
	}

	function handleServerAggregationMemberReorder(
		rowKey: string,
		memberInstanceId: string,
		direction: "up" | "down",
	) {
		const anchorGroup = getServerAggregationGroupForRow(rowKey);
		if (anchorGroup === null) {
			return;
		}
		setState((current) =>
			reorderServerAggregationMemberState(current, anchorGroup.server, memberInstanceId, direction),
		);
	}

	function handleServerAggregationMemberMoveTo(
		rowKey: string,
		memberInstanceId: string,
		toIndex: number,
	) {
		const anchorGroup = getServerAggregationGroupForRow(rowKey);
		if (anchorGroup === null) {
			return;
		}
		setState((current) =>
			moveServerAggregationMemberToIndexState(current, anchorGroup.server, memberInstanceId, toIndex),
		);
	}

	function handleSwitchOptimizationChange(enabled: boolean) {
		setState((current) => applySwitchOptimizationState(current, enabled));
	}

	function handleClearServerAggregationGroups() {
		setState((current) => clearServerAggregationGroupsState(current));
	}

	async function handleStage2Reset() {
		if (!isStage2Editable || isResettingStage2) {
			return;
		}

		const stage1Input = state.stage1Input;
		setIsResettingStage2(true);
		setState((current) => startWorkflowRequestState(current, "stage2", workflowActionSeparator("ACTION_STAGE2_RESET")));

		try {
			const response = await postStage1Convert({ stage1Input: toStage1InputPayload(stage1Input) });
			const logEntries = backendMessagesToWorkflowLog(response.messages, "stage2");
			setState((current) => applyStage1ConvertSuccessState(
				current,
				response.stage2,
				response.messages,
				response.blockingErrors,
				logEntries,
				true,
			));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			const blockingErrors = errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
				stageLabel: "Stage 2 / 配置区",
				actionLabel: "重置",
				requestPath: "POST /api/stage1/convert",
			})];
			const messages = errorResponse?.messages ?? [];
			const logEntries = backendMessagesToWorkflowLog(messages, "stage2").concat(
				frontendWorkflowFailureEvent("STAGE2_RESET_FAILED", summarizeBlockingErrors(blockingErrors, "请求失败。")),
			);
			setState((current) => completeWorkflowRequestState(current, "stage2", messages, blockingErrors, logEntries));
		} finally {
			setIsResettingStage2(false);
		}
	}

	async function handleGenerate() {
		const stage1Input = state.stage1Input;
		const stage2Snapshot = state.stage2Snapshot;
		const preferShortUrl = state.preferShortUrl;
		const precheckBlockingErrors = collectGeneratePrecheckBlockingErrors(stage2Snapshot, state.stage2Catalog);
		if (precheckBlockingErrors.length > 0) {
			setState((current) => completeWorkflowRequestState(
				current,
				"stage2",
				[],
				precheckBlockingErrors,
				[
					workflowActionSeparator("ACTION_GENERATE"),
					frontendWorkflowFailureEvent("GENERATE_FAILED", summarizeBlockingErrors(precheckBlockingErrors, "生成链接前校验未通过。")),
				],
			));
			return;
		}

		setIsGenerating(true);
		setState((current) => startWorkflowRequestState(current, "stage2", workflowActionSeparator("ACTION_GENERATE")));

		try {
			const response = await postGenerate({
				stage1Input: toStage1InputPayload(stage1Input),
				stage2: {
					snapshot: normalizeSnapshotForRequest(stage2Snapshot),
				},
			});
			const forceShortUrl = exceedsPublicLongURLBudget(response.longUrl, maxPublicLongURLLength);
			if (!preferShortUrl && !forceShortUrl) {
				const logEntries = backendMessagesToWorkflowLog(response.messages, "stage2");
				setState((current) => applyGenerateLongURLSuccessState(current, {
					blockingErrors: response.blockingErrors,
					logEntries,
					messages: response.messages,
					resolvedLongURL: response.longUrl,
				}));
				return;
			}

			setIsCreatingShortUrl(true);
			try {
				const shortLinkResponse = await postShortLink(response.longUrl);
				const mergedMessages = mergeMessages(response.messages, shortLinkResponse.messages);
				const logEntries = backendMessagesToWorkflowLog(mergedMessages, "stage2").concat(
					forceShortUrl
						? [buildWorkflowLogEntry("warning", "SHORT_URL_REQUIRED", "长链接超过公开长度上限，已自动切换为短链接。", "frontend", "stage2")]
						: [],
				);
				setState((current) => applyGenerateShortURLSuccessState(current, {
					blockingErrors: shortLinkResponse.blockingErrors,
					logEntries,
					messages: mergedMessages,
					preferShortURL: preferShortUrl || forceShortUrl,
					resolvedLongURL: shortLinkResponse.longUrl,
					resolvedShortURL: shortLinkResponse.shortUrl,
				}));
			} catch (error) {
				const errorResponse = getErrorResponse(error);
				const blockingErrors = errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
					stageLabel: "Stage 3 / 输出区",
					actionLabel: "创建短链接",
					requestPath: "POST /api/short-links",
				})];
				const mergedMessages = mergeMessages(response.messages, errorResponse?.messages ?? []);
				const logEntries = backendMessagesToWorkflowLog(mergedMessages, "stage3").concat(
					frontendWorkflowFailureEvent(
						forceShortUrl ? "SHORT_URL_REQUIRED_FAILED" : "SHORT_URL_FAILED",
						summarizeBlockingErrors(blockingErrors, "请求失败。"),
					),
				);
				setState((current) => applyGenerateShortURLFailureState(current, {
					blockingErrors,
					logEntries,
					messages: mergedMessages,
					requireShortURL: forceShortUrl,
					resolvedLongURL: response.longUrl,
				}));
			} finally {
				setIsCreatingShortUrl(false);
			}
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			const blockingErrors = errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
				stageLabel: "Stage 2 / 配置区",
				actionLabel: "生成链接",
				requestPath: "POST /api/generate",
			})];
			const messages = errorResponse?.messages ?? [];
			const logEntries = backendMessagesToWorkflowLog(messages, "stage2").concat(
				frontendWorkflowFailureEvent("GENERATE_FAILED", summarizeBlockingErrors(blockingErrors, "请求失败。")),
			);
			setState((current) => completeWorkflowRequestState(current, "stage2", messages, blockingErrors, logEntries));
		} finally {
			setIsGenerating(false);
		}
	}

	async function handlePreferShortUrl(checked: boolean) {
		const requireShortURL = Boolean(state.generatedUrls && exceedsPublicLongURLBudget(state.generatedUrls.longUrl, maxPublicLongURLLength));
		setState((current) => applyShortURLPreferenceToggleState(current, checked, {
			requireShortURL,
			requiredLogEntry: requireShortURL ? frontendWorkflowEvent("SHORT_URL_REQUIRED") : undefined,
		}));
		if (!checked || state.generatedUrls === null || state.generatedUrls.shortUrl) {
			return;
		}
		const longURL = state.generatedUrls.longUrl;

		setIsCreatingShortUrl(true);
		setState((current) => startShortURLCreationState(current, workflowActionSeparator("ACTION_SHORT_URL")));

		try {
			const response = await postShortLink(longURL);
			const logEntries = backendMessagesToWorkflowLog(response.messages, "stage3");
			setState((current) => applyShortURLCreationSuccessState(current, {
				blockingErrors: response.blockingErrors,
				logEntries,
				messages: response.messages,
				resolvedLongURL: response.longUrl,
				resolvedShortURL: response.shortUrl,
			}));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			const blockingErrors = errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
				stageLabel: "Stage 3 / 输出区",
				actionLabel: "创建短链接",
				requestPath: "POST /api/short-links",
			})];
			const messages = errorResponse?.messages ?? [];
			const logEntries = backendMessagesToWorkflowLog(messages, "stage3").concat(
				frontendWorkflowFailureEvent("SHORT_URL_FAILED", summarizeBlockingErrors(blockingErrors, "请求失败。")),
			);
			setState((current) => applyShortURLCreationFailureState(current, {
				blockingErrors,
				logEntries,
				messages,
				resolvedLongURL: longURL,
			}));
		} finally {
			setIsCreatingShortUrl(false);
		}
	}

	const workflow: AppWorkflowViewModel = {
		state,
		stage2Rows,
		modeOptions,
		responseOriginStage: state.responseOriginStage,
		originStageLabel,
		visibleMessages,
		workflowLog,
		shouldShowStage2StaleNotice,
		isConverting,
		isRestoring,
		isGenerating,
		isResettingStage2,
		isCreatingShortUrl,
		isConflictReadonly,
		isStage2Editable,
		canGenerate,
		stage1Status,
		stage2Status,
		stage3Status,
		applyDefaultTemplateURL,
		setCurrentLinkInput,
		reportCurrentLinkInputError,
		updateStage1Input,
		getStage1FieldErrors,
		getStage3FieldErrors: getStage3FieldErrorsForField,
		getStage2RowMeta,
		getStage2RowErrors,
		getPrimaryBlockingErrorsForStage: getPrimaryBlockingErrors,
		getStageMessages,
		getChainTargetChoiceGroups: () => getChainTargetChoiceGroups(state.stage2Catalog),
		getForwardRelayChoices: (rowKey: string) => getForwardRelayChoices(state.stage2Catalog, stage2Rows, rowKey),
		getServerAggregationStrategy: getServerAggregationStrategyForRow,
		canConfigureServerAggregationGroup,
		getServerAggregationGroup: getServerAggregationGroupForRow,
		handleServerAggregationGroupNameChange,
		getServerAggregationOrderedMembers: getServerAggregationOrderedMembersForRow,
		handleStage1Convert,
		handleStage1Reset,
		isStage1AtInitial,
		handleRestore,
		handleProxyNameChange,
		handleProxyNameBlur,
		handleCloneStage2Row,
		handleDeleteStage2Row,
		canDeleteStage2Row,
		handleModeChange,
		handleTargetChange,
		handleServerAggregationStrategyChange,
		handleServerAggregationChange,
		handleServerAggregationEnableWithDefaults,
		handleServerAggregationMemberReorder,
		handleServerAggregationMemberMoveTo,
		handleSwitchOptimizationChange,
		handleClearServerAggregationGroups,
		handleStage2Reset,
		handleGenerate,
		handlePreferShortUrl,
		recordWorkflowEvent,
	};

	return workflow;
}