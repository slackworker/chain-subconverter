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
	getChainTargetChoiceGroups,
	getForwardRelayChoices,
	getStage2RowKey,
	getStage2RowSourceLandingName,
	matchesStage2RowKey,
	pickNextDerivedProxyName,
	pickNextTarget,
} from "../lib/stage2";
import { hydrateStage1Input, initialAppState, toStage1InputPayload } from "../lib/state";
import type { ResponseOriginStage, WorkflowLogEntry, WorkflowLogLevel } from "../lib/state";
import type { BlockingError, Message, Stage1Input, Stage2Init, Stage2Row } from "../types/api";
import type { APIRequestError } from "../lib/api";
import type { ChainTargetChoiceGroup, TargetChoice } from "../lib/stage2";

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

type Stage2SnapshotRow = typeof initialAppState.stage2Snapshot.rows[number];
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
	handleStage1Convert: () => Promise<void>;
	handleRestore: () => Promise<void>;
	handleProxyNameChange: (landingNodeName: string, proxyName: string) => void;
	handleCloneStage2Row: (landingNodeName: string) => void;
	handleDeleteStage2Row: (landingNodeName: string) => void;
	canDeleteStage2Row: (landingNodeName: string) => boolean;
	handleModeChange: (landingNodeName: string, mode: Stage2Row["mode"]) => void;
	handleTargetChange: (landingNodeName: string, targetName: string) => void;
	handleGenerate: () => Promise<void>;
	handlePreferShortUrl: (checked: boolean) => Promise<void>;
	recordWorkflowEvent: (level: WorkflowLogLevel, code: string, message: string, originStage?: ResponseOriginStage | null) => void;
}

const MAX_WORKFLOW_LOG_ENTRIES = 200;

let workflowLogSequence = 0;
let stage2DerivedRowSequence = 0;

