import type { UIScheme } from "../../lib/composition";
import { CAppPage } from "./Page";

export const cUIScheme: UIScheme = {
	id: "c",
	label: "UI C",
	description: "C 方案独立入口已拆出，当前先复用 plain 方案承接共享 workflow。",
	Page: CAppPage,
};