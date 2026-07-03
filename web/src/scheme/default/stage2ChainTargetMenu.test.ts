import { describe, expect, it } from "vitest";

import {
	computeChainTargetMenuPanelLayout,
	measureTargetMenuPanelContentWidth,
	MEMBER_ORDER_PANEL_MIN_WIDTH,
} from "./stage2ChainTargetMenu";

function mockTrigger(rect: Partial<DOMRect>): HTMLButtonElement {
	return {
		getBoundingClientRect: () =>
			({
				top: 0,
				left: 0,
				bottom: 24,
				right: 120,
				width: 120,
				height: 24,
				x: 0,
				y: 0,
				toJSON: () => ({}),
				...rect,
			}) as DOMRect,
	} as HTMLButtonElement;
}

describe("computeChainTargetMenuPanelLayout", () => {
	it("expands member-order panel to content width when viewport allows", () => {
		const trigger = mockTrigger({ left: 40, width: 96 });
		const layout = computeChainTargetMenuPanelLayout(trigger, {
			minWidth: MEMBER_ORDER_PANEL_MIN_WIDTH,
			contentWidth: 420,
		});

		expect(layout.width).toBe(420);
		expect(layout.contentOverflows).toBe(false);
	});

	it("caps member-order panel at viewport and flags horizontal overflow", () => {
		const trigger = mockTrigger({ left: 8, width: 96 });
		const layout = computeChainTargetMenuPanelLayout(trigger, {
			minWidth: MEMBER_ORDER_PANEL_MIN_WIDTH,
			contentWidth: 2000,
		});

		expect(layout.width).toBe(layout.maxPanelWidth);
		expect(layout.contentOverflows).toBe(true);
	});
});

describe("measureTargetMenuPanelContentWidth", () => {
	it("reads scrollWidth while panel width is max-content", () => {
		const panel = document.createElement("div");
		Object.defineProperty(panel, "scrollWidth", {
			configurable: true,
			get() {
				return panel.style.width === "max-content" ? 360 : 120;
			},
		});
		panel.style.width = "120px";

		expect(measureTargetMenuPanelContentWidth(panel)).toBe(360);
		expect(panel.style.width).toBe("120px");
	});
});
