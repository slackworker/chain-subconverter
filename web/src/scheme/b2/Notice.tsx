import type { NoticeRendererProps } from "../../lib/composition";
import { AlertCircleIcon } from "./Icons";

export function NoticeRenderer({ blockingErrors }: NoticeRendererProps) {
	if (blockingErrors.length === 0) {
		return null;
	}

	return (
		<div className="flex flex-col gap-3">
			{blockingErrors.map((error) => (
				<div
					key={`${error.code}:${error.message}`}
					className="flex gap-3 bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-xl items-start"
				>
					<AlertCircleIcon className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
					<span className="text-sm">{error.message}</span>
				</div>
			))}
		</div>
	);
}
