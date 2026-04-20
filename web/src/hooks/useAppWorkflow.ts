import { useState } from "react";

import { getErrorResponse, postGenerate, postResolveURL, postShortLink, postStage1Convert } from "../lib/api";
import { getChainTargetGroups } from "../lib/chainTargets";
import { getRowErrors } from "../lib/notices";
import { initialAppState } from "../lib/state";
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
	setCurrentLinkInput: (value: string) => void;
	updateStage1Input: (updater: (current: Stage1Input) => Stage1Input) => void;
	getStage2RowMeta: (landingNodeName: string) => Stage2Init["rows"][number] | null;
	getStage2RowErrors: (landingNodeName: string) => BlockingError[];
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

function buildGeneratedUrls(longUrl: string, shortUrl: string | null | undefined, preferShortUrl = false) {
	return {
		longUrl,
		shortUrl: shortUrl ?? null,
		preferShortUrl: preferShortUrl && Boolean(shortUrl),
	};
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

function matchesResponseOriginStage(currentStage: ResponseOriginStage | null, stage: ResponseOriginStage) {
	return currentStage === stage;
}

function pickNextTarget(stage2Init: Stage2Init | null, stage2Rows: Stage2SnapshotRows, landingNodeName: string, mode: Stage2Row["mode"], currentTarget: string | null) {
	if (mode === "none") {
		return null;
	}
	const choices = getSelectableChoices(stage2Init, stage2Rows, landingNodeName, mode);
	if (choices.some((choice) => choice.value === currentTarget)) {
		return currentTarget;
	}
	if (mode === "port_forward" && choices.length === 1) {
		return choices[0].value;
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

	function setCurrentLinkInput(value: string) {
		setState((current) => ({
			...current,
			currentLinkInput: value,
		}));
	}

	function updateStage1Input(updater: (current: Stage1Input) => Stage1Input) {
		setState((current) => ({
			...current,
			stage1Input: updater(current.stage1Input),
			generatedUrls: null,
			stage2Stale: current.stage2Snapshot.rows.length > 0 ? true : current.stage2Stale,
		}));
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

	function getStage2RowMeta(landingNodeName: string) {
		return state.stage2Init?.rows.find((row) => row.landingNodeName === landingNodeName) ?? null;
	}

	function getStage2RowErrors(landingNodeName: string) {
		return getRowErrors(state.blockingErrors, landingNodeName);
	}

	function getStageMessages(stage: ResponseOriginStage) {
		return matchesResponseOriginStage(state.responseOriginStage, stage) ? state.messages : [];
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
			const response = await postStage1Convert({ stage1Input });
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
			if (restoreResponse.restoreStatus === "conflicted") {
				setState((current) => ({
					...current,
					currentLinkInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
					stage1Input: restoreResponse.stage1Input,
					stage2Init: null,
					stage2Snapshot: restoreResponse.stage2Snapshot,
					generatedUrls: buildGeneratedUrls(restoreResponse.longUrl, restoreResponse.shortUrl, Boolean(restoreResponse.shortUrl)),
					stage2Stale: false,
					restoreStatus: restoreResponse.restoreStatus,
					responseOriginStage: "stage3",
					messages: restoreResponse.messages,
					blockingErrors: restoreResponse.blockingErrors,
				}));
				return;
			}

			try {
				const convertResponse = await postStage1Convert({ stage1Input: restoreResponse.stage1Input });
				setState((current) => ({
					...current,
					currentLinkInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
					stage1Input: restoreResponse.stage1Input,
					stage2Init: convertResponse.stage2Init,
					stage2Snapshot: restoreResponse.stage2Snapshot,
					generatedUrls: buildGeneratedUrls(restoreResponse.longUrl, restoreResponse.shortUrl, Boolean(restoreResponse.shortUrl)),
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
					stage1Input: restoreResponse.stage1Input,
					stage2Init: null,
					stage2Snapshot: restoreResponse.stage2Snapshot,
					generatedUrls: buildGeneratedUrls(restoreResponse.longUrl, restoreResponse.shortUrl, Boolean(restoreResponse.shortUrl)),
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
			blockingErrors: current.blockingErrors.filter(
				(error) => !(error.scope === "stage2_row" && error.context?.landingNodeName === landingNodeName),
			),
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
		setIsGenerating(true);
		setState((current) => ({
			...current,
			responseOriginStage: "stage2",
			messages: [],
			blockingErrors: [],
		}));

		try {
			const response = await postGenerate({
				stage1Input: state.stage1Input,
				stage2Snapshot: state.stage2Snapshot,
			});
			setState((current) => ({
				...current,
				generatedUrls: buildGeneratedUrls(response.longUrl, null),
				currentLinkInput: response.longUrl,
				responseOriginStage: "stage2",
				messages: response.messages,
				blockingErrors: response.blockingErrors,
			}));
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
		if (state.generatedUrls === null) {
			return;
		}
		if (!checked) {
			setState((current) => current.generatedUrls === null ? current : ({
				...current,
				currentLinkInput: current.generatedUrls.longUrl,
				generatedUrls: {
					...current.generatedUrls,
					preferShortUrl: false,
				},
			}));
			return;
		}
		if (state.generatedUrls.shortUrl) {
			setState((current) => current.generatedUrls === null ? current : ({
				...current,
				currentLinkInput: current.generatedUrls.shortUrl ?? current.generatedUrls.longUrl,
				generatedUrls: {
					...current.generatedUrls,
					preferShortUrl: true,
				},
			}));
			return;
		}

		setIsCreatingShortUrl(true);
		setState((current) => ({
			...current,
			responseOriginStage: "stage3",
			messages: [],
			blockingErrors: [],
		}));

		try {
			const response = await postShortLink(state.generatedUrls.longUrl);
			setState((current) => ({
				...current,
				generatedUrls: buildGeneratedUrls(response.longUrl, response.shortUrl, true),
				currentLinkInput: response.shortUrl,
				responseOriginStage: "stage3",
				messages: response.messages,
				blockingErrors: response.blockingErrors,
			}));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			setState((current) => ({
				...current,
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
		setCurrentLinkInput,
		updateStage1Input,
		getStage2RowMeta,
		getStage2RowErrors,
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