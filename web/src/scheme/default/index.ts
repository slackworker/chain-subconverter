import type { UIScheme } from "../../lib/composition";
import { PlainAppPage } from "../plain";

export const defaultUIScheme: UIScheme = {
	id: "default",
	label: "Default",
	description: "默认入口已回退到 0 UI 基线，当前只承接共享 workflow 与最小页面骨架。",
	Page: PlainAppPage,
};