import type { AppPageProps } from "../../lib/composition";

export function DefaultAppPage({ workflow, outputActions }: AppPageProps) {
	void workflow;
	void outputActions;

	return (
		<main>
			<p>Default Scheme</p>
			<h1>Shared workflow, independent default shell</h1>
			<p>
				当前默认入口已不再复用 plain 方案页面。这里保留独立默认方案壳层，后续可在不影响 A/B/C 的前提下继续推进。
			</p>
		</main>
	);
}
