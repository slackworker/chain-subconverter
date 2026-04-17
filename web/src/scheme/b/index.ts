import type { UIScheme } from "../../lib/composition";
import { BAppPage } from "./Page";

export const bUIScheme: UIScheme = {
	id: "b",
	label: "UI B",
	description: "B 方案独立入口已拆出，当前先复用 plain 方案承接共享 workflow。",
	Page: BAppPage,
};