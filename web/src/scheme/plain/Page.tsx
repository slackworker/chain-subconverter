import type { AppPageProps } from "../../lib/composition";

export function PlainAppPage({ workflow, outputActions }: AppPageProps) {
	void workflow;
	void outputActions;

	return (
		<main>
			<h1>0 UI Baseline</h1>
			<p>方案层 UI 实现已移除。当前仅保留共享 workflow 装配入口，等待按 spec 重新实现页面。</p>
		</main>
	);
}