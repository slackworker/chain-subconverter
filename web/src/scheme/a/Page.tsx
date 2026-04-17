import type { AppPageProps } from "../../lib/composition";

export function AAppPage({ workflow, outputActions }: AppPageProps) {
	void workflow;
	void outputActions;

	return (
		<main className="min-h-screen bg-canvas px-6 py-16 text-ink">
			<section className="mx-auto grid max-w-5xl gap-6 rounded-[2rem] border border-ink/10 bg-[#f5f1e8] p-10 shadow-[0_24px_80px_rgba(84,51,16,0.08)] lg:grid-cols-[1.2fr_0.8fr]">
				<div>
					<p className="text-sm uppercase tracking-[0.32em] text-ink/55">Scheme A</p>
					<h1 className="mt-4 text-4xl font-semibold tracking-tight">A 方案独立页面入口</h1>
					<p className="mt-4 max-w-2xl text-base leading-7 text-ink/70">
						A 方案现在拥有自己的页面文件与路由落点，不再借用 plain 方案组件，可单独开展布局和交互实验。
					</p>
				</div>
				<div className="rounded-[1.5rem] border border-ink/10 bg-white/70 p-6 text-sm leading-7 text-ink/65">
					仅共享 workflow 与 output actions；方案层 UI 壳已脱钩。
				</div>
			</section>
		</main>
	);
}