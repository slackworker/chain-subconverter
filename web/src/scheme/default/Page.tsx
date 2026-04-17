import type { AppPageProps } from "../../lib/composition";

export function DefaultAppPage({ workflow, outputActions }: AppPageProps) {
	void workflow;
	void outputActions;

	return (
		<main className="min-h-screen bg-canvas px-6 py-16 text-ink">
			<div className="mx-auto max-w-4xl rounded-[2rem] border border-ink/10 bg-white/80 p-10 shadow-[0_24px_80px_rgba(15,23,42,0.08)] backdrop-blur">
				<p className="text-sm uppercase tracking-[0.3em] text-ink/55">Default Scheme</p>
				<h1 className="mt-4 text-4xl font-semibold tracking-tight">Shared workflow, independent default shell</h1>
				<p className="mt-4 max-w-2xl text-base leading-7 text-ink/70">
					当前默认入口已不再复用 plain 方案页面。这里保留独立默认方案壳层，后续可在不影响 A/B/C 的前提下继续推进。
				</p>
			</div>
		</main>
	);
}