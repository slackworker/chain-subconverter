import type { BlockingError } from "../types/api";
import type { ResponseOriginStage } from "./state";

export function getResponseOriginStageLabel(stage: ResponseOriginStage | null) {
	if (stage === "stage1") {
		return "Stage 1 / 输入区";
	}
	if (stage === "stage2") {
		return "Stage 2 / 配置区";
	}
	if (stage === "stage3") {
		return "Stage 3 / 输出区";
	}
	return null;
}

export function getFieldErrors(errors: BlockingError[], field: string) {
	return errors.filter((error) => error.scope === "stage1_field" && error.context?.field === field);
}

export function getRowErrors(errors: BlockingError[], landingNodeName: string) {
	return errors.filter((error) => error.scope === "stage2_row" && error.context?.landingNodeName === landingNodeName);
}