function snapshotRowsFromInit(stage2Init: Stage2Init) {
	return stage2Init.rows.map((row) => ({
		rowId: row.rowId,
		sourceLandingNodeName: row.sourceLandingNodeName,
		proxyName: row.proxyName,
		landingNodeName: row.landingNodeName,
		mode: row.mode,
		targetName: row.targetName,
	}));
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

function nextWorkflowLogID() {
	workflowLogSequence += 1;
	return `workflow-log-${Date.now()}-${workflowLogSequence}`;
}

function nextStage2DerivedRowID(sourceLandingNodeName: string) {
	stage2DerivedRowSequence += 1;
	const normalizedSource = sourceLandingNodeName.trim().replace(/\s+/g, "-").replace(/[^\w\u0080-\uFFFF-]/g, "").slice(0, 32);
	const sourcePrefix = normalizedSource === "" ? "stage2-row" : normalizedSource;
	const randomPart = globalThis.crypto?.randomUUID?.().slice(0, 8) ?? `${Date.now()}-${stage2DerivedRowSequence}`;
	return `${sourcePrefix}-${randomPart}`;
}

function buildWorkflowLogEntry(
	level: WorkflowLogLevel,
	code: string,
	message: string,
	source: WorkflowLogEntry["source"],
	originStage: ResponseOriginStage | null,
): WorkflowLogEntry {
	return {
		id: nextWorkflowLogID(),
		createdAt: new Date().toISOString(),
		level,
		code,
		message,
		source,
		originStage,
	};
}

function appendWorkflowLogEntries(current: WorkflowLogEntry[], entries: WorkflowLogEntry[]) {
	if (entries.length === 0) {
		return current;
	}

	const next = current.concat(entries);
	return next.length > MAX_WORKFLOW_LOG_ENTRIES ? next.slice(-MAX_WORKFLOW_LOG_ENTRIES) : next;
}

function backendMessagesToWorkflowLog(messages: Message[], originStage: ResponseOriginStage | null) {
	return messages.map((message) => buildWorkflowLogEntry(message.level, message.code, message.message, "backend", originStage));
}

function summarizeBlockingErrors(errors: BlockingError[], fallback: string) {
	return errors[0]?.message ?? fallback;
}

function buildGeneratedUrls(longUrl: string, shortUrl: string | null | undefined) {
	return {
		longUrl,
		shortUrl: shortUrl ?? null,
	};
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

	const stage3Status: WorkflowStatus = state.generatedUrls === null
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
		setState((current) => ({
			...current,
			currentLinkInput: value,
			blockingErrors: clearStage3ActionErrors(clearStage3FieldErrors(current.blockingErrors, "currentLinkInput")),
		}));
	}

	function reportCurrentLinkInputError(message: string, actionLabel: string) {
		setState((current) => ({
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
		}));
	}

	function recordWorkflowEvent(level: WorkflowLogLevel, code: string, message: string, originStage: ResponseOriginStage | null = state.responseOriginStage) {
		setState((current) => ({
			...current,
			workflowLog: appendWorkflowLogEntries(
				current.workflowLog,
				[buildWorkflowLogEntry(level, code, message, "frontend", originStage)],
			),
		}));
	}

	function updateStage1Input(updater: (current: Stage1Input) => Stage1Input) {
		setState((current) => {
			const nextStage1Input = updater(current.stage1Input);
			const changedFields = getChangedStage1Fields(current.stage1Input, nextStage1Input);
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
				generatedUrls: null,
				stage2Stale: becomesStale ? true : current.stage2Stale,
				blockingErrors,
			};
		});
	}

	function applyStage2Init(stage2Init: Stage2Init) {
		setState((current) => ({
			...current,
			stage2Init,
			stage2Snapshot: { rows: snapshotRowsFromInit(stage2Init) },
			generatedUrls: null,
			stage2Stale: false,
			restoreStatus: "idle",
		}));
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
		setState((current) => ({
			...current,
			responseOriginStage: "stage1",
			messages: [],
			workflowLog: appendWorkflowLogEntries(
				current.workflowLog,
				[buildWorkflowLogEntry("info", "STAGE1_CONVERT_STARTED", "开始转换并自动填充。", "frontend", "stage1")],
			),
			blockingErrors: [],
		}));

		try {
			const response = await postStage1Convert({ stage1Input: toStage1InputPayload(stage1Input) });
			applyStage2Init(response.stage2Init);
			const logEntries = backendMessagesToWorkflowLog(response.messages, "stage1").concat(
				buildWorkflowLogEntry("success", "STAGE1_CONVERT_SUCCEEDED", "已完成转换并更新 Stage 2 初始化结果。", "frontend", "stage1"),
			);
			setState((current) => ({
				...current,
				responseOriginStage: "stage1",
				messages: response.messages,
				workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
				blockingErrors: response.blockingErrors,
			}));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			const blockingErrors = errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
				stageLabel: "Stage 1 / 输入区",
				actionLabel: "转换并自动填充",
				requestPath: "POST /api/stage1/convert",
			})];
			const messages = errorResponse?.messages ?? [];
			const logEntries = backendMessagesToWorkflowLog(messages, "stage1").concat(
				buildWorkflowLogEntry(
					"error",
					"STAGE1_CONVERT_FAILED",
					`转换并自动填充失败：${summarizeBlockingErrors(blockingErrors, "请求失败。")}`,
					"frontend",
					"stage1",
				),
			);
			setState((current) => ({
				...current,
				responseOriginStage: "stage1",
				messages,
				workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
				blockingErrors,
			}));
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
		setState((current) => ({
			...current,
			responseOriginStage: "stage3",
			messages: [],
			workflowLog: appendWorkflowLogEntries(
				current.workflowLog,
				[buildWorkflowLogEntry("info", "RESTORE_STARTED", "开始反向解析并恢复页面状态。", "frontend", "stage3")],
			),
			blockingErrors: [],
		}));

		try {
			const restoreResponse = await postResolveURL(restoreInput);
			const restoredStage1Input = hydrateStage1Input(restoreResponse.stage1Input);
			if (restoreResponse.restoreStatus === "conflicted") {
				const logEntries = backendMessagesToWorkflowLog(restoreResponse.messages, "stage3").concat(
					buildWorkflowLogEntry("warning", "RESTORE_CONFLICTED", "恢复结果进入只读冲突态，请重新执行转换并自动填充。", "frontend", "stage3"),
				);
				setState((current) => ({
					...current,
					currentLinkInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
					preferShortUrl: Boolean(restoreResponse.shortUrl),
					stage1Input: restoredStage1Input,
					stage2Init: null,
					stage2Snapshot: restoreResponse.stage2Snapshot,
					generatedUrls: buildGeneratedUrls(restoreResponse.longUrl, restoreResponse.shortUrl),
					stage2Stale: false,
					restoreStatus: restoreResponse.restoreStatus,
					responseOriginStage: "stage3",
					messages: restoreResponse.messages,
					workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
					blockingErrors: restoreResponse.blockingErrors.filter((error) => error.scope !== "stage2_row"),
				}));
				return;
			}

			try {
				const convertResponse = await postStage1Convert({ stage1Input: restoreResponse.stage1Input });
				const mergedMessages = mergeMessages(restoreResponse.messages, convertResponse.messages);
				const logEntries = backendMessagesToWorkflowLog(mergedMessages, "stage3").concat(
					buildWorkflowLogEntry("success", "RESTORE_SUCCEEDED", "已恢复页面状态，可继续编辑和生成。", "frontend", "stage3"),
				);
				setState((current) => ({
					...current,
					currentLinkInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
					preferShortUrl: Boolean(restoreResponse.shortUrl),
					stage1Input: restoredStage1Input,
					stage2Init: convertResponse.stage2Init,
					stage2Snapshot: restoreResponse.stage2Snapshot,
					generatedUrls: buildGeneratedUrls(restoreResponse.longUrl, restoreResponse.shortUrl),
					stage2Stale: false,
					restoreStatus: restoreResponse.restoreStatus,
					responseOriginStage: "stage3",
					messages: mergedMessages,
					workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
					blockingErrors: restoreResponse.blockingErrors.length > 0 ? restoreResponse.blockingErrors : convertResponse.blockingErrors,
				}));
			} catch (convertError) {
				const errorResponse = getErrorResponse(convertError);
				const blockingErrors = errorResponse?.blockingErrors ?? [fallbackBlockingError(convertError, {
					stageLabel: "Stage 3 / 输出区",
					actionLabel: "恢复后的转换并自动填充",
					requestPath: "POST /api/stage1/convert",
				})];
				const logEntries = backendMessagesToWorkflowLog(restoreResponse.messages, "stage3").concat(
					buildWorkflowLogEntry(
						"error",
						"RESTORE_REINIT_FAILED",
						`恢复后的转换并自动填充失败：${summarizeBlockingErrors(blockingErrors, "请求失败。")}`,
						"frontend",
						"stage3",
					),
				);
				setState((current) => ({
					...current,
					currentLinkInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
					preferShortUrl: Boolean(restoreResponse.shortUrl),
					stage1Input: restoredStage1Input,
					stage2Init: null,
					stage2Snapshot: restoreResponse.stage2Snapshot,
					generatedUrls: buildGeneratedUrls(restoreResponse.longUrl, restoreResponse.shortUrl),
					stage2Stale: true,
					restoreStatus: restoreResponse.restoreStatus,
					responseOriginStage: "stage3",
					messages: restoreResponse.messages,
					workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
					blockingErrors,
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
				buildWorkflowLogEntry(
					"error",
					"RESTORE_FAILED",
					`反向解析失败：${summarizeBlockingErrors(blockingErrors, "请求失败。")}`,
					"frontend",
					"stage3",
				),
			);
			setState((current) => ({
				...current,
				responseOriginStage: "stage3",
				messages,
				workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
				blockingErrors,
			}));
		} finally {
			setIsRestoring(false);
		}
	}

	function updateStage2Row(landingNodeName: string, updater: (row: Stage2Row) => Stage2Row) {
		setState((current) => {
			const matchedRow = findStage2RowByKey(current.stage2Snapshot.rows, landingNodeName);
			if (matchedRow === null) {
				return current;
			}
			return {
				...current,
				generatedUrls: null,
				blockingErrors: current.blockingErrors.filter((error) => error.scope !== "stage2_row"),
				stage2Snapshot: {
					rows: current.stage2Snapshot.rows.map((row) => (matchesStage2RowKey(row, landingNodeName) ? updater(row) : row)),
				},
			};
		});
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
			const clonedProxyName = pickNextDerivedProxyName(current.stage2Snapshot.rows, sourceLandingNodeName);
			const clonedRow: Stage2Row = {
				...matchedRow,
				rowId: nextStage2DerivedRowID(sourceLandingNodeName),
				proxyName: clonedProxyName,
				landingNodeName: clonedProxyName,
			};

			const matchedIndex = current.stage2Snapshot.rows.findIndex((row) => matchesStage2RowKey(row, landingNodeName));
			const nextRows = [...current.stage2Snapshot.rows];
			nextRows.splice(matchedIndex + 1, 0, clonedRow);

			return {
				...current,
				generatedUrls: null,
				blockingErrors: current.blockingErrors.filter((error) => error.scope !== "stage2_row"),
				stage2Snapshot: {
					rows: nextRows,
				},
			};
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
		setState((current) => {
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
				generatedUrls: null,
				blockingErrors: current.blockingErrors.filter((error) => error.scope !== "stage2_row"),
				stage2Snapshot: {
					rows: current.stage2Snapshot.rows.filter((row) => !matchesStage2RowKey(row, landingNodeName)),
				},
			};
		});
	}

	function handleModeChange(landingNodeName: string, mode: Stage2Row["mode"]) {
		updateStage2Row(landingNodeName, (row) => ({
			...row,
			mode,
			targetName: pickNextTarget(state.stage2Init, state.stage2Snapshot.rows, getStage2RowKey(row), mode, row.targetName),
		}));
	}

	function handleTargetChange(landingNodeName: string, targetName: string) {
		updateStage2Row(landingNodeName, (row) => ({
			...row,
			targetName: targetName === "" ? null : targetName,
		}));
	}

	async function handleGenerate() {
		const stage1Input = state.stage1Input;
		const stage2Snapshot = state.stage2Snapshot;
		const preferShortUrl = state.preferShortUrl;

		setIsGenerating(true);
		setState((current) => ({
			...current,
			responseOriginStage: "stage2",
			messages: [],
			workflowLog: appendWorkflowLogEntries(
				current.workflowLog,
				[buildWorkflowLogEntry("info", "GENERATE_STARTED", "开始生成链接。", "frontend", "stage2")],
			),
			blockingErrors: [],
		}));

		try {
			const response = await postGenerate({
				stage1Input: toStage1InputPayload(stage1Input),
				stage2Snapshot,
			});
			const forceShortUrl = exceedsPublicLongURLBudget(response.longUrl, maxPublicLongURLLength);
			if (!preferShortUrl && !forceShortUrl) {
				const logEntries = backendMessagesToWorkflowLog(response.messages, "stage2").concat(
					buildWorkflowLogEntry("success", "GENERATE_SUCCEEDED", "已生成长链接。", "frontend", "stage2"),
				);
				setState((current) => ({
					...current,
					generatedUrls: buildGeneratedUrls(response.longUrl, null),
					currentLinkInput: response.longUrl,
					responseOriginStage: "stage2",
					messages: response.messages,
					workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
					blockingErrors: response.blockingErrors,
				}));
				return;
			}

			setIsCreatingShortUrl(true);
			try {
				const shortLinkResponse = await postShortLink(response.longUrl);
				const mergedMessages = mergeMessages(response.messages, shortLinkResponse.messages);
				const logEntries = backendMessagesToWorkflowLog(mergedMessages, "stage2").concat(
					buildWorkflowLogEntry(
						"success",
						"SHORT_URL_READY",
						forceShortUrl ? "长链接超过公开长度上限，已自动切换为短链接。" : "已生成短链接。",
						"frontend",
						"stage2",
					),
				);
				setState((current) => ({
					...current,
					preferShortUrl: preferShortUrl || forceShortUrl,
					generatedUrls: buildGeneratedUrls(shortLinkResponse.longUrl, shortLinkResponse.shortUrl),
					currentLinkInput: shortLinkResponse.shortUrl,
					responseOriginStage: "stage2",
					messages: mergedMessages,
					workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
					blockingErrors: shortLinkResponse.blockingErrors,
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
					buildWorkflowLogEntry(
						"error",
						forceShortUrl ? "SHORT_URL_REQUIRED_FAILED" : "SHORT_URL_FAILED",
						forceShortUrl
							? `当前状态的长链接超过公开长度上限，自动短链接失败：${summarizeBlockingErrors(blockingErrors, "请求失败。")}`
							: `创建短链接失败：${summarizeBlockingErrors(blockingErrors, "请求失败。")}`,
						"frontend",
						"stage3",
					),
				);
				setState((current) => ({
					...current,
					preferShortUrl: forceShortUrl ? true : false,
					generatedUrls: forceShortUrl ? null : buildGeneratedUrls(response.longUrl, null),
					currentLinkInput: forceShortUrl ? current.currentLinkInput : response.longUrl,
					responseOriginStage: "stage3",
					messages: mergedMessages,
					workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
					blockingErrors,
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
				buildWorkflowLogEntry(
					"error",
					"GENERATE_FAILED",
					`生成链接失败：${summarizeBlockingErrors(blockingErrors, "请求失败。")}`,
					"frontend",
					"stage2",
				),
			);
			setState((current) => ({
				...current,
				responseOriginStage: "stage2",
				messages,
				workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
				blockingErrors,
			}));
		} finally {
			setIsGenerating(false);
		}
	}

	async function handlePreferShortUrl(checked: boolean) {
		if (!checked) {
			if (state.generatedUrls && exceedsPublicLongURLBudget(state.generatedUrls.longUrl, maxPublicLongURLLength)) {
				setState((current) => ({
					...current,
					preferShortUrl: true,
					currentLinkInput: getDisplayedGeneratedUrl(current.generatedUrls, true) || current.currentLinkInput,
					workflowLog: appendWorkflowLogEntries(
						current.workflowLog,
						[
							buildWorkflowLogEntry(
								"warning",
								"SHORT_URL_REQUIRED",
								"当前状态的长链接超过公开长度上限，不能切回长链接展示。",
								"frontend",
								"stage3",
							),
						],
					),
				}));
				return;
			}
			setState((current) => ({
				...current,
				preferShortUrl: false,
				currentLinkInput: getDisplayedGeneratedUrl(current.generatedUrls, false) || current.currentLinkInput,
			}));
			return;
		}
		if (state.generatedUrls === null) {
			setState((current) => ({
				...current,
				preferShortUrl: true,
			}));
			return;
		}
		if (state.generatedUrls.shortUrl) {
			setState((current) => ({
				...current,
				preferShortUrl: true,
				currentLinkInput: getDisplayedGeneratedUrl(current.generatedUrls, true) || current.currentLinkInput,
			}));
			return;
		}

		setIsCreatingShortUrl(true);
		setState((current) => ({
			...current,
			preferShortUrl: true,
			responseOriginStage: "stage3",
			messages: [],
			workflowLog: appendWorkflowLogEntries(
				current.workflowLog,
				[buildWorkflowLogEntry("info", "SHORT_URL_STARTED", "开始创建短链接。", "frontend", "stage3")],
			),
			blockingErrors: [],
		}));

		try {
			const response = await postShortLink(state.generatedUrls.longUrl);
			const logEntries = backendMessagesToWorkflowLog(response.messages, "stage3").concat(
				buildWorkflowLogEntry("success", "SHORT_URL_READY", "已生成短链接。", "frontend", "stage3"),
			);
			setState((current) => ({
				...current,
				generatedUrls: buildGeneratedUrls(response.longUrl, response.shortUrl),
				currentLinkInput: response.shortUrl,
				responseOriginStage: "stage3",
				messages: response.messages,
				workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
				blockingErrors: response.blockingErrors,
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
				buildWorkflowLogEntry(
					"error",
					"SHORT_URL_FAILED",
					`创建短链接失败：${summarizeBlockingErrors(blockingErrors, "请求失败。")}`,
					"frontend",
					"stage3",
				),
			);
			setState((current) => ({
				...current,
				preferShortUrl: false,
				responseOriginStage: "stage3",
				messages,
				workflowLog: appendWorkflowLogEntries(current.workflowLog, logEntries),
				blockingErrors,
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
		handleStage1Convert,
		handleRestore,
		handleProxyNameChange,
		handleCloneStage2Row,
		handleDeleteStage2Row,
		canDeleteStage2Row,
		handleModeChange,
		handleTargetChange,
		handleGenerate,
		handlePreferShortUrl,
		recordWorkflowEvent,
	};

	return workflow;
}