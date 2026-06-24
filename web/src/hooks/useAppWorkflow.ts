import { useRef, useState } from "react";

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
	getServerAggregationGroup,
	getServerAggregationStrategy,
	getChainTargetChoiceGroups,
	getForwardRelayChoices,
	getStage2RowDisplayName,
	getStage2RowKey,
	getStage2RowSourceLandingName,
	isStage2SourceRow,
	isChainProxyGroupProfileEligible,
	matchesStage2RowKey,
	pickNextTarget,
} from "../lib/stage2";
import { hydrateStage1Input, initialAppState, toStage1InputPayload } from "../lib/state";
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
import type { BlockingError, ChainProxyGroupProfile, Message, Stage1Input, Stage2Init, Stage2Row } from "../types/api";
import type { APIRequestError } from "../lib/api";
import type { ChainTargetChoiceGroup, TargetChoice } from "../lib/stage2";
import {
	applyGenerateLongURLSuccessState,
	applyGenerateShortURLFailureState,
	applyGenerateShortURLSuccessState,
	applyRestoreConflictState,
	applyRestoreReinitializedState,
	applyRestoreReinitFailedState,
	applyShortURLCreationFailureState,
	applyShortURLCreationSuccessState,
	applyShortURLPreferenceToggleState,
	applyStage1ConvertSuccessState,
	cloneStage2RowState,
	clearServerAggregationGroupsState,
	completeWorkflowRequestState,
	deleteStage2RowState,
	reportCurrentLinkInputErrorState,
	moveServerAggregationMemberToIndexState,
	reorderServerAggregationMemberState,
	setCurrentLinkInputState,
	startShortURLCreationState,
	startWorkflowRequestState,
	updateServerAggregationGroupState,
	updateServerAggregationStrategyState,
	updateStage1InputState,
	applyGlobalChainProxyGroupProfileState,
	updateStage2RowState,
} from "./useAppWorkflow.state";

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

type Stage2SnapshotRows = typeof initialAppState.stage2Snapshot.rows;

export interface AppWorkflowViewModel {
	state: typeof initialAppState;
	stage2Rows: typeof initialAppState.stage2Snapshot.rows;
	modeOptions: Stage2Init["availableModes"];
	responseOriginStage: ResponseOriginStage | null;
	originStageLabel?: string;
	visibleMessages: Message[];
	workflowLog: WorkflowLogEntry[];
	shouldShowStage2StaleNotice: boolean;
	isConverting: boolean;
	isRestoring: boolean;
	isGenerating: boolean;
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
	getStage2RowMeta: (landingNodeName: string) => Stage2Init["rows"][number] | null;
	getStage2RowErrors: (landingNodeName: string) => BlockingError[];
	getPrimaryBlockingErrorsForStage: (stage: ResponseOriginStage) => BlockingError[];
	getStageMessages: (stage: ResponseOriginStage) => Message[];
	getChainTargetChoiceGroups: () => ChainTargetChoiceGroup[];
	getForwardRelayChoices: (landingNodeName: string) => TargetChoice[];
	getServerAggregationStrategy: (landingNodeName: string) => "fallback" | "url-test" | null;
	canConfigureServerAggregationGroup: (landingNodeName: string) => boolean;
	getServerAggregationGroup: (landingNodeName: string) => { server: string; enabled: boolean; strategy: "fallback" | "url-test"; memberChecked: boolean } | null;
	getServerAggregationOrderedMembers: (
		landingNodeName: string,
	) => Array<{ rowId: string; displayName: string; isSource: boolean }>;
	handleStage1Convert: () => Promise<void>;
	handleRestore: () => Promise<void>;
	handleProxyNameChange: (landingNodeName: string, proxyName: string) => void;
	handleCloneStage2Row: (landingNodeName: string) => void;
	handleDeleteStage2Row: (landingNodeName: string) => void;
	canDeleteStage2Row: (landingNodeName: string) => boolean;
	handleModeChange: (landingNodeName: string, mode: Stage2Row["mode"]) => void;
	handleTargetChange: (landingNodeName: string, targetName: string) => void;
	handleServerAggregationStrategyChange: (landingNodeName: string, strategy: "fallback" | "url-test" | null) => void;
	handleServerAggregationChange: (landingNodeName: string, payload: { enabled: boolean; strategy: "fallback" | "url-test"; memberChecked: boolean }) => void;
	handleServerAggregationEnableWithDefaults: (landingNodeName: string, payload: { enabled: boolean; strategy: "fallback" | "url-test" }) => void;
	handleServerAggregationMemberReorder: (
		landingNodeName: string,
		memberRowId: string,
		direction: "up" | "down",
	) => void;
	handleServerAggregationMemberMoveTo: (
		landingNodeName: string,
		memberRowId: string,
		toIndex: number,
	) => void;
	handleChainProxyGroupProfileChange: (landingNodeName: string, profile: ChainProxyGroupProfile | "") => void;
	handleGlobalChainProxyGroupProfileChange: (enabled: boolean) => void;
	handleClearServerAggregationGroups: () => void;
	handleGenerate: () => Promise<void>;
	handlePreferShortUrl: (checked: boolean) => Promise<void>;
	recordWorkflowEvent: (code: WorkflowEventCode, originStage?: ResponseOriginStage | null) => void;
}

