import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type {
	ErrorResponse,
	GenerateResponse,
	ResolveURLResponse,
	ShortLinkResponse,
	Stage1ConvertResponse,
	Stage1Input,
} from "../types/api";

vi.mock("../lib/api", async () => {
	const actual = await vi.importActual<typeof import("../lib/api")>("../lib/api");
	return {
		...actual,
		postStage1Convert: vi.fn(),
		postGenerate: vi.fn(),
		postResolveURL: vi.fn(),
		postShortLink: vi.fn(),
	};
});

import { postGenerate, postResolveURL, postShortLink, postStage1Convert } from "../lib/api";
import { getStage2RowStrictKey } from "../lib/stage2";
import { initialStage1Input, toStage1InputPayload } from "../lib/state";
import { type AppWorkflowViewModel, useAppWorkflow } from "./useAppWorkflow";

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

type Stage1InputOverrides = Partial<Omit<Stage1Input, "advancedOptions">> & {
	advancedOptions?: Partial<Stage1Input["advancedOptions"]>;
};

interface RenderedWorkflow {
	readonly current: AppWorkflowViewModel;
}

const mountedWorkflowCleanups: Array<() => void> = [];

const mockPostGenerate = vi.mocked(postGenerate);
const mockPostResolveURL = vi.mocked(postResolveURL);
const mockPostShortLink = vi.mocked(postShortLink);
const mockPostStage1Convert = vi.mocked(postStage1Convert);

afterEach(() => {
	vi.resetAllMocks();
	while (mountedWorkflowCleanups.length > 0) {
		mountedWorkflowCleanups.pop()?.();
	}
});

function buildStage1Input(overrides: Stage1InputOverrides = {}): Stage1Input {
	return {
		...initialStage1Input,
		...overrides,
		advancedOptions: {
			...initialStage1Input.advancedOptions,
			...overrides.advancedOptions,
		},
	};
}

function buildStage2Init(): Stage1ConvertResponse["stage2Init"] {
	return {
		availableModes: ["none", "chain", "port_forward"],
		chainTargets: [
			{ name: "HK Relay Group", kind: "proxy-groups" },
		],
		forwardRelays: [
			{ name: "relay.example.com:7443" },
		],
		rows: [
			{
				landingNodeName: "landing-hk",
				landingNodeType: "ss",
				mode: "none",
				targetName: null,
			},
		],
	};
}

function buildRequestError(errorBody: ErrorResponse, status = 422, requestPath = "/api/stage1/convert") {
	return Object.assign(new Error(errorBody.blockingErrors[0]?.message ?? "request failed"), {
		status,
		errorBody,
		requestPath,
	});
}

function buildGenerateResponse(longUrl: string, messages: GenerateResponse["messages"] = []): GenerateResponse {
	return {
		longUrl,
		messages,
		blockingErrors: [],
	};
}

function buildShortLinkResponse(longUrl: string, shortUrl: string, messages: ShortLinkResponse["messages"] = []): ShortLinkResponse {
	return {
		longUrl,
		shortUrl,
		messages,
		blockingErrors: [],
	};
}

