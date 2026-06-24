export const STAGE2_COLUMN_COUNT = 4;

/** 落地 / 类型 / 配置方式 / 目标 */
export const STAGE2_COLUMN_WEIGHTS: readonly [number, number, number, number] = [1, 1, 1, 1];

export const STAGE2_LANDING_MAX_WIDTH_FRACTION = 0.38;

/** 与 `.a-table th, .a-table td` 水平 padding `0.75rem` × 2 对齐（16px 根字号） */
export const STAGE2_CELL_PADDING_X_PX = 24;

/**
 * Stage2 第一列为可编辑名称输入框，额外占用：
 * - `.a-stage2-row-inline` 左侧节点轨道 padding `0.9rem`
 * - 行内容 gap `0.55rem`
 * - `.a-stage2-row-name-input` 左右 padding `0.4rem + 1.65rem`
 * - 右侧单个行内工具按钮宽度 `1.56rem`
 */
export const STAGE2_LANDING_EDITABLE_EXTRA_PX = Math.ceil((0.9 + 0.55 + 0.4 + 1.65 + 1.56) * 16);

/** 原生 input 渲染与 canvas 文本测量存在 1px 级别误差，给第一列留出极小余量避免断点裁切。 */
export const STAGE2_LANDING_RENDERING_SAFETY_PX = 2;

/** `.a-mode-warning-slot` 1.25rem + `.a-mode-cell` gap 0.4rem */
export const STAGE2_MODE_EXTRA_PX = 20 + 6;

/** `.a-select` 水平 padding-left: 0.5rem */
export const STAGE2_CONTROL_PADDING_LEFT_PX = 8;

/** 原生 `select.a-select` padding-right: 1.9rem（含自定义箭头区） */
export const STAGE2_NATIVE_SELECT_PADDING_RIGHT_PX = 31;

/** `.a-target-menu__trigger` 右侧：padding-right 0.5rem + gap 0.45rem + ::after 箭头 12px */
export const STAGE2_TARGET_TRIGGER_PADDING_RIGHT_PX = 8 + 8 + 12;

/** 控件 1px 边框 × 2 */
export const STAGE2_CONTROL_BORDER_X_PX = 2;

/** canvas 文本测量与原生控件渲染之间的安全余量 */
export const STAGE2_CONTROL_RENDERING_SAFETY_PX = 2;

/** 原生 select 除文本外占用：左 padding + 右箭头区 + 边框 + 渲染余量 */
export const STAGE2_NATIVE_SELECT_EXTRA_PX =
	STAGE2_CONTROL_PADDING_LEFT_PX
	+ STAGE2_NATIVE_SELECT_PADDING_RIGHT_PX
	+ STAGE2_CONTROL_BORDER_X_PX
	+ STAGE2_CONTROL_RENDERING_SAFETY_PX;

/** 链式目标自定义触发器除文本外占用 */
export const STAGE2_TARGET_TRIGGER_EXTRA_PX =
	STAGE2_CONTROL_PADDING_LEFT_PX
	+ STAGE2_TARGET_TRIGGER_PADDING_RIGHT_PX
	+ STAGE2_CONTROL_BORDER_X_PX
	+ STAGE2_CONTROL_RENDERING_SAFETY_PX;

/** 目标列控件 chrome 取 native select 与自定义触发器的较大值 */
export const STAGE2_TARGET_EXTRA_PX = Math.max(STAGE2_NATIVE_SELECT_EXTRA_PX, STAGE2_TARGET_TRIGGER_EXTRA_PX);

/** @deprecated 使用 {@link STAGE2_NATIVE_SELECT_EXTRA_PX} */
export const STAGE2_SELECT_EXTRA_PX = STAGE2_NATIVE_SELECT_EXTRA_PX;

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
	/** 目标列下拉/菜单内可能出现的全部文案（含分组标题与候选项） */
	targetOptionLabels?: readonly string[];
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
	const targetTexts = [
		headers[3],
		...rows.flatMap((row) => [row.targetLabel, ...(row.targetOptionLabels ?? [])]),
	];

	return [
		maxMeasuredWidth(landingTexts, measureLandingText)
			+ pad
			+ STAGE2_LANDING_EDITABLE_EXTRA_PX
			+ STAGE2_LANDING_RENDERING_SAFETY_PX,
		maxMeasuredWidth(typeTexts, measureText) + pad,
		maxMeasuredWidth(modeTexts, measureText) + pad + modeExtra + STAGE2_NATIVE_SELECT_EXTRA_PX,
		maxMeasuredWidth(targetTexts, measureText) + pad + STAGE2_TARGET_EXTRA_PX,
	];
}

export function distributeStage2ColumnWidths(
	containerWidth: number,
	mins: Stage2ColumnWidthsPx,
	weights: readonly [number, number, number, number] = STAGE2_COLUMN_WEIGHTS,
	landingMaxWidth?: number,
): Stage2ColumnWidthsPx {
	const baseMins: [number, number, number, number] = [...mins];
	const totalMin = baseMins[0] + baseMins[1] + baseMins[2] + baseMins[3];
	if (containerWidth <= 0 || containerWidth <= totalMin) {
		return baseMins;
	}

	const slack = containerWidth - totalMin;
	const totalWeight = weights[0] + weights[1] + weights[2] + weights[3];
	if (totalWeight <= 0) {
		return baseMins;
	}

	const maxLandingWidth = landingMaxWidth !== undefined && landingMaxWidth > baseMins[0]
		? landingMaxWidth
		: undefined;
	if (maxLandingWidth !== undefined) {
		const unconstrainedLandingWidth = baseMins[0] + slack * (weights[0] / totalWeight);
		if (unconstrainedLandingWidth > maxLandingWidth) {
			const widths: [number, number, number, number] = [
				Math.round(maxLandingWidth),
				baseMins[1],
				baseMins[2],
				baseMins[3],
			];
			const remainingSlack = containerWidth - sumStage2ColumnWidths(widths);
			const remainingWeight = weights[1] + weights[2] + weights[3];
			if (remainingWeight <= 0) {
				widths[3] += remainingSlack;
				return widths;
			}

			widths[1] = Math.round(baseMins[1] + remainingSlack * (weights[1] / remainingWeight));
			widths[2] = Math.round(baseMins[2] + remainingSlack * (weights[2] / remainingWeight));
			widths[3] = Math.round(baseMins[3] + remainingSlack * (weights[3] / remainingWeight));
			const drift = containerWidth - sumStage2ColumnWidths(widths);
			if (drift !== 0) {
				widths[3] += drift;
			}
			return widths;
		}
	}

	const widths: [number, number, number, number] = [
		Math.round(baseMins[0] + slack * (weights[0] / totalWeight)),
		Math.round(baseMins[1] + slack * (weights[1] / totalWeight)),
		Math.round(baseMins[2] + slack * (weights[2] / totalWeight)),
		Math.round(baseMins[3] + slack * (weights[3] / totalWeight)),
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
