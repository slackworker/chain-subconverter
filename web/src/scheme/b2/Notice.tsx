import type { NoticeRendererProps } from "../../lib/composition";
import { AlertCircleIcon, InfoIcon, AlertTriangleIcon } from "./Icons";

export function NoticeRenderer({ messages, blockingErrors }: NoticeRendererProps) {
	if (messages.length === 0 && blockingErrors.length === 0) {
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
			{messages.map((message) => {
				const isWarn = message.level === "warning";
				const Icon = isWarn ? AlertTriangleIcon : InfoIcon;
				const bgClass = isWarn
					? "bg-amber-500/10 border-amber-500/20 text-amber-200"
					: "bg-blue-500/10 border-blue-500/20 text-blue-200";
				const iconClass = isWarn ? "text-amber-400" : "text-blue-400";

				return (
					<div key={`${message.code}:${message.message}`} className={`flex gap-3 border p-4 rounded-xl items-start ${bgClass}`}>
						<Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconClass}`} />
						<span className="text-sm">{message.message}</span>
					</div>
				);
			})}
		</div>
	);
}
