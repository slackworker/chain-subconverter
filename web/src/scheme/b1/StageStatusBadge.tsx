import type { WorkflowStatus } from "../../hooks/useAppWorkflow";
import { neutralBadge } from "../b2/theme";
import { getWorkflowStatusLabel, type Locale } from "./locales";

export function StageStatusBadge({
	status,
	colorMode,
	locale,
}: {
	status: WorkflowStatus;
	colorMode: "dark" | "light";
	locale: Locale;
}) {
	const statusBadgeClass =
		status.tone === "success"
			? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
			: status.tone === "warning"
				? "bg-amber-500/10 text-amber-400 border-amber-500/20"
				: neutralBadge(colorMode);

	return (
		<span className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-full border ${statusBadgeClass}`}>
			{getWorkflowStatusLabel(status.label, locale)}
		</span>
	);
}
