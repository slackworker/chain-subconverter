import type { UIScheme } from "../../lib/composition";
import { PlainAppPage } from "./Page";

export { PlainAppPage } from "./Page";

export const plainUIScheme: UIScheme = {
	id: "plain",
	label: "Plain",
	description: "共享层验收与最小展示方案，用最少视觉分层验证同一 workflow 可重用。",
	Page: PlainAppPage,
};