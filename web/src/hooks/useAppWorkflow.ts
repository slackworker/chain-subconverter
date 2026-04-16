import { useState } from "react";

import { getErrorResponse, postGenerate, postResolveURL, postShortLink, postStage1Convert } from "../lib/api";
import { getRowErrors } from "../lib/notices";
import { initialAppState } from "../lib/state";
import type { AppState } from "../lib/state";
import type { ResponseOriginStage } from "../lib/state";
import type { BlockingError, Message, Stage1Input, Stage2Init, Stage2Row } from "../types/api";

export type WorkflowTone = "neutral" | "warning" | "success";

interface WorkflowStatus {
	label: string;
	tone: WorkflowTone;
}

function snapshotRowsFromInit(stage2Init: Stage2Init) {
	return stage2Init.rows.map((row) => ({
		landingNodeName: row.landingNodeName,
		mode: row.mode,
		targetName: row.targetName,
	}));
}

function fallbackBlockingError(error: unknown): BlockingError {
	return {
		code: "REQUEST_FAILED",
		message: error instanceof Error ? error.message : "请求失败",
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

function getTargetChoices(stage2Init: Stage2Init | null, mode: Stage2Row["mode"]) {
	if (stage2Init === null) {
		return [];
	}
	if (mode === "chain") {
		return stage2Init.chainTargets.map((target) => ({
			value: target.name,
			label: target.isEmpty ? `${target.name}（策略组为空）` : target.name,
			disabled: target.isEmpty === true,
		}));
	}
	if (mode === "port_forward") {
		return stage2Init.forwardRelays.map((relay) => ({
			value: relay.name,
			label: relay.name,
			disabled: false,
		}));
	}
	return [];
}

function matchesResponseOriginStage(currentStage: ResponseOriginStage | null, stage: ResponseOriginStage) {
	return currentStage === stage;
}

function pickNextTarget(stage2Init: Stage2Init | null, mode: Stage2Row["mode"], currentTarget: string | null) {
	if (mode === "none") {
		return null;
	}
	const choices = getTargetChoices(stage2Init, mode).filter((choice) => !choice.disabled);
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

	function setRestoreInput(value: string) {
		setState((current) => ({
			...current,
			restoreInput: value,
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
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error)],
			}));
		} finally {
			setIsConverting(false);
		}
	}

	async function handleRestore() {
		const restoreInput = state.restoreInput.trim();
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
					restoreInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
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
					restoreInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
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
					restoreInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
					stage1Input: restoreResponse.stage1Input,
					stage2Init: null,
					stage2Snapshot: restoreResponse.stage2Snapshot,
					generatedUrls: buildGeneratedUrls(restoreResponse.longUrl, restoreResponse.shortUrl, Boolean(restoreResponse.shortUrl)),
					stage2Stale: true,
					restoreStatus: restoreResponse.restoreStatus,
					responseOriginStage: "stage3",
					messages: restoreResponse.messages,
					blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(convertError)],
				}));
			}
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			setState((current) => ({
				...current,
				responseOriginStage: "stage3",
				messages: errorResponse?.messages ?? [],
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error)],
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
			targetName: pickNextTarget(state.stage2Init, mode, row.targetName),
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
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error)],
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
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error)],
			}));
		} finally {
			setIsCreatingShortUrl(false);
		}
	}

	return {
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
		setRestoreInput,
		updateStage1Input,
		getStage2RowMeta,
		getStage2RowErrors,
		getStageMessages,
		getTargetChoices: (mode: Stage2Row["mode"]) => getTargetChoices(state.stage2Init, mode),
		handleStage1Convert,
		handleRestore,
		handleModeChange,
		handleTargetChange,
		handleGenerate,
		handlePreferShortUrl,
	};
}