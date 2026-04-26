import type { UIScheme } from "../../lib/composition";
import { AAppPage } from "./Page";

export const aUIScheme: UIScheme = {
	id: "a",
	label: "UI A",
	description: "A 方案页面壳已独立拆出，后续可在共享 workflow 之上单独开发。",
	primaryBlockingFeedbackPlacement: "stage-local",
	Page: AAppPage,
};