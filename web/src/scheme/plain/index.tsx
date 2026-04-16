import type { NoticeRendererProps, StageContainerProps, StatusDisplayProps, TargetChooserProps, UIScheme } from "../../lib/composition";

function getStageLabel(stage: NoticeRendererProps["responseOriginStage"]) {
	if (stage === "stage1") {
		return "Stage 1";
	}
	if (stage === "stage2") {
		return "Stage 2";
	}
	if (stage === "stage3") {
		return "Stage 3";
	}
	return null;
}

function PlainNoticeRenderer({ messages, blockingErrors, responseOriginStage = null }: NoticeRendererProps) {
	if (messages.length === 0 && blockingErrors.length === 0) {
		return null;
	}

	const stageLabel = getStageLabel(responseOriginStage);

	return (
		<div className="space-y-3 border border-line bg-surface p-4">
			{blockingErrors.map((error) => (
				<div key={`${error.code}-${error.scope}-${error.message}`} className="border border-danger/30 bg-danger/10 p-3 text-sm text-danger">
					{stageLabel ? <p className="mb-1 text-xs font-semibold uppercase tracking-[0.18em]">{stageLabel}</p> : null}
					<p className="font-semibold">{error.code}</p>
					<p>{error.message}</p>
				</div>
			))}
			{messages.map((message) => (
				<div key={`${message.level}-${message.code}-${message.message}`} className="border border-line bg-panel p-3 text-sm text-ink">
					<p className="font-semibold">{message.code}</p>
					<p>{message.message}</p>
				</div>
			))}
		</div>
	);
}

function PlainStageContainer({ eyebrow, title, description, aside, children }: StageContainerProps) {
	return (
		<section className="border border-line bg-surface p-5">
			<div className="flex flex-col gap-3 border-b border-line pb-4 md:flex-row md:items-start md:justify-between">
				<div className="space-y-1">
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">{eyebrow}</p>
					<h2 className="text-2xl font-semibold text-ink">{title}</h2>
					<p className="text-sm leading-7 text-muted">{description}</p>
				</div>
				{aside ? <div>{aside}</div> : null}
			</div>
			<div className="mt-5 space-y-5">{children}</div>
		</section>
	);
}

function PlainStatusDisplay({ label, tone = "neutral" }: StatusDisplayProps) {
	const toneClassMap = {
		neutral: "border-line text-muted",
		warning: "border-warm/40 text-warm",
		success: "border-success/40 text-success",
	};

	return <span className={`inline-flex border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneClassMap[tone]}`}>{label}</span>;
}

function PlainTargetChooser({ targets, value, onChange }: TargetChooserProps) {
	return (
		<div className="space-y-2 border border-line bg-panel p-3">
			<p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">目标选择</p>
			<select
				value={value ?? ""}
				onChange={(event) => onChange(event.target.value === "" ? null : event.target.value)}
				className="w-full border border-line bg-surface px-3 py-3 text-sm text-ink outline-none"
			>
				<option value="">请选择目标</option>
				{targets.map((target) => (
					<option key={`${target.kind}-${target.name}`} value={target.name} disabled={target.isEmpty === true}>
						{target.kind === "proxy-groups" ? `[主路径] ${target.name}` : `[补充路径] ${target.name}`}
						{target.isEmpty === true ? " (策略组为空)" : ""}
					</option>
				))}
			</select>
		</div>
	);
}

export const plainUIScheme: UIScheme = {
	NoticeRenderer: PlainNoticeRenderer,
	StageContainer: PlainStageContainer,
	StatusDisplay: PlainStatusDisplay,
	TargetChooser: PlainTargetChooser,
};