import type { UIScheme } from "../../lib/composition";
import { CAppPage } from "./Page";

export const cUIScheme: UIScheme = {
	id: "c",
	label: "UI C",
	description: "C 方案页面壳已独立拆出，后续可在共享 workflow 之上单独开发。",
	Page: CAppPage,
};