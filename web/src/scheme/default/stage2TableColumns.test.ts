import { describe, expect, it } from "vitest";

import {
	columnWidthsToPercentCssVars,
	columnWidthsToPxCssVars,
	distributeStage2ColumnWidths,
	STAGE2_LANDING_EDITABLE_EXTRA_PX,
	STAGE2_LANDING_RENDERING_SAFETY_PX,
	measureStage2ColumnMins,
	resolveStage2ColumnWidthsPx,
	STAGE2_CELL_PADDING_X_PX,
	STAGE2_MODE_EXTRA_PX,
	STAGE2_TARGET_TRIGGER_EXTRA_PX,
	columnWidthsToFitCssVars,
	resolveStage2ColumnCssVars,
	stage2NeedsHorizontalScroll,
} from "./stage2TableColumns";

function fixedMeasurer(widths: Record<string, number>) {
	return (text: string) => widths[text] ?? text.length * 8;
}

describe("measureStage2ColumnMins", () => {
	it("uses the widest string per column including headers", () => {
		const mins = measureStage2ColumnMins({
			headers: ["落地节点", "类型", "配置方式", "目标"],
			rows: [
				{
					proxyName: "very-long-landing-node-name",
					landingNodeType: "SS",
					modeOptionLabels: ["链式代理", "端口转发（不推荐）"],
					targetLabel: "relay-a.example.com:7443",
				},
			],
			measureText: fixedMeasurer({
				落地节点: 60,
				类型: 40,
				配置方式: 50,
				目标: 45,
				"very-long-landing-node-name": 220,
				SS: 30,
				链式代理: 70,
				"端口转发（不推荐）": 160,
				"relay-a.example.com:7443": 180,
			}),
			cellPaddingX: STAGE2_CELL_PADDING_X_PX,
			modeExtraPx: STAGE2_MODE_EXTRA_PX,
		});

		expect(mins[0]).toBe(
			220 + STAGE2_CELL_PADDING_X_PX + STAGE2_LANDING_EDITABLE_EXTRA_PX + STAGE2_LANDING_RENDERING_SAFETY_PX,
		);
		expect(mins[1]).toBe(40 + STAGE2_CELL_PADDING_X_PX);
		expect(mins[2]).toBe(160 + STAGE2_CELL_PADDING_X_PX + STAGE2_MODE_EXTRA_PX + STAGE2_TARGET_TRIGGER_EXTRA_PX);
		expect(mins[3]).toBe(180 + STAGE2_CELL_PADDING_X_PX + STAGE2_TARGET_TRIGGER_EXTRA_PX);
	});

	it("includes target menu option labels when computing target column minimum", () => {
		const withoutOptions = measureStage2ColumnMins({
			headers: ["落地节点", "类型", "配置方式", "目标"],
			rows: [
				{
					proxyName: "landing-node",
					landingNodeType: "SS",
					modeOptionLabels: ["链式代理"],
					targetLabel: "HK",
				},
			],
			measureText: fixedMeasurer({
				落地节点: 60,
				类型: 40,
				配置方式: 50,
				目标: 45,
				"node-a": 80,
				SS: 30,
				链式代理: 70,
				HK: 40,
			}),
		});
		const withOptions = measureStage2ColumnMins({
			headers: ["落地节点", "类型", "配置方式", "目标"],
			rows: [
				{
					proxyName: "landing-node",
					landingNodeType: "SS",
					modeOptionLabels: ["链式代理"],
					targetLabel: "HK",
					targetOptionLabels: ["🇭🇰 香港节点 relay group with a very long label"],
				},
			],
			measureText: fixedMeasurer({
				落地节点: 60,
				类型: 40,
				配置方式: 50,
				目标: 45,
				"node-a": 80,
				SS: 30,
				链式代理: 70,
				HK: 40,
				"🇭🇰 香港节点 relay group with a very long label": 320,
			}),
		});

		expect(withOptions[3]).toBeGreaterThan(withoutOptions[3]);
	});
});

