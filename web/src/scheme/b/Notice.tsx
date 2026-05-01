import type { NoticeRendererProps } from "../../lib/composition";
import { AlertCircleIcon, InfoIcon, AlertTriangleIcon } from "./Icons";

export function NoticeRenderer({ messages, blockingErrors, responseOriginStage }: NoticeRendererProps) {
	if (messages.length === 0 && blockingErrors.length === 0) return null;

	return (
		<div className="flex flex-col gap-3 my-4">
			{blockingErrors.map((err, i) => (
				<div key={i} className="flex gap-3 bg-red-500/10 border border-red-500/20 text-red-200 p-4 rounded-xl items-start">
					<AlertCircleIcon className="w-5 h-5 text-red-400 mt-0.5 flex-shrink-0" />
					<div className="flex flex-col">
						<span className="font-medium text-red-100">错误 {err.code}</span>
						<span className="text-sm opacity-90">{err.message}</span>
					</div>
				</div>
			))}
			{messages.map((msg, i) => {
				const isWarn = msg.level === "warning";
				const Icon = isWarn ? AlertTriangleIcon : InfoIcon;
				const bgClass = isWarn ? "bg-amber-500/10 border-amber-500/20 text-amber-200" : "bg-blue-500/10 border-blue-500/20 text-blue-200";
				const iconClass = isWarn ? "text-amber-400" : "text-blue-400";
				const titleClass = isWarn ? "text-amber-100" : "text-blue-100";
				
				return (
					<div key={i} className={`flex gap-3 border p-4 rounded-xl items-start ${bgClass}`}>
						<Icon className={`w-5 h-5 mt-0.5 flex-shrink-0 ${iconClass}`} />
						<div className="flex flex-col">
							<span className={`font-medium ${titleClass}`}>提示 {msg.code}</span>
							<span className="text-sm opacity-90">{msg.message}</span>
						</div>
					</div>
				);
			})}
		</div>
	);
}
