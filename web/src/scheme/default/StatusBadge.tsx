import type { StatusDisplayProps } from "../../lib/composition";

const toneClassMap = {
	neutral: "border-line bg-panel text-muted",
	warning: "border-warm/30 bg-warm/10 text-warm",
	success: "border-success/30 bg-success/10 text-success",
};

export function DefaultStatusBadge({ label, tone = "neutral" }: StatusDisplayProps) {
	return <span className={`inline-flex rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] ${toneClassMap[tone]}`}>{label}</span>;
}