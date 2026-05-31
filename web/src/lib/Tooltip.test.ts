import { act, createElement } from "react";
import { createRoot } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Tooltip } from "./Tooltip";

declare global {
	var IS_REACT_ACT_ENVIRONMENT: boolean | undefined;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const cleanups: Array<() => void> = [];

beforeEach(() => {
	vi.useFakeTimers();
});

afterEach(() => {
	vi.useRealTimers();
	while (cleanups.length > 0) {
		cleanups.pop()?.();
	}
});

function mountTooltip(content: string) {
	const shell = document.createElement("div");
	shell.className = "a-shell";
	document.body.appendChild(shell);

	const container = document.createElement("div");
	shell.appendChild(container);

	const root = createRoot(container);
	act(() => {
		root.render(
			createElement(Tooltip, {
				content,
				showDelay: 0,
				children: createElement("button", { type: "button" }, "trigger"),
			}),
		);
	});

	cleanups.push(() => {
		act(() => {
			root.unmount();
		});
		shell.remove();
	});

	return shell.querySelector("button") as HTMLButtonElement;
}

describe("Tooltip", () => {
	it("shows tooltip content on hover", () => {
		const trigger = mountTooltip("mode warning text");

		act(() => {
			trigger.focus();
		});

		const tooltip = document.body.querySelector(".cs-tooltip");
		expect(tooltip).not.toBeNull();
		expect(tooltip?.textContent).toBe("mode warning text");
		expect(tooltip?.getAttribute("role")).toBe("tooltip");
	});

	it("hides tooltip after focus leaves trigger", () => {
		const trigger = mountTooltip("hide me");

		act(() => {
			trigger.focus();
		});
		expect(document.body.querySelector(".cs-tooltip")).not.toBeNull();

		act(() => {
			trigger.blur();
			vi.advanceTimersByTime(80);
		});

		expect(document.body.querySelector(".cs-tooltip")).toBeNull();
	});

	it("portals into .a-shell so theme variables apply", () => {
		const trigger = mountTooltip("inside shell");

		act(() => {
			trigger.focus();
		});

		const shell = document.body.querySelector(".a-shell");
		const tooltip = shell?.querySelector(".cs-tooltip");
		expect(tooltip).not.toBeNull();
	});
});
