import { useLayoutEffect, useMemo, useState, type CSSProperties, type RefObject } from "react";

import { createCanvasTextMeasurer, type TextMeasurer } from "./stage2TableColumns";

type Stage2MeasuredInput = {
	headers: unknown;
	rows: readonly unknown[];
};

type ResolveStage2ColumnCssVars<TInput extends Stage2MeasuredInput> = (
	containerWidth: number,
	measureInput: TInput & {
		measureText: TextMeasurer;
		measureLandingText: TextMeasurer;
	},
) => Record<string, string>;

export function useStage2MeasuredTableColumns<TInput extends Stage2MeasuredInput>(
	wrapRef: RefObject<HTMLDivElement | null>,
	measureInput: TInput | null,
	fallbackStyle: CSSProperties,
	resolveColumnCssVars: ResolveStage2ColumnCssVars<TInput>,
): CSSProperties {
	const [columnStyle, setColumnStyle] = useState<CSSProperties>(fallbackStyle);
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
			setColumnStyle(fallbackStyle);
			return;
		}

		const recompute = () => {
			const fontSource = wrap.querySelector(".a-table th") ?? wrap;
			const landingFontSource = wrap.querySelector(".a-stage2-row-name-input") ?? fontSource;
			const measureText = createCanvasTextMeasurer(fontSource);
			const measureLandingText = createCanvasTextMeasurer(landingFontSource);
			const containerWidth = wrap.clientWidth;
			if (containerWidth <= 0) {
				setColumnStyle(fallbackStyle);
				return;
			}

			const vars = resolveColumnCssVars(containerWidth, {
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
	}, [wrapRef, inputKey, measureInput, fallbackStyle, resolveColumnCssVars]);

	return columnStyle;
}
