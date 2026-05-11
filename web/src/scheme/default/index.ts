import type { UISchemeDefinition } from "../../lib/composition";

export const defaultUIScheme: UISchemeDefinition = {
	id: "default",
	label: "UI Default",
	description: "默认 UI（由 UI A 拷贝冻结，作为当前默认入口）。",
	primaryBlockingFeedbackPlacement: "stage-local",
};
