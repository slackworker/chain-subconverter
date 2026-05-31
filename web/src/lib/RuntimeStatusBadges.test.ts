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
import { resolveStorageBadgeState, RuntimeStatusBadges } from "./RuntimeStatusBadges";

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
			releaseTag: "v1.2.3",
			imageTag: "beta-latest",
			revision: "86922c3deadbeef86922c3deadbeef86922c3d",
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
	it("loads runtime status on mount and shows app version in the footer credit tooltip", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(buildStatus());

		const container = renderBadges();
		await flushEffects();
		const credit = container.querySelector(".a-footer__credit");
		if (!(credit instanceof HTMLParagraphElement)) {
			throw new Error("footer credit element not found");
		}

		expect(mockGetRuntimeStatus).toHaveBeenCalledWith(false);
		expect(container.textContent).toContain("Chain Subconverter - v1.2.3 © 2026");
		expect(credit.title).toContain("App: v1.2.3");
		expect(credit.title).toContain("SHA: 86922c3deadbeef86922c3deadbeef86922c3d");
		expect(container.textContent).toContain("42ms");
		expect(container.textContent).toContain("1/1000");
	});

	it("refreshes runtime status on hover and focus intent", async () => {
		mockGetRuntimeStatus
			.mockResolvedValueOnce(buildStatus({ subconverter: { healthy: true, latencyMs: 42 } }))
			.mockResolvedValueOnce(buildStatus({ subconverter: { healthy: true, latencyMs: 84 } }))
			.mockResolvedValueOnce(buildStatus({ subconverter: { healthy: true, latencyMs: 126 } }));

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

	it("shows storage badge state by usage", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(
			buildStatus({ storage: { mode: "persistent", used: 15, capacity: 1000 } }),
		);

		const container = renderBadges({ locale: "zh" });
		await flushEffects();

		const storageBadge = container.querySelector('[aria-label="短链存储"]');
		expect(storageBadge?.className).toContain("a-runtime-status__badge--ok");
		expect(storageBadge?.querySelector(".a-runtime-status__dot--ok")).not.toBeNull();
	});

	it("shows warn storage badge when at capacity (LRU active)", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(
			buildStatus({ storage: { mode: "persistent", used: 1000, capacity: 1000 } }),
		);

		const container = renderBadges();
		await flushEffects();

		const storageBadge = container.querySelector('[aria-label="Short links"]');
		expect(storageBadge?.className).toContain("a-runtime-status__badge--warn");
		expect(storageBadge?.querySelector(".a-runtime-status__dot--warn")).not.toBeNull();
	});

	it("shows error storage badge when used exceeds capacity", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(
			buildStatus({ storage: { mode: "persistent", used: 1001, capacity: 1000 } }),
		);

		const container = renderBadges();
		await flushEffects();

		const storageBadge = container.querySelector('[aria-label="Short links"]');
		expect(storageBadge?.className).toContain("a-runtime-status__badge--error");
		expect(storageBadge?.querySelector(".a-runtime-status__dot--error")).not.toBeNull();
	});
});

describe("resolveStorageBadgeState", () => {
	it("maps usage to ok, warn, and error", () => {
		expect(resolveStorageBadgeState(15, 1000)).toBe("ok");
		expect(resolveStorageBadgeState(999, 1000)).toBe("ok");
		expect(resolveStorageBadgeState(1000, 1000)).toBe("warn");
		expect(resolveStorageBadgeState(1001, 1000)).toBe("error");
	});
});