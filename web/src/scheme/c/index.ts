import type { UIScheme } from "../../lib/composition";
import { CAppPage } from "./Page";

export const cUIScheme: UIScheme = {
	id: "c",
	label: "UI C",
	description: "深色开发者工具风格；三阶段工作流垂直平铺，双栏输入，紧凑行卡，GitHub Primer 配色。",
	primaryBlockingFeedbackPlacement: "stage-local",
	Page: CAppPage,
};