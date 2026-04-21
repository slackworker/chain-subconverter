import type { AppPageProps } from "../../lib/composition";
import "./index.css";

export function CAppPage({ workflow, outputActions, primaryBlockingFeedbackPlacement }: AppPageProps) {
	void workflow;
	void outputActions;
	void primaryBlockingFeedbackPlacement;

	return (
		<main>
			<p>Scheme C</p>
			<h1>C 方案独立页面入口</h1>
			<p>
				C 方案当前拥有自己的方案层页面文件，不再依赖 plain 方案组件，后续可以直接围绕这一路由做独立实现。
			</p>
		</main>
	);
}
