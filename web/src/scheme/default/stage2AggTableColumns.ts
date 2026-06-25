import {
	createCanvasTextMeasurer,
	STAGE2_CELL_PADDING_X_PX,
	STAGE2_LANDING_EDITABLE_EXTRA_PX,
	STAGE2_LANDING_RENDERING_SAFETY_PX,
	STAGE2_MODE_EXTRA_PX,
	STAGE2_TARGET_TRIGGER_EXTRA_PX,
	type TextMeasurer,
} from "./stage2TableColumns";

export const STAGE2_AGG_COLUMN_COUNT = 5;

export const STAGE2_AGG_COLUMN_WEIGHTS: readonly [number, number, number, number, number] = [1.2, 0.7, 0.8, 1, 1.2];

export const STAGE2_AGG_COLUMN_FALLBACK_PERCENTS: readonly [string, string, string, string, string] = [
	"30%",
	"12%",
	"10%",
	"18%",
	"30%",
];

/** 聚合/入组列仅保留复选框时的最小占用（约 1rem 控件宽） */
export const STAGE2_AGG_CHECKBOX_EXTRA_PX = 16;

export type Stage2AggColumnWidthsPx = readonly [number, number, number, number, number];

export type Stage2AggColumnMeasureRow = {
	nodeLabel: string;
	landingNodeType: string;
	modeOptionLabels: string[];
	targetLabel: string;
	targetOptionLabels?: readonly string[];
};

export type Stage2AggColumnMeasureInput = {
	headers: readonly [string, string, string, string, string];
	rows: Stage2AggColumnMeasureRow[];
	measureText: TextMeasurer;
	measureLandingText?: TextMeasurer;
	cellPaddingX?: number;
	modeExtraPx?: number;
};

function maxMeasuredWidth(texts: readonly string[], measureText: TextMeasurer): number {
	let max = 0;
	for (const text of texts) {
		const width = measureText(text);
		if (width > max) {
			max = width;
		}
	}
	return Math.ceil(max);
}

function sumWidths(widths: Stage2AggColumnWidthsPx): number {
	return widths[0] + widths[1] + widths[2] + widths[3] + widths[4];
}

export function measureStage2AggColumnMins(input: Stage2AggColumnMeasureInput): Stage2AggColumnWidthsPx {
	const pad = input.cellPaddingX ?? STAGE2_CELL_PADDING_X_PX;
	const modeExtra = input.modeExtraPx ?? STAGE2_MODE_EXTRA_PX;
	const { measureText, measureLandingText = measureText, headers, rows } = input;

	const nodeTexts = [headers[0], ...rows.map((row) => row.nodeLabel)];
	const aggTexts = [headers[1]];
	const typeTexts = [headers[2], ...rows.map((row) => row.landingNodeType)];
	const modeTexts = [headers[3], ...rows.flatMap((row) => row.modeOptionLabels)];
	const targetTexts = [
		headers[4],
		...rows.flatMap((row) => [row.targetLabel, ...(row.targetOptionLabels ?? [])]),
	];

	return [
		maxMeasuredWidth(nodeTexts, measureLandingText)
			+ pad
			+ STAGE2_LANDING_EDITABLE_EXTRA_PX
			+ STAGE2_LANDING_RENDERING_SAFETY_PX,
		maxMeasuredWidth(aggTexts, measureText) + pad + STAGE2_AGG_CHECKBOX_EXTRA_PX,
		maxMeasuredWidth(typeTexts, measureText) + pad,
		maxMeasuredWidth(modeTexts, measureText) + pad + modeExtra + STAGE2_TARGET_TRIGGER_EXTRA_PX,
		maxMeasuredWidth(targetTexts, measureText) + pad + STAGE2_TARGET_TRIGGER_EXTRA_PX,
	];
}

export function distributeStage2AggColumnWidths(
	containerWidth: number,
	mins: Stage2AggColumnWidthsPx,
	weights: readonly [number, number, number, number, number] = STAGE2_AGG_COLUMN_WEIGHTS,
): Stage2AggColumnWidthsPx {
	const baseMins: [number, number, number, number, number] = [...mins];
	const totalMin = sumWidths(baseMins);
	if (containerWidth <= 0 || containerWidth <= totalMin) {
		return baseMins;
	}

	const slack = containerWidth - totalMin;
	const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
	if (totalWeight <= 0) {
		return baseMins;
	}

	const widths: [number, number, number, number, number] = [
		Math.round(baseMins[0] + slack * (weights[0] / totalWeight)),
		Math.round(baseMins[1] + slack * (weights[1] / totalWeight)),
		Math.round(baseMins[2] + slack * (weights[2] / totalWeight)),
		Math.round(baseMins[3] + slack * (weights[3] / totalWeight)),
		Math.round(baseMins[4] + slack * (weights[4] / totalWeight)),
	];
	const drift = containerWidth - sumWidths(widths);
	if (drift !== 0) {
		widths[4] += drift;
	}
	return widths;
}

export function resolveStage2AggColumnWidthsPx(
	containerWidth: number,
	measureInput: Omit<Stage2AggColumnMeasureInput, "measureText"> & { measureText: TextMeasurer },
): Stage2AggColumnWidthsPx {
	const mins = measureStage2AggColumnMins(measureInput);
	const totalMin = sumWidths(mins);
	if (containerWidth <= 0 || containerWidth < totalMin) {
		return mins;
	}
	return distributeStage2AggColumnWidths(containerWidth, mins);
}

export function columnAggWidthsToPxCssVars(widths: Stage2AggColumnWidthsPx): Record<string, string> {
	const total = sumWidths(widths);
	if (total <= 0) {
		return {
			"--s2-col-1": STAGE2_AGG_COLUMN_FALLBACK_PERCENTS[0],
			"--s2-col-2": STAGE2_AGG_COLUMN_FALLBACK_PERCENTS[1],
			"--s2-col-3": STAGE2_AGG_COLUMN_FALLBACK_PERCENTS[2],
			"--s2-col-4": STAGE2_AGG_COLUMN_FALLBACK_PERCENTS[3],
			"--s2-col-5": STAGE2_AGG_COLUMN_FALLBACK_PERCENTS[4],
			"--s2-table-min-width": "0px",
		};
	}

	return {
		"--s2-col-1": `${widths[0]}px`,
		"--s2-col-2": `${widths[1]}px`,
		"--s2-col-3": `${widths[2]}px`,
		"--s2-col-4": `${widths[3]}px`,
		"--s2-col-5": `${widths[4]}px`,
		"--s2-table-min-width": `${total}px`,
	};
}

export function resolveStage2AggColumnCssVars(
	containerWidth: number,
	measureInput: Omit<Stage2AggColumnMeasureInput, "measureText"> & { measureText: TextMeasurer },
): Record<string, string> {
	const widths = resolveStage2AggColumnWidthsPx(containerWidth, measureInput);
	return columnAggWidthsToPxCssVars(widths);
}

export { createCanvasTextMeasurer };
