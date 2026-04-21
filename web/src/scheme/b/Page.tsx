import type { AppPageProps } from "../../lib/composition";
import "./index.css";

export function BAppPage({ workflow, outputActions, primaryBlockingFeedbackPlacement }: AppPageProps) {
	void workflow;
	void outputActions;
	void primaryBlockingFeedbackPlacement;

	return (
		<main>
			<p>Scheme B</p>
			<h1>B 方案独立页面入口</h1>
			<p>
				B 方案已不再通过 plain 页面中转。当前文件就是 B 自己的方案层起点，可独立推进信息架构与视觉方向。
			</p>
		</main>
	);
}
