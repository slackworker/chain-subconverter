import { useState } from "react";

import { getErrorResponse, postGenerate, postResolveURL, postShortLink, postStage1Convert } from "../lib/api";
import { getChainTargetGroups } from "../lib/chainTargets";
import {
	clearBlockingErrorsSupersededByStage2Stale,
	clearStage1FieldErrors,
	clearStage2RowErrors,
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
import { hydrateStage1Input, initialAppState, toStage1InputPayload } from "../lib/state";
import type { ResponseOriginStage } from "../lib/state";
import type { BlockingError, Message, Stage1Input, Stage2Init, Stage2Row } from "../types/api";
import type { APIRequestError } from "../lib/api";
import type { ChainTargetGroup } from "../lib/chainTargets";

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

export interface TargetChoice {
	value: string;
	label: string;
	disabled: boolean;
}

export interface ChainTargetChoiceGroup extends Omit<ChainTargetGroup, "targets"> {
	choices: TargetChoice[];
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
	handleModeChange: (landingNodeName: string, mode: Stage2Row["mode"]) => void;
	handleTargetChange: (landingNodeName: string, targetName: string) => void;
	handleGenerate: () => Promise<void>;
	handlePreferShortUrl: (checked: boolean) => Promise<void>;
}

function snapshotRowsFromInit(stage2Init: Stage2Init) {
	return stage2Init.rows.map((row) => ({
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

function getModeOptions(stage2Init: Stage2Init | null) {
	return stage2Init?.availableModes ?? [];
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

function getChainTargetChoiceGroups(stage2Init: Stage2Init | null) {
	if (stage2Init === null) {
		return [];
	}

	return getChainTargetGroups(stage2Init.chainTargets).map(toChainTargetChoiceGroup);
}

function getForwardRelayChoices(stage2Init: Stage2Init | null, stage2Rows: Stage2SnapshotRows, landingNodeName: string) {
	if (stage2Init === null) {
		return [];
	}

	const currentRow = stage2Rows.find((row: Stage2SnapshotRow) => row.landingNodeName === landingNodeName) ?? null;
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

function pickNextTarget(stage2Init: Stage2Init | null, stage2Rows: Stage2SnapshotRows, landingNodeName: string, mode: Stage2Row["mode"], currentTarget: string | null) {
	if (mode === "none") {
		return null;
	}
	const choices = getSelectableChoices(stage2Init, stage2Rows, landingNodeName, mode);
	if (choices.some((choice) => choice.value === currentTarget)) {
		return currentTarget;
	}
	return null;
}

export function useAppWorkflow() {
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

	const stage2Status: WorkflowStatus = isConflictReadonly
		? { label: "Conflict", tone: "warning" }
		: state.stage2Stale
			? { label: "Stage 2 Stale", tone: "warning" }
			: state.stage2Init === null
				? { label: "Awaiting Init", tone: "warning" }
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
		return state.stage2Init?.rows.find((row) => row.landingNodeName === landingNodeName) ?? null;
	}

	function getStage2RowErrors(landingNodeName: string) {
		return isStage2Editable ? getRowErrors(state.blockingErrors, landingNodeName) : [];
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
			blockingErrors: [],
		}));

		try {
			const response = await postStage1Convert({ stage1Input: toStage1InputPayload(stage1Input) });
			applyStage2Init(response.stage2Init);
			setState((current) => ({
				...current,
				responseOriginStage: "stage1",
				messages: response.messages,
				blockingErrors: response.blockingErrors,
			}));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			setState((current) => ({
				...current,
				responseOriginStage: "stage1",
				messages: errorResponse?.messages ?? [],
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
					stageLabel: "Stage 1 / 输入区",
					actionLabel: "转换并自动填充",
					requestPath: "POST /api/stage1/convert",
				})],
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
			blockingErrors: [],
		}));

		try {
			const restoreResponse = await postResolveURL(restoreInput);
			const restoredStage1Input = hydrateStage1Input(restoreResponse.stage1Input);
			if (restoreResponse.restoreStatus === "conflicted") {
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
					blockingErrors: restoreResponse.blockingErrors.filter((error) => error.scope !== "stage2_row"),
				}));
				return;
			}

			try {
				const convertResponse = await postStage1Convert({ stage1Input: restoreResponse.stage1Input });
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
					messages: mergeMessages(restoreResponse.messages, convertResponse.messages),
					blockingErrors: restoreResponse.blockingErrors.length > 0 ? restoreResponse.blockingErrors : convertResponse.blockingErrors,
				}));
			} catch (convertError) {
				const errorResponse = getErrorResponse(convertError);
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
					blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(convertError, {
						stageLabel: "Stage 3 / 输出区",
						actionLabel: "恢复后的转换并自动填充",
						requestPath: "POST /api/stage1/convert",
					})],
				}));
			}
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			setState((current) => ({
				...current,
				responseOriginStage: "stage3",
				messages: errorResponse?.messages ?? [],
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
					stageLabel: "Stage 3 / 输出区",
					actionLabel: "反向解析",
					requestPath: "POST /api/resolve-url",
				})],
			}));
		} finally {
			setIsRestoring(false);
		}
	}

	function updateStage2Row(landingNodeName: string, updater: (row: Stage2Row) => Stage2Row) {
		setState((current) => ({
			...current,
			generatedUrls: null,
			blockingErrors: clearStage2RowErrors(current.blockingErrors, landingNodeName),
			stage2Snapshot: {
				rows: current.stage2Snapshot.rows.map((row) => (row.landingNodeName === landingNodeName ? updater(row) : row)),
			},
		}));
	}

	function handleModeChange(landingNodeName: string, mode: Stage2Row["mode"]) {
		updateStage2Row(landingNodeName, (row) => ({
			...row,
			mode,
			targetName: pickNextTarget(state.stage2Init, state.stage2Snapshot.rows, landingNodeName, mode, row.targetName),
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
			blockingErrors: [],
		}));

		try {
			const response = await postGenerate({
				stage1Input: toStage1InputPayload(stage1Input),
				stage2Snapshot,
			});
			if (!preferShortUrl) {
				setState((current) => ({
					...current,
					generatedUrls: buildGeneratedUrls(response.longUrl, null),
					currentLinkInput: response.longUrl,
					responseOriginStage: "stage2",
					messages: response.messages,
					blockingErrors: response.blockingErrors,
				}));
				return;
			}

			setIsCreatingShortUrl(true);
			try {
				const shortLinkResponse = await postShortLink(response.longUrl);
				setState((current) => ({
					...current,
					generatedUrls: buildGeneratedUrls(shortLinkResponse.longUrl, shortLinkResponse.shortUrl),
					currentLinkInput: shortLinkResponse.shortUrl,
					responseOriginStage: "stage2",
					messages: mergeMessages(response.messages, shortLinkResponse.messages),
					blockingErrors: shortLinkResponse.blockingErrors,
				}));
			} catch (error) {
				const errorResponse = getErrorResponse(error);
				setState((current) => ({
					...current,
					preferShortUrl: false,
					generatedUrls: buildGeneratedUrls(response.longUrl, null),
					currentLinkInput: response.longUrl,
					responseOriginStage: "stage3",
					messages: mergeMessages(response.messages, errorResponse?.messages ?? []),
					blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
						stageLabel: "Stage 3 / 输出区",
						actionLabel: "创建短链接",
						requestPath: "POST /api/short-links",
					})],
				}));
			} finally {
				setIsCreatingShortUrl(false);
			}
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			setState((current) => ({
				...current,
				responseOriginStage: "stage2",
				messages: errorResponse?.messages ?? [],
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
					stageLabel: "Stage 2 / 配置区",
					actionLabel: "生成链接",
					requestPath: "POST /api/generate",
				})],
			}));
		} finally {
			setIsGenerating(false);
		}
	}

	async function handlePreferShortUrl(checked: boolean) {
		if (!checked) {
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
			blockingErrors: [],
		}));

		try {
			const response = await postShortLink(state.generatedUrls.longUrl);
			setState((current) => ({
				...current,
				generatedUrls: buildGeneratedUrls(response.longUrl, response.shortUrl),
				currentLinkInput: response.shortUrl,
				responseOriginStage: "stage3",
				messages: response.messages,
				blockingErrors: response.blockingErrors,
			}));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			setState((current) => ({
				...current,
				preferShortUrl: false,
				responseOriginStage: "stage3",
				messages: errorResponse?.messages ?? [],
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error, {
					stageLabel: "Stage 3 / 输出区",
					actionLabel: "创建短链接",
					requestPath: "POST /api/short-links",
				})],
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
		handleModeChange,
		handleTargetChange,
		handleGenerate,
		handlePreferShortUrl,
	};

	return workflow;
}