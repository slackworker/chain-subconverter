import type { StageContainerProps } from "../../lib/composition";

export function DefaultSectionBlock({ eyebrow, title, description, aside, children }: StageContainerProps) {
	return (
		<section className="rounded-[28px] border border-line bg-surface/90 p-6 shadow-panel shadow-black/5 backdrop-blur md:p-8">
			<div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
				<div className="space-y-2">
					<p className="font-mono text-xs uppercase tracking-[0.3em] text-accent">{eyebrow}</p>
					<h2 className="font-display text-3xl text-ink">{title}</h2>
					<p className="max-w-2xl text-sm leading-7 text-muted">{description}</p>
				</div>
				{aside ? <div className="shrink-0">{aside}</div> : null}
			</div>
			<div className="mt-6 space-y-5">{children}</div>
		</section>
	);
}