describe("distributeStage2ColumnWidths", () => {
	it("returns mins when the container is narrower than total minimum", () => {
		const mins: [number, number, number, number] = [200, 80, 120, 240];
		expect(distributeStage2ColumnWidths(500, mins)).toEqual(mins);
	});

	it("does not squeeze the landing column below its real minimum just to satisfy the soft cap", () => {
		const mins: [number, number, number, number] = [420, 80, 120, 200];
		const widths = distributeStage2ColumnWidths(900, mins, [1, 1, 1, 1], 342);
		expect(widths[0]).toBeGreaterThanOrEqual(420);
		expect(widths.reduce((sum, value) => sum + value, 0)).toBe(900);
	});

	it("allocates slack evenly when weights are 1:1:1:1 if the landing column is already wider than the soft cap", () => {
		const mins: [number, number, number, number] = [400, 80, 120, 200];
		const widths = distributeStage2ColumnWidths(1000, mins, [1, 1, 1, 1], 380);
		expect(widths[0]).toBe(450);
		expect(widths[1]).toBe(130);
		expect(widths[2]).toBe(170);
		expect(widths[3]).toBe(250);
		expect(widths.reduce((sum, value) => sum + value, 0)).toBe(1000);
	});
});

describe("resolveStage2ColumnWidthsPx", () => {
	it("keeps uncapped content minimums when the container is too narrow", () => {
		const input = {
			headers: ["落地节点", "类型", "配置方式", "目标"] as const,
			rows: [
				{
					proxyName: "landing-node",
					landingNodeType: "SS",
					modeOptionLabels: ["链式代理"],
					targetLabel: "relay-a.example.com:7443",
				},
			],
			measureText: fixedMeasurer({
				落地节点: 60,
				类型: 40,
				配置方式: 50,
				目标: 45,
				"long-name": 320,
				SS: 30,
				链式代理: 70,
				"relay-a.example.com:7443": 260,
			}),
		};
		const measured = measureStage2ColumnMins(input);
		expect(resolveStage2ColumnWidthsPx(500, input)).toEqual(measured);
		expect(measured.reduce((sum, value) => sum + value, 0)).toBeGreaterThan(500);
	});
});

describe("columnWidthsToPxCssVars", () => {
	it("emits pixel column widths and table min-width for horizontal scroll", () => {
		const vars = columnWidthsToPxCssVars([250, 50, 150, 550]);
		expect(vars["--s2-col-1"]).toBe("250px");
		expect(vars["--s2-col-4"]).toBe("550px");
		expect(vars["--s2-table-min-width"]).toBe("1000px");
	});
});

describe("columnWidthsToPercentCssVars", () => {
	it("normalizes pixel widths to percentages that sum to 100%", () => {
		const vars = columnWidthsToPercentCssVars([250, 50, 150, 550]);
		expect(vars["--s2-col-1"]).toBe("25%");
		expect(vars["--s2-col-2"]).toBe("5%");
		expect(vars["--s2-col-3"]).toBe("15%");
		expect(vars["--s2-col-4"]).toBe("55%");
	});
});

describe("columnWidthsToFitCssVars", () => {
	it("uses percentage columns and zero min-width when content fits the container", () => {
		const vars = columnWidthsToFitCssVars([250, 50, 150, 550]);
		expect(vars["--s2-col-1"]).toBe("25%");
		expect(vars["--s2-table-min-width"]).toBe("0px");
	});
});

describe("resolveStage2ColumnCssVars", () => {
	const measureInput = {
		headers: ["落地节点", "类型", "配置方式", "目标"] as const,
		rows: [
			{
				proxyName: "landing-node",
				landingNodeType: "SS",
				modeOptionLabels: ["链式代理"],
				targetLabel: "group-a",
			},
		],
		measureText: fixedMeasurer({
			落地节点: 60,
			类型: 40,
			配置方式: 50,
			目标: 45,
			"node-a": 120,
			SS: 30,
			链式代理: 70,
			"group-a": 90,
		}),
	};

	it("emits fit layout vars when the container is wide enough", () => {
		expect(stage2NeedsHorizontalScroll(2000, measureInput)).toBe(false);
		const vars = resolveStage2ColumnCssVars(2000, measureInput);
		expect(vars["--s2-table-min-width"]).not.toBe("0px");
		expect(vars["--s2-col-1"]).toMatch(/px$/);
	});

	it("emits scroll layout vars when content minimums exceed the container", () => {
		expect(stage2NeedsHorizontalScroll(500, measureInput)).toBe(true);
		const vars = resolveStage2ColumnCssVars(500, measureInput);
		expect(vars["--s2-table-min-width"]).not.toBe("0px");
		expect(vars["--s2-col-1"]).toMatch(/px$/);
	});
});