function normalizeChainProxyGroupProfileValue(profile: Stage2Row["chainProxyGroupProfile"] | "") {
	return profile ?? "";
}

function sanitizeChainProxyGroupProfile(
	stage2Init: Stage2Init | null,
	row: Stage2Row,
	nextMode: Stage2Row["mode"],
	nextTargetName: string | null,
) {
	const nextRow: Stage2Row = {
		...row,
		mode: nextMode,
		targetName: nextTargetName,
	};
	if (!isChainProxyGroupProfileEligible(stage2Init, nextRow)) {
		return undefined;
	}
	const currentProfile = normalizeChainProxyGroupProfileValue(row.chainProxyGroupProfile);
	return currentProfile === "" ? undefined : currentProfile;
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

function getModeOptions(stage2Init: Stage2Init | null) {
	return stage2Init?.availableModes ?? [];
}

function getSelectableChoices(stage2Init: Stage2Init | null, stage2Rows: Stage2SnapshotRows, landingNodeName: string, mode: Stage2Row["mode"]) {
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

function collectGeneratePrecheckBlockingErrors(stage2Snapshot: typeof initialAppState.stage2Snapshot): BlockingError[] {
	const rowsByID = new Map(
		stage2Snapshot.rows.map((row) => [(row.rowId ?? "").trim(), row] as const).filter(([rowID]) => rowID !== ""),
	);
	const errors: BlockingError[] = [];
	const orderedAggregationGroups = [...stage2Snapshot.serverAggregationGroups].sort((left, right) =>
		left.server.trim().localeCompare(right.server.trim()),
	);

	for (const group of orderedAggregationGroups) {
		if (!group.enabled) {
			continue;
		}
		const server = group.server.trim();
		const memberRowIDs = Array.from(new Set((group.memberRowIds ?? []).map((rowID) => rowID.trim()).filter(Boolean)));
		if (memberRowIDs.length >= 2) {
			continue;
		}

		const singleMember = memberRowIDs[0];
		const singleMemberRow = singleMember ? rowsByID.get(singleMember) : undefined;
		const serverLabel = server === "" ? "--" : server;
		errors.push({
			code: "SERVER_AGGREGATION_GROUP_TOO_SMALL",
			message: `聚合/策略组（${serverLabel}）至少需要入组 2 个成员，当前为 ${memberRowIDs.length} 个。`,
			scope: "stage2_row",
			context: {
				server,
				rowId: singleMember ?? "",
				landingNodeName: singleMemberRow?.landingNodeName ?? "",
				sourceLandingNodeName: singleMemberRow?.sourceLandingNodeName ?? "",
			},
		});
	}

	return errors;
}

function resolveServerAggregationServer(
	row: Stage2Row,
	rowMeta: Stage2Init["rows"][number] | null,
): string {
	if (rowMeta === null) {
		return "";
	}
	const sourceLandingNodeName = getStage2RowSourceLandingName(row);
	return (rowMeta.server?.trim() ?? "") || `source:${sourceLandingNodeName}`;
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

	if (current.landingRawText !== next.landingRawText) {
		changedFields.add("landingRawText");
	}
	if (current.transitRawText !== next.transitRawText) {
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
	const [isCreatingShortUrl, setIsCreatingShortUrl] = useState(false);
	const stage2DerivedRowSequenceRef = useRef(0);

	const stage2Rows = state.stage2Snapshot.rows;
	const modeOptions = getModeOptions(state.stage2Init);
	const isConflictReadonly = state.restoreStatus === "conflicted";
	const isStage2Editable = state.stage2Init !== null && !state.stage2Stale && !isConflictReadonly;
	const canGenerate = stage2Rows.length > 0 && !state.stage2Stale && !isConflictReadonly && !isGenerating;
	const originStageLabel = getOriginStageLabel(state.responseOriginStage);
	const visibleMessages = getVisibleMessages(state.messages, state.responseOriginStage);
	const workflowLog = state.workflowLog;
	const shouldShowStage2StaleNotice = shouldPromoteStage2StaleNotice({
		stage2Stale: state.stage2Stale,
		hasStage2Rows: stage2Rows.length > 0,
		hasBlockingErrors: state.blockingErrors.length > 0,
		isRequestInFlight: isConverting,
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

	function nextStage2DerivedRowID(sourceLandingNodeName: string) {
		stage2DerivedRowSequenceRef.current += 1;
		const normalizedSource = sourceLandingNodeName.trim().replace(/\s+/g, "-").replace(/[^\w\u0080-\uFFFF-]/g, "").slice(0, 32);
		const sourcePrefix = normalizedSource === "" ? "stage2-row" : normalizedSource;
		const randomPart = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? `${Date.now()}-${stage2DerivedRowSequenceRef.current}`;
		return `${sourcePrefix}-${randomPart}`;
	}

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

	function getStage1FieldErrors(field: string) {
		return getFieldErrors(state.blockingErrors, field);
	}

	function getStage3FieldErrorsForField(field: string) {
		return getStage3FieldErrors(state.blockingErrors, field);
	}

	function getStage2RowMeta(landingNodeName: string) {
		const snapshotRow = findStage2RowByKey(state.stage2Snapshot.rows, landingNodeName);
		const sourceLandingNodeName = snapshotRow ? getStage2RowSourceLandingName(snapshotRow) : landingNodeName;
		return state.stage2Init?.rows.find((row) => matchesStage2RowKey(row, sourceLandingNodeName)) ?? null;
	}

	function getStage2RowErrors(landingNodeName: string) {
		if (!isStage2Editable) {
			return [];
		}
		const row = findStage2RowByKey(state.stage2Snapshot.rows, landingNodeName);
		return row ? getRowErrors(state.blockingErrors, row) : getRowErrors(state.blockingErrors, landingNodeName);
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
			const logEntries = backendMessagesToWorkflowLog(response.messages, "stage1");
			setState((current) => applyStage1ConvertSuccessState(
				current,
				response.stage2Init,
				response.messages,
				response.blockingErrors,
				logEntries,
			));
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
					restoreStatus: restoreResponse.restoreStatus,
					resolvedLongUrl: restoreResponse.longUrl,
					resolvedShortUrl: restoreResponse.shortUrl,
					stage2Snapshot: restoreResponse.stage2Snapshot,
				}));
				return;
			}

			try {
				const convertResponse = await postStage1Convert({ stage1Input: restoreResponse.stage1Input });
				const logEntries = backendMessagesToWorkflowLog(restoreResponse.messages, "stage3");
				setState((current) => applyRestoreReinitializedState(current, convertResponse.stage2Init, {
					blockingErrors: restoreResponse.blockingErrors.length > 0 ? restoreResponse.blockingErrors : convertResponse.blockingErrors,
					logEntries,
					messages: restoreResponse.messages,
					restoredStage1Input,
					restoreStatus: restoreResponse.restoreStatus,
					resolvedLongUrl: restoreResponse.longUrl,
					resolvedShortUrl: restoreResponse.shortUrl,
					stage2Snapshot: restoreResponse.stage2Snapshot,
				}));
			} catch (convertError) {
				const errorResponse = getErrorResponse(convertError);
				const blockingErrors = errorResponse?.blockingErrors ?? [fallbackBlockingError(convertError, {
					stageLabel: "Stage 3 / 输出区",
					actionLabel: "恢复后的转换并自动填充",
					requestPath: "POST /api/stage1/convert",
				})];
				const logEntries = backendMessagesToWorkflowLog(restoreResponse.messages, "stage3").concat(
					frontendWorkflowFailureEvent("RESTORE_REINIT_FAILED", summarizeBlockingErrors(blockingErrors, "请求失败。")),
				);
				setState((current) => applyRestoreReinitFailedState(current, {
					blockingErrors,
					logEntries,
					messages: restoreResponse.messages,
					restoredStage1Input,
					restoreStatus: restoreResponse.restoreStatus,
					resolvedLongUrl: restoreResponse.longUrl,
					resolvedShortUrl: restoreResponse.shortUrl,
					stage2Snapshot: restoreResponse.stage2Snapshot,
				}));
			}
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

	function updateStage2Row(landingNodeName: string, updater: (row: Stage2Row) => Stage2Row) {
		setState((current) => updateStage2RowState(current, landingNodeName, updater));
	}

	function handleProxyNameChange(landingNodeName: string, proxyName: string) {
		updateStage2Row(landingNodeName, (row) => ({
			...row,
			proxyName,
			landingNodeName: proxyName,
		}));
	}

	function handleCloneStage2Row(landingNodeName: string) {
		setState((current) => {
			const matchedRow = findStage2RowByKey(current.stage2Snapshot.rows, landingNodeName);
			if (matchedRow === null) {
				return current;
			}
			const sourceLandingNodeName = getStage2RowSourceLandingName(matchedRow);
			return cloneStage2RowState(current, landingNodeName, nextStage2DerivedRowID(sourceLandingNodeName));
		});
	}

	function canDeleteStage2Row(landingNodeName: string) {
		const matchedRow = findStage2RowByKey(state.stage2Snapshot.rows, landingNodeName);
		if (matchedRow === null) {
			return false;
		}
		const sourceLandingNodeName = getStage2RowSourceLandingName(matchedRow);
		return state.stage2Snapshot.rows.filter((row) => getStage2RowSourceLandingName(row) === sourceLandingNodeName).length > 1;
	}

	function handleDeleteStage2Row(landingNodeName: string) {
		setState((current) => deleteStage2RowState(current, landingNodeName));
	}

	function handleModeChange(landingNodeName: string, mode: Stage2Row["mode"]) {
		updateStage2Row(landingNodeName, (row) => ({
			...row,
			mode,
			targetName: pickNextTarget(state.stage2Init, state.stage2Snapshot.rows, getStage2RowKey(row), mode, row.targetName),
			chainProxyGroupProfile: sanitizeChainProxyGroupProfile(
				state.stage2Init,
				row,
				mode,
				pickNextTarget(state.stage2Init, state.stage2Snapshot.rows, getStage2RowKey(row), mode, row.targetName),
			),
		}));
	}

	function handleTargetChange(landingNodeName: string, targetName: string) {
		const nextTargetName = targetName === "" ? null : targetName;
		updateStage2Row(landingNodeName, (row) => ({
			...row,
			targetName: nextTargetName,
			chainProxyGroupProfile: sanitizeChainProxyGroupProfile(state.stage2Init, row, row.mode, nextTargetName),
		}));
	}

	function getServerAggregationGroupForRow(landingNodeName: string) {
		const matchedRow = findStage2RowByKey(state.stage2Snapshot.rows, landingNodeName);
		if (matchedRow === null) {
			return null;
		}
		const rowMeta = getStage2RowMeta(landingNodeName);
		const sourceLandingNodeName = getStage2RowSourceLandingName(matchedRow);
		const server = (rowMeta?.server?.trim() ?? "") || `source:${sourceLandingNodeName}`;
		if (server === "") {
			return null;
		}
		const rowID = (matchedRow.rowId?.trim() ?? "") || getStage2RowKey(matchedRow);
		const group = getServerAggregationGroup(state.stage2Snapshot, server);
		return {
			server,
			enabled: group?.enabled ?? false,
			strategy: getServerAggregationStrategy(state.stage2Snapshot, server) ?? "fallback",
			memberChecked: rowID !== "" && (group?.memberRowIds ?? []).includes(rowID),
		};
	}

	function getServerAggregationStrategyForRow(landingNodeName: string) {
		if (!canConfigureServerAggregationGroup(landingNodeName)) {
			return null;
		}
		const matchedRow = findStage2RowByKey(state.stage2Snapshot.rows, landingNodeName);
		if (matchedRow === null) {
			return null;
		}
		const rowMeta = getStage2RowMeta(landingNodeName);
		const sourceLandingNodeName = getStage2RowSourceLandingName(matchedRow);
		const server = (rowMeta?.server?.trim() ?? "") || `source:${sourceLandingNodeName}`;
		return getServerAggregationStrategy(state.stage2Snapshot, server);
	}

	function canConfigureServerAggregationGroup(landingNodeName: string) {
		const matchedRow = findStage2RowByKey(state.stage2Snapshot.rows, landingNodeName);
		if (matchedRow === null) {
			return false;
		}
		const rowMeta = getStage2RowMeta(landingNodeName);
		const sourceLandingNodeName = getStage2RowSourceLandingName(matchedRow);
		const server = rowMeta?.server?.trim() ?? "";
		let count = 0;
		for (const row of state.stage2Snapshot.rows) {
			if (server === "") {
				if (getStage2RowSourceLandingName(row) === sourceLandingNodeName) {
					count += 1;
				}
				continue;
			}
			const rowKey = getStage2RowKey(row);
			if ((getStage2RowMeta(rowKey)?.server?.trim() ?? "") === server) {
				count += 1;
			}
		}
		return count > 1;
	}

	function handleServerAggregationStrategyChange(landingNodeName: string, strategy: "fallback" | "url-test" | null) {
		const matchedRow = findStage2RowByKey(state.stage2Snapshot.rows, landingNodeName);
		if (matchedRow === null) {
			return;
		}
		const rowMeta = getStage2RowMeta(landingNodeName);
		const sourceLandingNodeName = getStage2RowSourceLandingName(matchedRow);
		const server = (rowMeta?.server?.trim() ?? "") || `source:${sourceLandingNodeName}`;
		if (strategy === null) {
			setState((current) => updateServerAggregationStrategyState(current, server, null));
			return;
		}
		const memberRowIDs = state.stage2Snapshot.rows
			.filter((row) => {
				if ((rowMeta?.server?.trim() ?? "") === "") {
					return getStage2RowSourceLandingName(row) === sourceLandingNodeName;
				}
				const rowKey = getStage2RowKey(row);
				return (getStage2RowMeta(rowKey)?.server?.trim() ?? "") === rowMeta?.server?.trim();
			})
			.map((row) => (row.rowId?.trim() ?? "") || getStage2RowKey(row))
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
		landingNodeName: string,
		payload: { enabled: boolean; strategy: "fallback" | "url-test"; memberChecked: boolean },
	) {
		const matchedRow = findStage2RowByKey(state.stage2Snapshot.rows, landingNodeName);
		const rowMeta = getStage2RowMeta(landingNodeName);
		if (matchedRow === null || rowMeta === null) {
			return;
		}
		const server = resolveServerAggregationServer(matchedRow, rowMeta);
		const rowID = (matchedRow.rowId?.trim() ?? "") || getStage2RowKey(matchedRow);
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

	function getStage2RowMetaFromState(current: typeof state, landingNodeName: string) {
		const snapshotRow = findStage2RowByKey(current.stage2Snapshot.rows, landingNodeName);
		const sourceLandingNodeName = snapshotRow ? getStage2RowSourceLandingName(snapshotRow) : landingNodeName;
		return current.stage2Init?.rows.find((row) => matchesStage2RowKey(row, sourceLandingNodeName)) ?? null;
	}

	function handleServerAggregationEnableWithDefaults(
		landingNodeName: string,
		payload: { enabled: boolean; strategy: "fallback" | "url-test" },
	) {
		const anchorGroup = getServerAggregationGroupForRow(landingNodeName);
		if (anchorGroup === null) {
			return;
		}
		if (!payload.enabled) {
			handleServerAggregationChange(landingNodeName, {
				enabled: false,
				strategy: payload.strategy,
				memberChecked: anchorGroup.memberChecked,
			});
			return;
		}

		const targetServer = anchorGroup.server;
		const memberRows = state.stage2Snapshot.rows.filter((row) => {
			const rowKey = getStage2RowKey(row);
			if (rowKey === "") {
				return false;
			}
			return getServerAggregationGroupForRow(rowKey)?.server === targetServer;
		});
		const shouldAutoSelectByMode = memberRows.length >= 2;

		setState((current) => {
			let next = current;
			for (const row of memberRows) {
				const rowKey = getStage2RowKey(row);
				if (rowKey === "") {
					continue;
				}
				const matchedRow = findStage2RowByKey(current.stage2Snapshot.rows, rowKey);
				const rowMeta = getStage2RowMetaFromState(current, rowKey);
				if (matchedRow === null || rowMeta === null) {
					continue;
				}
				const server = resolveServerAggregationServer(matchedRow, rowMeta);
				const rowID = (matchedRow.rowId?.trim() ?? "") || rowKey;
				if (server === "" || rowID === "") {
					continue;
				}
				const group = getServerAggregationGroup(next.stage2Snapshot, server);
				const currentChecked = rowID !== "" && (group?.memberRowIds ?? []).includes(rowID);
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

	function getServerAggregationOrderedMembersForRow(landingNodeName: string) {
		const anchorGroup = getServerAggregationGroupForRow(landingNodeName);
		if (anchorGroup === null) {
			return [];
		}
		const group = getServerAggregationGroup(state.stage2Snapshot, anchorGroup.server);
		if (group === null) {
			return [];
		}
		const rowsByID = new Map(
			state.stage2Snapshot.rows
				.map((row) => {
					const rowID = (row.rowId?.trim() ?? "") || getStage2RowKey(row);
					return rowID === "" ? null : ([rowID, row] as const);
				})
				.filter((entry): entry is readonly [string, Stage2Row] => entry !== null),
		);
		return group.memberRowIds
			.map((rowID) => {
				const row = rowsByID.get(rowID.trim());
				if (row === undefined) {
					return null;
				}
				return {
					rowId: rowID.trim(),
					displayName: getStage2RowDisplayName(row),
					isSource: isStage2SourceRow(row),
				};
			})
			.filter((member): member is { rowId: string; displayName: string; isSource: boolean } => member !== null);
	}

	function handleServerAggregationMemberReorder(
		landingNodeName: string,
		memberRowId: string,
		direction: "up" | "down",
	) {
		const anchorGroup = getServerAggregationGroupForRow(landingNodeName);
		if (anchorGroup === null) {
			return;
		}
		setState((current) =>
			reorderServerAggregationMemberState(current, anchorGroup.server, memberRowId, direction),
		);
	}

	function handleServerAggregationMemberMoveTo(
		landingNodeName: string,
		memberRowId: string,
		toIndex: number,
	) {
		const anchorGroup = getServerAggregationGroupForRow(landingNodeName);
		if (anchorGroup === null) {
			return;
		}
		setState((current) =>
			moveServerAggregationMemberToIndexState(current, anchorGroup.server, memberRowId, toIndex),
		);
	}

	function handleChainProxyGroupProfileChange(landingNodeName: string, profile: ChainProxyGroupProfile | "") {
		updateStage2Row(landingNodeName, (row) => ({
			...row,
			chainProxyGroupProfile: profile === "" ? undefined : profile,
		}));
	}

	function handleGlobalChainProxyGroupProfileChange(enabled: boolean) {
		setState((current) => applyGlobalChainProxyGroupProfileState(
			current,
			enabled,
			(row) => isChainProxyGroupProfileEligible(current.stage2Init, row),
		));
	}

	function handleClearServerAggregationGroups() {
		setState((current) => clearServerAggregationGroupsState(current));
	}

	async function handleGenerate() {
		const stage1Input = state.stage1Input;
		const stage2Snapshot = state.stage2Snapshot;
		const preferShortUrl = state.preferShortUrl;
		const precheckBlockingErrors = collectGeneratePrecheckBlockingErrors(stage2Snapshot);
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
				stage2Snapshot,
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
		getChainTargetChoiceGroups: () => getChainTargetChoiceGroups(state.stage2Init),
		getForwardRelayChoices: (landingNodeName: string) => getForwardRelayChoices(state.stage2Init, state.stage2Snapshot.rows, landingNodeName),
		getServerAggregationStrategy: getServerAggregationStrategyForRow,
		canConfigureServerAggregationGroup,
		getServerAggregationGroup: getServerAggregationGroupForRow,
		getServerAggregationOrderedMembers: getServerAggregationOrderedMembersForRow,
		handleStage1Convert,
		handleRestore,
		handleProxyNameChange,
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
		handleChainProxyGroupProfileChange,
		handleGlobalChainProxyGroupProfileChange,
		handleClearServerAggregationGroups,
		handleGenerate,
		handlePreferShortUrl,
		recordWorkflowEvent,
	};

	return workflow;
}