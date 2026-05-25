export const STAGE2_COLUMN_COUNT = 4;

/** 落地 / 类型 / 配置方式 / 目标 */
export const STAGE2_COLUMN_WEIGHTS: readonly [number, number, number, number] = [1, 1, 1, 1];

export const STAGE2_LANDING_MAX_WIDTH_FRACTION = 0.38;

/** 与 `.a-table th, .a-table td` 水平 padding `0.75rem` × 2 对齐（16px 根字号） */
export const STAGE2_CELL_PADDING_X_PX = 24;

/** `.a-mode-warning-slot` 1.25rem + `.a-mode-cell` gap 0.4rem */
export const STAGE2_MODE_EXTRA_PX = 20 + 6;

/** `select.a-select` 右侧自定义下拉箭头区 `padding-right: 1.9rem` */
export const STAGE2_SELECT_EXTRA_PX = 30;

/** 目标列触发器/下拉与 {@link STAGE2_SELECT_EXTRA_PX} 同宽 */
export const STAGE2_TARGET_EXTRA_PX = STAGE2_SELECT_EXTRA_PX;

export const STAGE2_COLUMN_FALLBACK_PERCENTS: readonly [string, string, string, string] = [
	"28%",
	"10%",
	"22%",
	"40%",
];

export type Stage2ColumnWidthsPx = readonly [number, number, number, number];

export type TextMeasurer = (text: string) => number;

