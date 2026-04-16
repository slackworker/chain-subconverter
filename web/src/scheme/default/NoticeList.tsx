import type { NoticeRendererProps } from "../../lib/composition";
import type { ResponseOriginStage } from "../../lib/state";

function getResponseOriginStageLabel(stage: ResponseOriginStage | null) {
	if (stage === "stage1") {
		return "Stage 1 / 输入区";
	}
	if (stage === "stage2") {
		return "Stage 2 / 配置区";
	}
	if (stage === "stage3") {
		return "Stage 3 / 输出区";
	}
	return null;
}

export function DefaultNoticeList({ messages, blockingErrors, responseOriginStage = null }: NoticeRendererProps) {
	if (messages.length === 0 && blockingErrors.length === 0) {
		return null;
	}

	const responseOriginStageLabel = getResponseOriginStageLabel(responseOriginStage);

	return (
		<div className="space-y-3">
			{blockingErrors.map((error) => (
				<div key={`${error.code}-${error.scope}-${error.message}`} className="rounded-[20px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm leading-7 text-danger">
					{responseOriginStageLabel ? <p className="mb-2 font-mono text-[11px] uppercase tracking-[0.24em] text-danger/80">{responseOriginStageLabel}</p> : null}
					<p className="font-semibold uppercase tracking-[0.16em]">{error.code}</p>
					<p>{error.message}</p>
				</div>
			))}
			{messages.map((message) => (
				<div key={`${message.level}-${message.code}-${message.message}`} className="rounded-[20px] border border-accent/20 bg-accentSoft px-4 py-3 text-sm leading-7 text-ink">
					<p className="font-semibold uppercase tracking-[0.16em] text-accent">{message.code}</p>
					<p>{message.message}</p>
				</div>
			))}
		</div>
	);
}