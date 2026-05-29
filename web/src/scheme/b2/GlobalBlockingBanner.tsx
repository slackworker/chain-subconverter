import { getOriginStageLabel } from "../../lib/notices";
import type { BlockingError } from "../../types/api";
import { AlertCircleIcon } from "./Icons";

export function GlobalBlockingBanner({
	errors,
	responseOriginStage,
}: {
	errors: BlockingError[];
	responseOriginStage: "stage1" | "stage2" | "stage3" | null;
}) {
	if (errors.length === 0) {
		return null;
	}

	const stageLabel = getOriginStageLabel(responseOriginStage);

	return (
		<div className="sticky top-16 z-30 border-b border-red-500/30 bg-red-950/90 backdrop-blur-md">
			<div className="max-w-5xl mx-auto px-6 py-3 flex gap-3 items-start">
				<AlertCircleIcon className="w-5 h-5 text-red-400 mt-0.5 shrink-0" />
				<div className="flex flex-col gap-1 min-w-0">
					<div className="flex flex-wrap items-center gap-2">
						<span className="text-sm font-semibold text-red-100">需要处理的问题</span>
						{stageLabel ? (
							<span className="text-xs text-red-300/80 bg-red-500/10 px-2 py-0.5 rounded-full">
								来源：{stageLabel}
							</span>
						) : null}
					</div>
					<ul className="text-sm text-red-200/90 space-y-0.5">
						{errors.map((error) => (
							<li key={`${error.code}:${error.message}`}>{error.message}</li>
						))}
					</ul>
				</div>
			</div>
		</div>
	);
}