function renderWorkflow(maxPublicLongURLLength?: number): RenderedWorkflow {
	let current: AppWorkflowViewModel | undefined;
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	function Harness() {
		current = useAppWorkflow(maxPublicLongURLLength);
		return null;
	}

	act(() => {
		root.render(createElement(Harness));
	});

	mountedWorkflowCleanups.push(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	return {
		get current() {
			if (current === undefined) {
				throw new Error("workflow hook did not render");
			}
			return current;
		},
	};
}

async function updateStage1Input(workflow: RenderedWorkflow, stage1Input: Stage1Input) {
	await act(async () => {
		workflow.current.updateStage1Input(() => stage1Input);
	});
}

async function updateCurrentLinkInput(workflow: RenderedWorkflow, value: string) {
	await act(async () => {
		workflow.current.setCurrentLinkInput(value);
	});
}

async function runWorkflowAction(action: () => Promise<void>) {
	await act(async () => {
		await action();
	});
}

async function initializeStage2ReadyState(workflow: RenderedWorkflow, overrides: Stage1InputOverrides = {}) {
	const stage1Input = buildStage1Input({
		landingRawText: "ss://landing-node",
		transitRawText: "https://example.com/transit.txt",
		...overrides,
	});
	const stage2Init = buildStage2Init();

	mockPostStage1Convert.mockResolvedValueOnce({
		stage2Init,
		messages: [],
		blockingErrors: [],
	});

	await updateStage1Input(workflow, stage1Input);
	await runWorkflowAction(() => workflow.current.handleStage1Convert());

	return {
		stage1Input,
		stage2Init,
	};
}

describe("useAppWorkflow", () => {
	it("shows awaiting-init Stage 2 status on a fresh page instead of stale", () => {
		const workflow = renderWorkflow();

		expect(workflow.current.state.stage2Stale).toBe(false);
		expect(workflow.current.stage2Status).toEqual({
			label: "Awaiting Init",
			tone: "neutral",
		});
	});

	it("initializes Stage 2 and workflow log entries after Stage 1 convert succeeds", async () => {
		const workflow = renderWorkflow();
		const stage1Input = buildStage1Input({
			landingRawText: "ss://landing-node",
			transitRawText: "https://example.com/transit.txt",
		});
		const stage2Init = buildStage2Init();
		const response: Stage1ConvertResponse = {
			stage2Init,
			messages: [
				{ level: "info", code: "AUTO_CHAIN_TARGET_SELECTED", message: "已自动填入香港区域策略组" },
			],
			blockingErrors: [],
		};

		mockPostStage1Convert.mockResolvedValueOnce(response);

		await updateStage1Input(workflow, stage1Input);
		await runWorkflowAction(() => workflow.current.handleStage1Convert());

		expect(mockPostStage1Convert).toHaveBeenCalledWith({
			stage1Input: toStage1InputPayload(stage1Input),
		});
		expect(workflow.current.state.stage2Init).toEqual(stage2Init);
		expect(workflow.current.state.stage2Snapshot).toEqual({
			rows: [
				{
					landingNodeName: "landing-hk",
					mode: "none",
					targetName: null,
				},
			],
		});
		expect(workflow.current.state.stage2Stale).toBe(false);
		expect(workflow.current.canGenerate).toBe(true);
		expect(workflow.current.responseOriginStage).toBe("stage1");
		expect(workflow.current.state.messages).toEqual(response.messages);
		expect(workflow.current.state.blockingErrors).toEqual([]);
		expect(workflow.current.workflowLog.map((entry) => entry.code)).toEqual([
			"STAGE1_CONVERT_STARTED",
			"AUTO_CHAIN_TARGET_SELECTED",
			"STAGE1_CONVERT_SUCCEEDED",
		]);
	});

	it("surfaces stage1 blocking errors and failure log entries when convert fails", async () => {
		const workflow = renderWorkflow();
		const stage1Input = buildStage1Input({
			landingRawText: "invalid-landing",
			transitRawText: "https://example.com/transit.txt",
		});
		const errorBody: ErrorResponse = {
			messages: [
				{ level: "warning", code: "LANDING_REVIEW_REQUIRED", message: "请检查落地输入格式" },
			],
			blockingErrors: [
				{
					code: "INVALID_REQUEST",
					message: "落地输入不符合接口约束",
					scope: "stage1_field",
					context: { field: "landingRawText" },
				},
			],
		};

		mockPostStage1Convert.mockRejectedValueOnce(buildRequestError(errorBody));

		await updateStage1Input(workflow, stage1Input);
		await runWorkflowAction(() => workflow.current.handleStage1Convert());

		expect(workflow.current.state.stage2Init).toBeNull();
		expect(workflow.current.responseOriginStage).toBe("stage1");
		expect(workflow.current.state.messages).toEqual(errorBody.messages);
		expect(workflow.current.state.blockingErrors).toEqual(errorBody.blockingErrors);
		expect(workflow.current.getStage1FieldErrors("landingRawText")).toEqual(errorBody.blockingErrors);
		expect(workflow.current.workflowLog.map((entry) => entry.code)).toEqual([
			"STAGE1_CONVERT_STARTED",
			"LANDING_REVIEW_REQUIRED",
			"STAGE1_CONVERT_FAILED",
		]);
	});

	it("rehydrates editable state after restore succeeds", async () => {
		const workflow = renderWorkflow();
		const stage2Init = buildStage2Init();
		const shortUrl = "https://public.example.com/s/restored-short";
		const restoreResponse: ResolveURLResponse = {
			longUrl: "https://public.example.com/sub?data=restored-long",
			shortUrl,
			restoreStatus: "replayable",
			stage1Input: {
				landingRawText: "ss://restored-landing",
				transitRawText: "https://example.com/restored-transit.txt",
				forwardRelayItems: ["relay.example.com:7443"],
				advancedOptions: {
					emoji: true,
					udp: true,
					skipCertVerify: null,
					config: "https://example.com/template.ini",
					include: ["HK"],
					exclude: null,
				},
			},
			stage2Snapshot: {
				rows: [
					{
						landingNodeName: "landing-hk",
						mode: "port_forward",
						targetName: "relay.example.com:7443",
					},
				],
			},
			messages: [
				{ level: "info", code: "RESTORE_METADATA_READY", message: "已读取恢复快照" },
			],
			blockingErrors: [],
		};
		const convertResponse: Stage1ConvertResponse = {
			stage2Init,
			messages: [
				{ level: "warning", code: "CHAIN_TARGET_REVIEW", message: "请复核目标策略组" },
			],
			blockingErrors: [],
		};

		mockPostResolveURL.mockResolvedValueOnce(restoreResponse);
		mockPostStage1Convert.mockResolvedValueOnce(convertResponse);

		await updateCurrentLinkInput(workflow, shortUrl);
		await runWorkflowAction(() => workflow.current.handleRestore());

		expect(mockPostResolveURL).toHaveBeenCalledWith(shortUrl);
		expect(mockPostStage1Convert).toHaveBeenCalledWith({ stage1Input: restoreResponse.stage1Input });
		expect(workflow.current.responseOriginStage).toBe("stage3");
		expect(workflow.current.state.stage1Input).toEqual({
			...restoreResponse.stage1Input,
			advancedOptions: {
				...restoreResponse.stage1Input.advancedOptions,
				enablePortForward: true,
			},
		});
		expect(workflow.current.state.stage2Init).toEqual(stage2Init);
		expect(workflow.current.state.stage2Snapshot).toEqual(restoreResponse.stage2Snapshot);
		expect(workflow.current.state.generatedUrls).toEqual({
			longUrl: restoreResponse.longUrl,
			shortUrl,
		});
		expect(workflow.current.state.currentLinkInput).toBe(shortUrl);
		expect(workflow.current.state.preferShortUrl).toBe(true);
		expect(workflow.current.state.restoreStatus).toBe("replayable");
		expect(workflow.current.state.stage2Stale).toBe(false);
		expect(workflow.current.state.messages).toEqual([
			...restoreResponse.messages,
			...convertResponse.messages,
		]);
		expect(workflow.current.state.blockingErrors).toEqual([]);
		expect(workflow.current.workflowLog.map((entry) => entry.code)).toEqual([
			"RESTORE_STARTED",
			"RESTORE_METADATA_READY",
			"CHAIN_TARGET_REVIEW",
			"RESTORE_SUCCEEDED",
		]);
	});

	it("keeps the restored snapshot in readonly conflict state when restore targets are no longer replayable", async () => {
		const workflow = renderWorkflow();
		const shortUrl = "https://public.example.com/s/conflicted-short";
		const restoreResponse: ResolveURLResponse = {
			longUrl: "https://public.example.com/sub?data=restore-conflicted",
			shortUrl,
			restoreStatus: "conflicted",
			stage1Input: {
				landingRawText: "ss://restored-landing",
				transitRawText: "https://example.com/restored-transit.txt",
				forwardRelayItems: [],
				advancedOptions: {
					emoji: true,
					udp: true,
					skipCertVerify: null,
					config: null,
					include: null,
					exclude: null,
				},
			},
			stage2Snapshot: {
				rows: [
					{
						landingNodeName: "landing-hk",
						mode: "chain",
						targetName: "HK Relay Group",
					},
				],
			},
			messages: [
				{ level: "warning", code: "RESTORE_CONFLICT", message: "restore conflict: target not found" },
			],
			blockingErrors: [],
		};

		mockPostResolveURL.mockResolvedValueOnce(restoreResponse);

		await updateCurrentLinkInput(workflow, "Ib2t8wwr3OZ");
		await runWorkflowAction(() => workflow.current.handleRestore());

		expect(mockPostResolveURL).toHaveBeenCalledWith("Ib2t8wwr3OZ");
		expect(mockPostStage1Convert).not.toHaveBeenCalled();
		expect(workflow.current.state.stage1Input).toEqual({
			...restoreResponse.stage1Input,
			advancedOptions: {
				...restoreResponse.stage1Input.advancedOptions,
				enablePortForward: false,
			},
		});
		expect(workflow.current.state.stage2Init).toBeNull();
		expect(workflow.current.state.stage2Snapshot).toEqual(restoreResponse.stage2Snapshot);
		expect(workflow.current.state.generatedUrls).toEqual({
			longUrl: restoreResponse.longUrl,
			shortUrl,
		});
		expect(workflow.current.state.currentLinkInput).toBe(shortUrl);
		expect(workflow.current.state.restoreStatus).toBe("conflicted");
		expect(workflow.current.state.stage2Stale).toBe(false);
		expect(workflow.current.isConflictReadonly).toBe(true);
		expect(workflow.current.isStage2Editable).toBe(false);
		expect(workflow.current.canGenerate).toBe(false);
		expect(workflow.current.state.messages).toEqual(restoreResponse.messages);
		expect(workflow.current.workflowLog.map((entry) => entry.code)).toEqual([
			"RESTORE_STARTED",
			"RESTORE_CONFLICT",
			"RESTORE_CONFLICTED",
		]);
	});

	it("keeps restored output state but marks Stage 2 stale when restore reinitialization fails", async () => {
		const workflow = renderWorkflow();
		const restoreResponse: ResolveURLResponse = {
			longUrl: "https://public.example.com/sub?data=restore-only",
			restoreStatus: "replayable",
			stage1Input: {
				landingRawText: "ss://restored-landing",
				transitRawText: "https://example.com/restored-transit.txt",
				forwardRelayItems: [],
				advancedOptions: {
					emoji: true,
					udp: true,
					skipCertVerify: null,
					config: null,
					include: null,
					exclude: null,
				},
			},
			stage2Snapshot: {
				rows: [
					{
						landingNodeName: "landing-hk",
						mode: "chain",
						targetName: "HK Relay Group",
					},
				],
			},
			messages: [
				{ level: "info", code: "RESTORE_METADATA_READY", message: "已读取恢复快照" },
			],
			blockingErrors: [],
		};
		const errorBody: ErrorResponse = {
			messages: [],
			blockingErrors: [
				{
					code: "SUBCONVERTER_UNAVAILABLE",
					message: "subconverter 当前不可用，请稍后重试",
					scope: "global",
					retryable: true,
				},
			],
		};

		mockPostResolveURL.mockResolvedValueOnce(restoreResponse);
		mockPostStage1Convert.mockRejectedValueOnce(buildRequestError(errorBody, 503));

		await updateCurrentLinkInput(workflow, restoreResponse.longUrl);
		await runWorkflowAction(() => workflow.current.handleRestore());

		expect(workflow.current.responseOriginStage).toBe("stage3");
		expect(workflow.current.state.stage1Input).toEqual({
			...restoreResponse.stage1Input,
			advancedOptions: {
				...restoreResponse.stage1Input.advancedOptions,
				enablePortForward: false,
			},
		});
		expect(workflow.current.state.stage2Init).toBeNull();
		expect(workflow.current.state.stage2Snapshot).toEqual(restoreResponse.stage2Snapshot);
		expect(workflow.current.state.generatedUrls).toEqual({
			longUrl: restoreResponse.longUrl,
			shortUrl: null,
		});
		expect(workflow.current.state.currentLinkInput).toBe(restoreResponse.longUrl);
		expect(workflow.current.state.restoreStatus).toBe("replayable");
		expect(workflow.current.state.stage2Stale).toBe(true);
		expect(workflow.current.state.messages).toEqual(restoreResponse.messages);
		expect(workflow.current.state.blockingErrors).toEqual(errorBody.blockingErrors);
		expect(workflow.current.workflowLog.map((entry) => entry.code)).toEqual([
			"RESTORE_STARTED",
			"RESTORE_METADATA_READY",
			"RESTORE_REINIT_FAILED",
		]);
	});

	it("stores a long URL when generate succeeds without requiring a short URL", async () => {
		const workflow = renderWorkflow();
		const { stage1Input } = await initializeStage2ReadyState(workflow);
		const generateResponse = buildGenerateResponse(
			"https://public.example.com/sub?data=generated-long-url",
			[{ level: "info", code: "GENERATE_METADATA_READY", message: "已生成完整长链接" }],
		);

		mockPostGenerate.mockResolvedValueOnce(generateResponse);

		await runWorkflowAction(() => workflow.current.handleGenerate());

		expect(mockPostGenerate).toHaveBeenCalledWith({
			stage1Input: toStage1InputPayload(stage1Input),
			stage2Snapshot: {
				rows: [
					{
						landingNodeName: "landing-hk",
						mode: "none",
						targetName: null,
					},
				],
			},
		});
		expect(workflow.current.state.generatedUrls).toEqual({
			longUrl: generateResponse.longUrl,
			shortUrl: null,
		});
		expect(workflow.current.state.currentLinkInput).toBe(generateResponse.longUrl);
		expect(workflow.current.state.preferShortUrl).toBe(false);
		expect(workflow.current.responseOriginStage).toBe("stage2");
		expect(workflow.current.state.messages).toEqual(generateResponse.messages);
		expect(workflow.current.state.blockingErrors).toEqual([]);
		expect(workflow.current.workflowLog.map((entry) => entry.code).slice(-3)).toEqual([
			"GENERATE_STARTED",
			"GENERATE_METADATA_READY",
			"GENERATE_SUCCEEDED",
		]);
	});

	it("surfaces Stage 2 blocking errors when generate fails", async () => {
		const workflow = renderWorkflow();
		await initializeStage2ReadyState(workflow);
		const errorBody: ErrorResponse = {
			messages: [
				{ level: "warning", code: "TARGET_SELECTION_REQUIRED", message: "请先完成目标配置" },
			],
			blockingErrors: [
				{
					code: "MISSING_TARGET",
					message: "存在未完成配置的行",
					scope: "stage2_row",
					context: { landingNodeName: "landing-hk", field: "targetName" },
				},
			],
		};

		mockPostGenerate.mockRejectedValueOnce(buildRequestError(errorBody, 422, "/api/generate"));

		await runWorkflowAction(() => workflow.current.handleGenerate());

		expect(workflow.current.responseOriginStage).toBe("stage2");
		expect(workflow.current.state.generatedUrls).toBeNull();
		expect(workflow.current.state.messages).toEqual(errorBody.messages);
		expect(workflow.current.state.blockingErrors).toEqual(errorBody.blockingErrors);
		expect(workflow.current.getPrimaryBlockingErrorsForStage("stage2")).toEqual(errorBody.blockingErrors);
		expect(workflow.current.workflowLog.map((entry) => entry.code).slice(-3)).toEqual([
			"GENERATE_STARTED",
			"TARGET_SELECTION_REQUIRED",
			"GENERATE_FAILED",
		]);
	});

	it("supports strict row keys so source-row edits do not fan out to derived rows", async () => {
		const workflow = renderWorkflow();
		const stage1Input = buildStage1Input({
			landingRawText: "ss://landing-node",
			transitRawText: "https://example.com/transit.txt",
		});
		const stage2Init: Stage1ConvertResponse["stage2Init"] = {
			availableModes: ["none", "chain", "port_forward"],
			chainTargets: [{ name: "HK Relay Group", kind: "proxy-groups" }],
			forwardRelays: [{ name: "relay.example.com:7443" }],
			rows: [
				{
					rowId: "landing-hk",
					sourceLandingNodeName: "landing-hk",
					proxyName: "landing-hk",
					landingNodeName: "landing-hk",
					landingNodeType: "ss",
					mode: "chain",
					targetName: "HK Relay Group",
				},
			],
		};

		mockPostStage1Convert.mockResolvedValueOnce({
			stage2Init,
			messages: [],
			blockingErrors: [],
		});

		await updateStage1Input(workflow, stage1Input);
		await runWorkflowAction(() => workflow.current.handleStage1Convert());

		const sourceRowKey = getStage2RowStrictKey(workflow.current.stage2Rows[0]);

		act(() => {
			workflow.current.handleCloneStage2Row(sourceRowKey);
		});

		expect(workflow.current.stage2Rows).toHaveLength(2);
		expect(workflow.current.stage2Rows[0]).toMatchObject({
			rowId: "landing-hk",
			proxyName: "landing-hk",
			mode: "chain",
			targetName: "HK Relay Group",
		});
		expect(workflow.current.stage2Rows[1]).toMatchObject({
			sourceLandingNodeName: "landing-hk",
			proxyName: "landing-hk 2",
			mode: "chain",
			targetName: "HK Relay Group",
		});

		act(() => {
			workflow.current.handleModeChange(sourceRowKey, "none");
		});

		expect(workflow.current.stage2Rows[0].mode).toBe("none");
		expect(workflow.current.stage2Rows[0].targetName).toBeNull();
		expect(workflow.current.stage2Rows[1].mode).toBe("chain");
		expect(workflow.current.stage2Rows[1].targetName).toBe("HK Relay Group");

		act(() => {
			workflow.current.handleProxyNameChange(sourceRowKey, "landing-hk renamed");
		});

		expect(workflow.current.stage2Rows[0]).toMatchObject({
			proxyName: "landing-hk renamed",
			landingNodeName: "landing-hk renamed",
		});
		expect(workflow.current.stage2Rows[1]).toMatchObject({
			proxyName: "landing-hk 2",
			landingNodeName: "landing-hk 2",
		});
	});

	it("appends cloned rows to the end of the same source group", async () => {
		const workflow = renderWorkflow();
		const stage1Input = buildStage1Input({
			landingRawText: "ss://landing-node",
			transitRawText: "https://example.com/transit.txt",
		});
		const stage2Init: Stage1ConvertResponse["stage2Init"] = {
			availableModes: ["none", "chain", "port_forward"],
			chainTargets: [{ name: "HK Relay Group", kind: "proxy-groups" }],
			forwardRelays: [{ name: "relay.example.com:7443" }],
			rows: [
				{
					rowId: "landing-hk",
					sourceLandingNodeName: "landing-hk",
					proxyName: "landing-hk",
					landingNodeName: "landing-hk",
					landingNodeType: "ss",
					mode: "chain",
					targetName: "HK Relay Group",
				},
				{
					rowId: "landing-hk-derived-1",
					sourceLandingNodeName: "landing-hk",
					proxyName: "landing-hk 2",
					landingNodeName: "landing-hk 2",
					landingNodeType: "ss",
					mode: "chain",
					targetName: "HK Relay Group",
				},
				{
					rowId: "landing-jp",
					sourceLandingNodeName: "landing-jp",
					proxyName: "landing-jp",
					landingNodeName: "landing-jp",
					landingNodeType: "vmess",
					mode: "none",
					targetName: null,
				},
			],
		};

		mockPostStage1Convert.mockResolvedValueOnce({
			stage2Init,
			messages: [],
			blockingErrors: [],
		});

		await updateStage1Input(workflow, stage1Input);
		await runWorkflowAction(() => workflow.current.handleStage1Convert());

		const sourceRowKey = getStage2RowStrictKey(workflow.current.stage2Rows[0]);

		act(() => {
			workflow.current.handleCloneStage2Row(sourceRowKey);
		});

		expect(workflow.current.stage2Rows.map((row) => row.proxyName)).toEqual([
			"landing-hk",
			"landing-hk 2",
			"landing-hk 3",
			"landing-jp",
		]);
		expect(workflow.current.stage2Rows[2]).toMatchObject({
			sourceLandingNodeName: "landing-hk",
			mode: "chain",
			targetName: "HK Relay Group",
		});
	});

	it("automatically creates and switches to a short URL when the long URL exceeds the public budget", async () => {
		const workflow = renderWorkflow(24);
		await initializeStage2ReadyState(workflow);
		const longUrl = "https://public.example.com/sub?data=this-long-url-exceeds-the-public-budget";
		const shortUrl = "https://public.example.com/s/generated-short";
		const generateResponse = buildGenerateResponse(
			longUrl,
			[{ level: "info", code: "GENERATE_METADATA_READY", message: "已生成完整长链接" }],
		);
		const shortLinkResponse = buildShortLinkResponse(
			longUrl,
			shortUrl,
			[{ level: "info", code: "SHORT_LINK_CREATED", message: "已生成短链接并切换展示" }],
		);

		mockPostGenerate.mockResolvedValueOnce(generateResponse);
		mockPostShortLink.mockResolvedValueOnce(shortLinkResponse);

		await runWorkflowAction(() => workflow.current.handleGenerate());

		expect(mockPostShortLink).toHaveBeenCalledWith(longUrl);
		expect(workflow.current.state.preferShortUrl).toBe(true);
		expect(workflow.current.state.generatedUrls).toEqual({
			longUrl,
			shortUrl,
		});
		expect(workflow.current.state.currentLinkInput).toBe(shortUrl);
		expect(workflow.current.responseOriginStage).toBe("stage2");
		expect(workflow.current.state.messages).toEqual([
			...generateResponse.messages,
			...shortLinkResponse.messages,
		]);
		expect(workflow.current.workflowLog.map((entry) => entry.code).slice(-4)).toEqual([
			"GENERATE_STARTED",
			"GENERATE_METADATA_READY",
			"SHORT_LINK_CREATED",
			"SHORT_URL_READY",
		]);
	});

	it("creates a short URL on demand for an existing long URL", async () => {
		const workflow = renderWorkflow();
		await initializeStage2ReadyState(workflow);
		const longUrl = "https://public.example.com/sub?data=generated-long-url";
		const shortUrl = "https://public.example.com/s/manual-short";
		const generateResponse = buildGenerateResponse(longUrl);
		const shortLinkResponse = buildShortLinkResponse(
			longUrl,
			shortUrl,
			[{ level: "info", code: "SHORT_LINK_CREATED", message: "已为当前长链接生成短链接" }],
		);

		mockPostGenerate.mockResolvedValueOnce(generateResponse);
		await runWorkflowAction(() => workflow.current.handleGenerate());

		expect(workflow.current.state.generatedUrls).toEqual({
			longUrl,
			shortUrl: null,
		});
		expect(workflow.current.state.currentLinkInput).toBe(longUrl);

		mockPostShortLink.mockResolvedValueOnce(shortLinkResponse);

		await runWorkflowAction(() => workflow.current.handlePreferShortUrl(true));

		expect(mockPostShortLink).toHaveBeenCalledWith(longUrl);
		expect(workflow.current.state.preferShortUrl).toBe(true);
		expect(workflow.current.state.generatedUrls).toEqual({
			longUrl,
			shortUrl,
		});
		expect(workflow.current.state.currentLinkInput).toBe(shortUrl);
		expect(workflow.current.responseOriginStage).toBe("stage3");
		expect(workflow.current.state.messages).toEqual(shortLinkResponse.messages);
		expect(workflow.current.state.blockingErrors).toEqual([]);
		expect(workflow.current.workflowLog.map((entry) => entry.code).slice(-3)).toEqual([
			"SHORT_URL_STARTED",
			"SHORT_LINK_CREATED",
			"SHORT_URL_READY",
		]);
	});

	it("marks Stage 3 as expired after Stage 2 edits invalidate a generated link", async () => {
		const workflow = renderWorkflow();
		await initializeStage2ReadyState(workflow);
		const sourceRowKey = getStage2RowStrictKey(workflow.current.stage2Rows[0]);
		const longUrl = "https://public.example.com/sub?data=generated-long-url";

		mockPostGenerate.mockResolvedValueOnce(buildGenerateResponse(longUrl));

		await runWorkflowAction(() => workflow.current.handleGenerate());

		expect(workflow.current.stage3Status).toEqual({
			label: "Long URL Ready",
			tone: "success",
		});

		act(() => {
			workflow.current.handleModeChange(sourceRowKey, "chain");
		});

		expect(workflow.current.state.generatedUrls).toBeNull();
		expect(workflow.current.state.stage3Expired).toBe(true);
		expect(workflow.current.state.currentLinkInput).toBe(longUrl);
		expect(workflow.current.stage3Status).toEqual({
			label: "Expired",
			tone: "warning",
		});
	});

	it("keeps the generated long URL when optional short-link creation fails during generate", async () => {
		const workflow = renderWorkflow();
		await initializeStage2ReadyState(workflow);
		const longUrl = "https://public.example.com/sub?data=generated-long-url";
		const generateResponse = buildGenerateResponse(
			longUrl,
			[{ level: "info", code: "GENERATE_METADATA_READY", message: "已生成完整长链接" }],
		);
		const errorBody: ErrorResponse = {
			messages: [
				{ level: "warning", code: "SHORT_LINK_RETRYABLE", message: "短链接服务暂时繁忙，请稍后重试" },
			],
			blockingErrors: [
				{
					code: "RATE_LIMITED",
					message: "短链接服务请求过于频繁，请稍后再试",
					scope: "stage3_action",
					context: { action: "createShortUrl" },
					retryable: true,
				},
			],
		};

		await runWorkflowAction(() => workflow.current.handlePreferShortUrl(true));
		mockPostGenerate.mockResolvedValueOnce(generateResponse);
		mockPostShortLink.mockRejectedValueOnce(buildRequestError(errorBody, 429, "/api/short-links"));

		await runWorkflowAction(() => workflow.current.handleGenerate());

		expect(workflow.current.state.preferShortUrl).toBe(false);
		expect(workflow.current.state.generatedUrls).toEqual({
			longUrl,
			shortUrl: null,
		});
		expect(workflow.current.state.currentLinkInput).toBe(longUrl);
		expect(workflow.current.responseOriginStage).toBe("stage3");
		expect(workflow.current.state.messages).toEqual([
			...generateResponse.messages,
			...errorBody.messages,
		]);
		expect(workflow.current.state.blockingErrors).toEqual(errorBody.blockingErrors);
		expect(workflow.current.workflowLog.map((entry) => entry.code).slice(-4)).toEqual([
			"GENERATE_STARTED",
			"GENERATE_METADATA_READY",
			"SHORT_LINK_RETRYABLE",
			"SHORT_URL_FAILED",
		]);
	});

	it("leaves no generated URL when forced short-link creation fails during generate", async () => {
		const workflow = renderWorkflow(24);
		await initializeStage2ReadyState(workflow);
		const longUrl = "https://public.example.com/sub?data=this-long-url-exceeds-the-public-budget";
		const generateResponse = buildGenerateResponse(
			longUrl,
			[{ level: "info", code: "GENERATE_METADATA_READY", message: "已生成完整长链接" }],
		);
		const errorBody: ErrorResponse = {
			messages: [
				{ level: "warning", code: "SHORT_LINK_REQUIRED_RETRY", message: "短链接服务暂时不可用，稍后可重试" },
			],
			blockingErrors: [
				{
					code: "SUBCONVERTER_UNAVAILABLE",
					message: "短链接服务当前不可用，请稍后重试",
					scope: "global",
					retryable: true,
				},
			],
		};

		mockPostGenerate.mockResolvedValueOnce(generateResponse);
		mockPostShortLink.mockRejectedValueOnce(buildRequestError(errorBody, 503, "/api/short-links"));

		await runWorkflowAction(() => workflow.current.handleGenerate());

		expect(workflow.current.state.preferShortUrl).toBe(true);
		expect(workflow.current.state.generatedUrls).toBeNull();
		expect(workflow.current.responseOriginStage).toBe("stage3");
		expect(workflow.current.state.messages).toEqual([
			...generateResponse.messages,
			...errorBody.messages,
		]);
		expect(workflow.current.state.blockingErrors).toEqual(errorBody.blockingErrors);
		expect(workflow.current.workflowLog.map((entry) => entry.code).slice(-4)).toEqual([
			"GENERATE_STARTED",
			"GENERATE_METADATA_READY",
			"SHORT_LINK_REQUIRED_RETRY",
			"SHORT_URL_REQUIRED_FAILED",
		]);
	});

	it("restores the long URL preference when on-demand short-link creation fails", async () => {
		const workflow = renderWorkflow();
		await initializeStage2ReadyState(workflow);
		const longUrl = "https://public.example.com/sub?data=generated-long-url";
		const generateResponse = buildGenerateResponse(longUrl);
		const errorBody: ErrorResponse = {
			messages: [
				{ level: "warning", code: "SHORT_LINK_RETRYABLE", message: "短链接服务暂时繁忙，请稍后重试" },
			],
			blockingErrors: [
				{
					code: "RATE_LIMITED",
					message: "短链接服务请求过于频繁，请稍后再试",
					scope: "stage3_action",
					context: { action: "createShortUrl" },
					retryable: true,
				},
			],
		};

		mockPostGenerate.mockResolvedValueOnce(generateResponse);
		await runWorkflowAction(() => workflow.current.handleGenerate());

		mockPostShortLink.mockRejectedValueOnce(buildRequestError(errorBody, 429, "/api/short-links"));

		await runWorkflowAction(() => workflow.current.handlePreferShortUrl(true));

		expect(workflow.current.state.preferShortUrl).toBe(false);
		expect(workflow.current.state.generatedUrls).toEqual({
			longUrl,
			shortUrl: null,
		});
		expect(workflow.current.state.currentLinkInput).toBe(longUrl);
		expect(workflow.current.responseOriginStage).toBe("stage3");
		expect(workflow.current.state.messages).toEqual(errorBody.messages);
		expect(workflow.current.state.blockingErrors).toEqual(errorBody.blockingErrors);
		expect(workflow.current.workflowLog.map((entry) => entry.code).slice(-3)).toEqual([
			"SHORT_URL_STARTED",
			"SHORT_LINK_RETRYABLE",
			"SHORT_URL_FAILED",
		]);
	});

	it("does not allow switching back to the long URL when it exceeds the public budget", async () => {
		const workflow = renderWorkflow(24);
		await initializeStage2ReadyState(workflow);
		const longUrl = "https://public.example.com/sub?data=this-long-url-exceeds-the-public-budget";
		const shortUrl = "https://public.example.com/s/generated-short";
		const generateResponse = buildGenerateResponse(longUrl);
		const shortLinkResponse = buildShortLinkResponse(longUrl, shortUrl);

		mockPostGenerate.mockResolvedValueOnce(generateResponse);
		mockPostShortLink.mockResolvedValueOnce(shortLinkResponse);

		await runWorkflowAction(() => workflow.current.handleGenerate());
		await runWorkflowAction(() => workflow.current.handlePreferShortUrl(false));

		expect(workflow.current.state.preferShortUrl).toBe(true);
		expect(workflow.current.state.currentLinkInput).toBe(shortUrl);
		expect(workflow.current.workflowLog.map((entry) => entry.code).at(-1)).toBe("SHORT_URL_REQUIRED");
	});
});