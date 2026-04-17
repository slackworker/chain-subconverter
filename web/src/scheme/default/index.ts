import type { UIScheme } from "../../lib/composition";
import { DefaultAppPage } from "./Page";

export const defaultUIScheme: UIScheme = {
	id: "default",
	label: "Default",
	description: "默认入口已拥有独立页面壳，仅继续共享 workflow 与业务语义。",
	Page: DefaultAppPage,
};