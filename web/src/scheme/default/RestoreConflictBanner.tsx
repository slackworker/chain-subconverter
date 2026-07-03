import type { RestoreConflict } from "../../types/api";
import { formatModeReason, type ModeReasonLocale } from "../../lib/mode-reason";

interface RestoreConflictBannerProps {
	conflicts: RestoreConflict[];
	summary: string;
	locale: ModeReasonLocale;
}

export function RestoreConflictBanner({ conflicts, summary, locale }: RestoreConflictBannerProps) {
	const formattedConflicts = conflicts
		.map((conflict) => formatModeReason(conflict, locale))
		.filter((message) => message.trim() !== "");

	return (
		<div className="a-conflict-banner" role="status">
			<p>{summary}</p>
			{formattedConflicts.length > 0 ? (
				<ul className="a-conflict-banner__list">
					{formattedConflicts.map((message, index) => (
						<li key={`${conflicts[index]?.reasonCode ?? "conflict"}-${index}`}>{message}</li>
					))}
				</ul>
			) : null}
		</div>
	);
}
