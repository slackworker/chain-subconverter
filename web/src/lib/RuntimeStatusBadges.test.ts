import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { RuntimeStatusResponse } from "../types/api";

vi.mock("./api", async () => {
	const actual = await vi.importActual<typeof import("./api")>("./api");
	return {
		...actual,
		getRuntimeStatus: vi.fn(),
	};
});

import { getRuntimeStatus } from "./api";
import { RuntimeStatusBadges } from "./RuntimeStatusBadges";

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const mountedBadgesCleanups: Array<() => void> = [];
const mockGetRuntimeStatus = vi.mocked(getRuntimeStatus);

afterEach(() => {
	vi.resetAllMocks();
	while (mountedBadgesCleanups.length > 0) {
		mountedBadgesCleanups.pop()?.();
	}
});

function buildStatus(overrides: Partial<RuntimeStatusResponse> = {}): RuntimeStatusResponse {
	return {
		app: {
			version: "v1.2.3",
			...overrides.app,
		},
		subconverter: {
			healthy: true,
			latencyMs: 42,
			version: "subconverter v0.9.1",
			lastCheckedAt: "2026-05-29T12:00:00.000000000Z",
			error: undefined,
			...overrides.subconverter,
		},
		storage: {
			mode: "temporary",
			used: 1,
			capacity: 1000,
			...overrides.storage,
		},
	};
}

function renderBadges(props: Partial<Parameters<typeof RuntimeStatusBadges>[0]> = {}) {
	const container = document.createElement("div");
	document.body.appendChild(container);
	const root = createRoot(container);

	act(() => {
		root.render(createElement(RuntimeStatusBadges, {
			locale: "en",
			footerCredit: "Chain Subconverter © 2026",
			...props,
		}));
	});

	mountedBadgesCleanups.push(() => {
		act(() => {
			root.unmount();
		});
		container.remove();
	});

	return container;
}

async function flushEffects() {
	await act(async () => {
		await Promise.resolve();
	});
}

describe("RuntimeStatusBadges", () => {
	it("loads runtime status on mount and shows app version in the footer credit", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(buildStatus());

		const container = renderBadges();
		await flushEffects();

		expect(mockGetRuntimeStatus).toHaveBeenCalledWith(false);
		expect(container.textContent).toContain("Chain Subconverter - v1.2.3 © 2026");
		expect(container.textContent).toContain("42ms");
		expect(container.textContent).toContain("1/1000");
	});

	it("refreshes runtime status on hover and focus intent", async () => {
		mockGetRuntimeStatus
			.mockResolvedValueOnce(buildStatus({ subconverter: { latencyMs: 42 } }))
			.mockResolvedValueOnce(buildStatus({ subconverter: { latencyMs: 84 } }))
			.mockResolvedValueOnce(buildStatus({ subconverter: { latencyMs: 126 } }));

		const container = renderBadges();
		await flushEffects();

		const runtimeStatus = container.querySelector(".a-runtime-status");
		if (!(runtimeStatus instanceof HTMLDivElement)) {
			throw new Error("runtime status element not found");
		}

		act(() => {
			runtimeStatus.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
		});
		await flushEffects();

		act(() => {
			runtimeStatus.focus();
			runtimeStatus.dispatchEvent(new FocusEvent("focus", { bubbles: false }));
		});
		await flushEffects();

		expect(mockGetRuntimeStatus.mock.calls).toEqual([[false], [true], [true]]);
		expect(container.textContent).toContain("126ms");
	});
});