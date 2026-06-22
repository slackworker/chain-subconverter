import { type CSSProperties, type RefObject } from "react";

import {
	resolveStage2AggColumnCssVars,
	STAGE2_AGG_COLUMN_FALLBACK_PERCENTS,
	type Stage2AggColumnMeasureInput,
} from "./stage2AggTableColumns";
import { useStage2MeasuredTableColumns } from "./useStage2MeasuredTableColumns";

const FALLBACK_STYLE: CSSProperties = {
	"--s2-col-1": STAGE2_AGG_COLUMN_FALLBACK_PERCENTS[0],
	"--s2-col-2": STAGE2_AGG_COLUMN_FALLBACK_PERCENTS[1],
	"--s2-col-3": STAGE2_AGG_COLUMN_FALLBACK_PERCENTS[2],
	"--s2-col-4": STAGE2_AGG_COLUMN_FALLBACK_PERCENTS[3],
	"--s2-col-5": STAGE2_AGG_COLUMN_FALLBACK_PERCENTS[4],
	"--s2-table-min-width": "0px",
} as CSSProperties;

export function useStage2AggTableColumns(
	wrapRef: RefObject<HTMLDivElement | null>,
	measureInput: Omit<Stage2AggColumnMeasureInput, "measureText"> | null,
): CSSProperties {
	return useStage2MeasuredTableColumns(wrapRef, measureInput, FALLBACK_STYLE, resolveStage2AggColumnCssVars);
}
