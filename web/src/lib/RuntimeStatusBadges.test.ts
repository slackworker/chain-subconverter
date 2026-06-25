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
import {
	resolveStorageBadgeState,
	resolveSubconverterBadgeState,
	RuntimeStatusBadges,
} from "./RuntimeStatusBadges";

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

function buildStatus(overrides: {
	app?: Partial<RuntimeStatusResponse["app"]>;
	subconverter?: Partial<RuntimeStatusResponse["subconverter"]>;
	storage?: Partial<RuntimeStatusResponse["storage"]>;
} = {}): RuntimeStatusResponse {
	return {
		app: {
			version: "v1.2.3",
			releaseTag: "v1.2.3",
			imageTag: "beta-latest",
			revision: "86922c3deadbeef86922c3deadbeef86922c3d",
			imageDigest: "sha256:eeff0ea63c5d5f23e3605e69486922af7b75fe02ce3ae3abe7af906605ed3c24",
			...overrides.app,
		},
		subconverter: {
			healthy: true,
			networkScope: "internal",
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
	it("loads runtime status on mount and shows build metadata in the footer credit tooltip", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(buildStatus());

		const container = renderBadges();
		await flushEffects();
		const credit = container.querySelector(".a-footer__credit");
		if (!(credit instanceof HTMLParagraphElement)) {
			throw new Error("footer credit element not found");
		}

		expect(mockGetRuntimeStatus).toHaveBeenCalledWith(false);
		expect(container.textContent).toContain("Chain Subconverter - v1.2.3 © 2026");
		expect(credit.title).toBe(
			"Release tag: v1.2.3 · Image tag: beta-latest · Revision: 86922c3deadb · Image digest: sha256:eeff0ea63c5d5f23e3605e69486922af7b75fe02ce3ae3abe7af906605ed3c24",
		);
		expect(credit.title).not.toContain("SHA:");
		expect(container.textContent).toContain("42ms");
		expect(container.textContent).toContain("1/1000");

		const subconverterBadge = container.querySelector('[aria-label="Subconverter"]');
		expect(subconverterBadge?.getAttribute("title")).toBe("Subconverter: internal network · subconverter v0.9.1");
		expect(subconverterBadge?.getAttribute("title")).not.toContain("42ms");
		expect(subconverterBadge?.getAttribute("title")).not.toContain("healthy");

		const storageBadge = container.querySelector('[aria-label="Short links"]');
		expect(storageBadge?.getAttribute("title")).toBe("Short links: temporary");
	});

	it("localizes storage mode tooltip in Chinese", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(
			buildStatus({ storage: { mode: "persistent", used: 15, capacity: 1000 } }),
		);

		const container = renderBadges({ locale: "zh" });
		await flushEffects();

		const storageBadge = container.querySelector('[aria-label="短链存储"]');
		expect(storageBadge?.getAttribute("title")).toBe("短链存储: 持久化");
	});

	it("still shows other build metadata when image digest is unavailable", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(buildStatus({ app: { imageDigest: undefined } }));

		const container = renderBadges();
		await flushEffects();
		const credit = container.querySelector(".a-footer__credit");
		if (!(credit instanceof HTMLParagraphElement)) {
			throw new Error("footer credit element not found");
		}

		expect(credit.title).toBe("Release tag: v1.2.3 · Image tag: beta-latest · Revision: 86922c3deadb");
	});

	it("keeps footer credit unchanged before runtime status is loaded", () => {
		mockGetRuntimeStatus.mockImplementation(() => new Promise(() => {}));
		const container = renderBadges();
		expect(container.textContent).toContain("Chain Subconverter © 2026");
		expect(container.textContent).not.toContain("Chain Subconverter - … © 2026");
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

	it("shows ok subconverter badge when latency is 10ms or less", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(
			buildStatus({ subconverter: { healthy: true, networkScope: "internal", latencyMs: 8 } }),
		);

		const container = renderBadges({ locale: "zh" });
		await flushEffects();

		const subconverterBadge = container.querySelector('[aria-label="Subconverter"]');
		expect(subconverterBadge?.className).toContain("a-runtime-status__badge--ok");
		expect(subconverterBadge?.querySelector(".a-runtime-status__dot--ok")).not.toBeNull();
		expect(subconverterBadge?.getAttribute("title")).toContain("内部网络");
	});

	it("shows warn subconverter badge when latency exceeds 10ms", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(
			buildStatus({ subconverter: { healthy: true, networkScope: "cross_network", latencyMs: 88 } }),
		);

		const container = renderBadges();
		await flushEffects();

		const subconverterBadge = container.querySelector('[aria-label="Subconverter"]');
		expect(subconverterBadge?.className).toContain("a-runtime-status__badge--warn");
		expect(subconverterBadge?.querySelector(".a-runtime-status__dot--warn")).not.toBeNull();
		expect(subconverterBadge?.getAttribute("title")).toContain("cross-network");
	});

	it("shows error subconverter badge when the service is unavailable", async () => {
		mockGetRuntimeStatus.mockResolvedValueOnce(
			buildStatus({ subconverter: { healthy: false, networkScope: "internal", error: "upstream connection refused" } }),
		);

		const container = renderBadges();
		await flushEffects();

		const subconverterBadge = container.querySelector('[aria-label="Subconverter"]');
		expect(subconverterBadge?.className).toContain("a-runtime-status__badge--error");
		expect(subconverterBadge?.querySelector(".a-runtime-status__dot--error")).not.toBeNull();
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

describe("resolveSubconverterBadgeState", () => {
	it("maps latency thresholds and unavailable states", () => {
		expect(resolveSubconverterBadgeState(buildStatus().subconverter)).toBe("warn");
		expect(
			resolveSubconverterBadgeState(buildStatus({ subconverter: { latencyMs: 10 } }).subconverter),
		).toBe("ok");
		expect(
			resolveSubconverterBadgeState(buildStatus({ subconverter: { latencyMs: 5 } }).subconverter),
		).toBe("ok");
		expect(
			resolveSubconverterBadgeState(
				buildStatus({ subconverter: { networkScope: "cross_network", latencyMs: 5 } }).subconverter,
			),
		).toBe("ok");
		expect(
			resolveSubconverterBadgeState(buildStatus({ subconverter: { healthy: false } }).subconverter),
		).toBe("error");
	});
});