export type Stage2ColumnMeasureRow = {
	landingNodeName: string;
	landingNodeType: string;
	modeOptionLabels: string[];
	targetLabel: string;
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

export type Stage2ColumnMeasureInput = {
	headers: readonly [string, string, string, string];
	rows: Stage2ColumnMeasureRow[];
	measureText: TextMeasurer;
	/** 落地节点列（.a-cell-name font-weight: 600） */
	measureLandingText?: TextMeasurer;
	cellPaddingX?: number;
	modeExtraPx?: number;
};

export function measureStage2ColumnMins(input: Stage2ColumnMeasureInput): Stage2ColumnWidthsPx {
	const pad = input.cellPaddingX ?? STAGE2_CELL_PADDING_X_PX;
	const modeExtra = input.modeExtraPx ?? STAGE2_MODE_EXTRA_PX;
	const { measureText, measureLandingText = measureText, headers, rows } = input;

	const landingTexts = [headers[0], ...rows.map((row) => row.landingNodeName)];
	const typeTexts = [headers[1], ...rows.map((row) => row.landingNodeType)];
	const modeTexts = [headers[2], ...rows.flatMap((row) => row.modeOptionLabels)];
	const targetTexts = [headers[3], ...rows.map((row) => row.targetLabel)];

	return [
		maxMeasuredWidth(landingTexts, measureLandingText) + pad,
		maxMeasuredWidth(typeTexts, measureText) + pad,
		maxMeasuredWidth(modeTexts, measureText) + pad + modeExtra + STAGE2_SELECT_EXTRA_PX,
		maxMeasuredWidth(targetTexts, measureText) + pad + STAGE2_TARGET_EXTRA_PX,
	];
}

export function distributeStage2ColumnWidths(
	containerWidth: number,
	mins: Stage2ColumnWidthsPx,
	weights: readonly [number, number, number, number] = STAGE2_COLUMN_WEIGHTS,
	landingMaxWidth?: number,
): Stage2ColumnWidthsPx {
	const cappedMins: [number, number, number, number] = [...mins];
	if (landingMaxWidth !== undefined && landingMaxWidth > 0) {
		cappedMins[0] = Math.min(cappedMins[0], landingMaxWidth);
	}

	const totalMin = cappedMins[0] + cappedMins[1] + cappedMins[2] + cappedMins[3];
	if (containerWidth <= 0 || containerWidth <= totalMin) {
		return cappedMins;
	}

	const slack = containerWidth - totalMin;
	const totalWeight = weights[0] + weights[1] + weights[2] + weights[3];
	if (totalWeight <= 0) {
		return cappedMins;
	}

	const widths: [number, number, number, number] = [
		Math.round(cappedMins[0] + slack * (weights[0] / totalWeight)),
		Math.round(cappedMins[1] + slack * (weights[1] / totalWeight)),
		Math.round(cappedMins[2] + slack * (weights[2] / totalWeight)),
		Math.round(cappedMins[3] + slack * (weights[3] / totalWeight)),
	];
	const drift = containerWidth - sumStage2ColumnWidths(widths);
	if (drift !== 0) {
		widths[3] += drift;
	}
	return widths;
}

export function sumStage2ColumnWidths(widths: Stage2ColumnWidthsPx): number {
	return widths[0] + widths[1] + widths[2] + widths[3];
}

export function resolveStage2ColumnWidthsPx(
	containerWidth: number,
	measureInput: Stage2ColumnMeasureInput,
): Stage2ColumnWidthsPx {
	const mins = measureStage2ColumnMins(measureInput);
	const totalMin = sumStage2ColumnWidths(mins);
	if (containerWidth <= 0 || containerWidth < totalMin) {
		return mins;
	}

	const landingMax = containerWidth * STAGE2_LANDING_MAX_WIDTH_FRACTION;
	return distributeStage2ColumnWidths(containerWidth, mins, STAGE2_COLUMN_WEIGHTS, landingMax);
}

export type Stage2ColumnCssVars = Record<
	`--s2-col-${1 | 2 | 3 | 4}` | "--s2-table-min-width",
	string
>;

export function stage2NeedsHorizontalScroll(
	containerWidth: number,
	measureInput: Stage2ColumnMeasureInput,
): boolean {
	if (containerWidth <= 0) {
		return false;
	}
	const mins = measureStage2ColumnMins(measureInput);
	return sumStage2ColumnWidths(mins) > containerWidth;
}

export function columnWidthsToPxCssVars(widths: Stage2ColumnWidthsPx): Stage2ColumnCssVars {
	const total = sumStage2ColumnWidths(widths);
	if (total <= 0) {
		return {
			"--s2-col-1": STAGE2_COLUMN_FALLBACK_PERCENTS[0],
			"--s2-col-2": STAGE2_COLUMN_FALLBACK_PERCENTS[1],
			"--s2-col-3": STAGE2_COLUMN_FALLBACK_PERCENTS[2],
			"--s2-col-4": STAGE2_COLUMN_FALLBACK_PERCENTS[3],
			"--s2-table-min-width": "0px",
		};
	}

	return {
		"--s2-col-1": `${widths[0]}px`,
		"--s2-col-2": `${widths[1]}px`,
		"--s2-col-3": `${widths[2]}px`,
		"--s2-col-4": `${widths[3]}px`,
		"--s2-table-min-width": `${total}px`,
	};
}

/** 宽屏 fit 布局：将像素列宽归一化为百分比；窄屏 scroll 路径改用 {@link columnWidthsToPxCssVars} */
export function columnWidthsToPercentCssVars(
	widths: Stage2ColumnWidthsPx,
): Record<`--s2-col-${1 | 2 | 3 | 4}`, string> {
	const total = sumStage2ColumnWidths(widths);
	if (total <= 0) {
		return {
			"--s2-col-1": STAGE2_COLUMN_FALLBACK_PERCENTS[0],
			"--s2-col-2": STAGE2_COLUMN_FALLBACK_PERCENTS[1],
			"--s2-col-3": STAGE2_COLUMN_FALLBACK_PERCENTS[2],
			"--s2-col-4": STAGE2_COLUMN_FALLBACK_PERCENTS[3],
		};
	}

	const toPercent = (value: number) => {
		const percent = (value / total) * 100;
		const rounded = Math.round(percent * 1000) / 1000;
		return `${rounded}%`;
	};
	return {
		"--s2-col-1": toPercent(widths[0]),
		"--s2-col-2": toPercent(widths[1]),
		"--s2-col-3": toPercent(widths[2]),
		"--s2-col-4": toPercent(widths[3]),
	};
}

export function columnWidthsToFitCssVars(widths: Stage2ColumnWidthsPx): Stage2ColumnCssVars {
	return {
		...columnWidthsToPercentCssVars(widths),
		"--s2-table-min-width": "0px",
	};
}

export function resolveStage2ColumnCssVars(
	containerWidth: number,
	measureInput: Stage2ColumnMeasureInput,
): Stage2ColumnCssVars {
	const widths = resolveStage2ColumnWidthsPx(containerWidth, measureInput);
	if (!stage2NeedsHorizontalScroll(containerWidth, measureInput)) {
		return columnWidthsToFitCssVars(widths);
	}
	return columnWidthsToPxCssVars(widths);
}

export function createCanvasTextMeasurer(
	fontSource: Element | null,
	options?: { fontWeight?: string },
): TextMeasurer {
	const canvas = document.createElement("canvas");
	const context = canvas.getContext("2d");
	if (!context) {
		return () => 0;
	}

	const source = fontSource ?? document.body;
	const style = getComputedStyle(source);
	const fontWeight = options?.fontWeight ?? style.fontWeight;
	const font = `${fontWeight} ${style.fontSize} ${style.fontFamily}`;
	context.font = font;

	return (text: string) => context.measureText(text).width;
}
