import type { AppPageProps } from "../../lib/composition";

export function CAppPage({ workflow, outputActions }: AppPageProps) {
	void workflow;
	void outputActions;

	return (
		<main className="min-h-screen bg-canvas px-6 py-16 text-ink">
			<section className="mx-auto max-w-5xl rounded-[2rem] border border-ink/10 bg-[#f1eefc] p-10 shadow-[0_24px_80px_rgba(51,32,108,0.08)]">
				<div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
					<div>
						<p className="text-sm uppercase tracking-[0.32em] text-ink/55">Scheme C</p>
						<h1 className="mt-4 text-4xl font-semibold tracking-tight">C 方案独立页面入口</h1>
					</div>
					<p className="max-w-xl text-base leading-7 text-ink/70">
						C 方案当前拥有自己的方案层页面文件，不再依赖 plain 方案组件，后续可以直接围绕这一路由做独立实现。
					</p>
				</div>
			</section>
		</main>
	);
}