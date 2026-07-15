import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { Stage1ConvertResponse, Stage2Bundle } from "../types/api";

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

import { postGenerate, postStage1Convert } from "../lib/api";
import { type AppWorkflowViewModel, useAppWorkflow } from "./useAppWorkflow";

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}
globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const stage2: Stage2Bundle = {
	catalog: {
		availableModes: ["none", "chain"],
		chainTargets: [],
		forwardRelays: [],
		servers: [{
			serverKey: "edge",
			sources: [{
				sourceId: "landing",
				landingNodeType: "ss",
				defaultProxyName: "Landing",
				defaultMode: "none",
				defaultTargetName: null,
			}],
		}],
	},
	snapshot: {
		chainProxyTargetGroupSwitchOptimizationEnabled: false,
		servers: [{
			serverKey: "edge",
			aggregation: { enabled: false },
			sources: [{
				sourceId: "landing",
				instances: [{
					instanceId: "landing::i1",
					proxyName: "Landing",
					mode: "none",
					targetName: null,
				}],
			}],
		}],
	},
};

const convertResponse: Stage1ConvertResponse = { stage2, messages: [], blockingErrors: [] };
const cleanups: Array<() => void> = [];

function renderWorkflow() {
	let current: AppWorkflowViewModel | undefined;
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);
	function Harness() {
		current = useAppWorkflow();
		return null;
	}
	act(() => root.render(createElement(Harness)));
	cleanups.push(() => {
		act(() => root.unmount());
		container.remove();
	});
	return { get current() { return current as AppWorkflowViewModel; } };
}

async function convert(workflow: ReturnType<typeof renderWorkflow>) {
	act(() => workflow.current.updateStage1Input((input) => ({ ...input, landingRawText: "ss://landing" })));
	await act(async () => workflow.current.handleStage1Convert());
}

afterEach(() => {
	vi.resetAllMocks();
	while (cleanups.length) cleanups.pop()?.();
});

describe("useAppWorkflow nested API contract", () => {
	it("convert sends only stage1Input and stores the nested bundle", async () => {
		vi.mocked(postStage1Convert).mockResolvedValue(convertResponse);
		const workflow = renderWorkflow();
		await convert(workflow);
		expect(postStage1Convert).toHaveBeenCalledWith({
			stage1Input: expect.objectContaining({ landingRawText: "ss://landing" }),
		});
		expect(workflow.current.stage2Rows[0]).toMatchObject({
			instanceId: "landing::i1",
			sourceId: "landing",
			serverKey: "edge",
		});
	});

	it("generate sends stage2.snapshot and strips disabled aggregation fields", async () => {
		vi.mocked(postStage1Convert).mockResolvedValue(convertResponse);
		vi.mocked(postGenerate).mockResolvedValue({ longUrl: "https://example.test/sub", messages: [], blockingErrors: [] });
		const workflow = renderWorkflow();
		await convert(workflow);
		await act(async () => workflow.current.handleGenerate());
		expect(postGenerate).toHaveBeenCalledWith({
			stage1Input: expect.any(Object),
			stage2: {
				snapshot: expect.objectContaining({
					servers: [expect.objectContaining({ aggregation: { enabled: false } })],
				}),
			},
		});
	});

	it("global reset reconverts and overwrites local instance edits", async () => {
		vi.mocked(postStage1Convert).mockResolvedValue(convertResponse);
		const workflow = renderWorkflow();
		await convert(workflow);
		act(() => workflow.current.handleProxyNameChange("landing::i1", "Custom"));
		expect(workflow.current.stage2Rows[0].proxyName).toBe("Custom");
		await act(async () => workflow.current.handleStage2Reset());
		expect(postStage1Convert).toHaveBeenCalledTimes(2);
		expect(workflow.current.stage2Rows[0].proxyName).toBe("Landing");
	});
});
