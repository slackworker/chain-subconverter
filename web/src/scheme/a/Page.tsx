import type { AppPageProps } from "../../lib/composition";
import "./index.css";

export function AAppPage({ workflow, outputActions }: AppPageProps) {
	void workflow;
	void outputActions;

	return (
		<main>
			<p>Scheme A</p>
			<h1>A 方案独立页面入口</h1>
			<p>
				A 方案现在拥有自己的页面文件与路由落点，不再借用 plain 方案组件，可单独开展布局和交互实验。
			</p>
			<p>仅共享 workflow 与 output actions；方案层 UI 壳已脱钩。</p>
		</main>
	);
}
