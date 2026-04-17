import type { AppPageProps } from "../../lib/composition";

export function BAppPage({ workflow, outputActions }: AppPageProps) {
	void workflow;
	void outputActions;

	return (
		<main className="min-h-screen bg-canvas px-6 py-16 text-ink">
			<section className="mx-auto max-w-5xl overflow-hidden rounded-[2rem] border border-ink/10 bg-[#e9f5ef] shadow-[0_24px_80px_rgba(15,72,47,0.08)]">
				<div className="grid gap-0 lg:grid-cols-[0.9fr_1.1fr]">
					<div className="border-b border-ink/10 bg-[#d5ebde] p-10 lg:border-b-0 lg:border-r">
						<p className="text-sm uppercase tracking-[0.32em] text-ink/55">Scheme B</p>
						<h1 className="mt-4 text-4xl font-semibold tracking-tight">B 方案独立页面入口</h1>
					</div>
					<div className="p-10 text-base leading-7 text-ink/70">
						B 方案已不再通过 plain 页面中转。当前文件就是 B 自己的方案层起点，可独立推进信息架构与视觉方向。
					</div>
				</div>
			</section>
		</main>
	);
}