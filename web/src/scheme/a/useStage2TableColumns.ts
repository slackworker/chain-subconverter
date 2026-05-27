import { useLayoutEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";

import {
	createCanvasTextMeasurer,
	resolveStage2ColumnCssVars,
	STAGE2_COLUMN_FALLBACK_PERCENTS,
	type Stage2ColumnMeasureInput,
} from "./stage2TableColumns";

const FALLBACK_STYLE: CSSProperties = {
	"--s2-col-1": STAGE2_COLUMN_FALLBACK_PERCENTS[0],
	"--s2-col-2": STAGE2_COLUMN_FALLBACK_PERCENTS[1],
	"--s2-col-3": STAGE2_COLUMN_FALLBACK_PERCENTS[2],
	"--s2-col-4": STAGE2_COLUMN_FALLBACK_PERCENTS[3],
	"--s2-table-min-width": "0px",
} as CSSProperties;

export function useStage2TableColumns(
	wrapRef: RefObject<HTMLDivElement | null>,
	measureInput: Omit<Stage2ColumnMeasureInput, "measureText"> | null,
): CSSProperties {
	const [columnStyle, setColumnStyle] = useState<CSSProperties>(FALLBACK_STYLE);
	const inputKey = useMemo(
		() =>
			measureInput === null
				? ""
				: JSON.stringify({
						headers: measureInput.headers,
						rows: measureInput.rows,
					}),
		[measureInput],
	);

	useLayoutEffect(() => {
		const wrap = wrapRef.current;
		if (!wrap || measureInput === null || measureInput.rows.length === 0) {
			setColumnStyle(FALLBACK_STYLE);
			return;
		}

		const recompute = () => {
			const fontSource = wrap.querySelector(".a-table th") ?? wrap;
			const landingFontSource = wrap.querySelector(".a-stage2-row-name-input") ?? fontSource;
			const measureText = createCanvasTextMeasurer(fontSource);
			const measureLandingText = createCanvasTextMeasurer(landingFontSource);
			const containerWidth = wrap.clientWidth;
			if (containerWidth <= 0) {
				setColumnStyle(FALLBACK_STYLE);
				return;
			}

			const vars = resolveStage2ColumnCssVars(containerWidth, {
				...measureInput,
				measureText,
				measureLandingText,
			});
			setColumnStyle(vars as CSSProperties);
		};

		recompute();

		const observer = typeof ResizeObserver !== "undefined" ? new ResizeObserver(recompute) : null;
		observer?.observe(wrap);
		return () => {
			observer?.disconnect();
		};
	}, [wrapRef, inputKey, measureInput]);

	return columnStyle;
}
