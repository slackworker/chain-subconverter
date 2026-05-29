import { useEffect, useRef, useState } from "react";

import type { WorkflowLogEntry } from "../../lib/state";

const LEVEL_LABELS: Record<WorkflowLogEntry["level"], string> = {
	info: "提示",
	warning: "警告",
	success: "成功",
	error: "失败",
};

function formatTime(createdAt: string) {
	return new Intl.DateTimeFormat("zh-CN", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(new Date(createdAt));
}

function stageLabel(stage: WorkflowLogEntry["originStage"]) {
	if (stage === "stage1") return "阶段 1";
	if (stage === "stage2") return "阶段 2";
	if (stage === "stage3") return "阶段 3";
	return null;
}

export function LogPanel({ entries }: { entries: WorkflowLogEntry[] }) {
	const [open, setOpen] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const latest = entries.length > 0 ? entries[entries.length - 1] : null;

	useEffect(() => {
		if (!open) return;
		const handleClickOutside = (event: MouseEvent) => {
			if (panelRef.current && !panelRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open]);

	if (entries.length === 0) {
		return null;
	}

	return (
		<div className="c-log-dock" ref={panelRef}>
			{open ? (
				<section className="c-log-panel" aria-label="工作流日志">
					<div className="c-log-panel-head">
						<h3>工作流日志</h3>
						<span className="c-log-count">{entries.length}</span>
						<button type="button" className="c-icon-btn" onClick={() => setOpen(false)} aria-label="收起日志">
							×
						</button>
					</div>
					<ul className="c-log-list">
						{entries.slice().reverse().map((entry) => (
							<li key={entry.id} className={`c-log-item c-log-item--${entry.level}`}>
								<time className="c-log-time" dateTime={entry.createdAt}>
									{formatTime(entry.createdAt)}
								</time>
								<span className="c-log-stage">{stageLabel(entry.originStage) ?? "\u00a0"}</span>
								<span className="c-log-level">{LEVEL_LABELS[entry.level]}</span>
								<p className="c-log-msg">{entry.message}</p>
							</li>
						))}
					</ul>
				</section>
			) : null}
			<button
				type="button"
				className={`c-log-toggle${latest?.level === "error" ? " c-log-toggle--alert" : ""}`}
				aria-expanded={open}
				onClick={() => setOpen((current) => !current)}
			>
				日志
				<span className="c-log-toggle-count">{entries.length}</span>
			</button>
		</div>
	);
}
