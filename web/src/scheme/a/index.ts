import type { UIScheme } from "../../lib/composition";
import { PlainAppPage } from "../plain";

export const aUIScheme: UIScheme = {
	id: "a",
	label: "UI A",
	description: "A 方案已清空回到 0 UI 基线，后续在最小页面骨架上重新开发。",
	Page: PlainAppPage,
};