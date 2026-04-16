import { useMemo, useState } from "react";

import { getChainTargetGroups } from "../../lib/chainTargets";
import type { TargetChooserProps } from "../../lib/composition";
import type { ChainTarget } from "../../types/api";

type TargetKind = ChainTarget["kind"];

export function DefaultChainTargetChooser({ targets, value, onChange }: TargetChooserProps) {
	const [expandedGroups, setExpandedGroups] = useState<Record<TargetKind, boolean>>({
		"proxy-groups": true,
		proxies: false,
	});
	const groups = useMemo(() => getChainTargetGroups(targets), [targets]);

	function toggleGroup(kind: TargetKind) {
		setExpandedGroups((current) => ({
			...current,
			[kind]: !current[kind],
		}));
	}

	return (
		<div className="rounded-[16px] border border-line bg-panel">
			<div className="flex flex-wrap items-start justify-between gap-3 px-3 py-3">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">链式目标</p>
					<p className="mt-1 text-sm font-semibold text-ink">{value ?? "请选择目标"}</p>
				</div>
				{value ? (
					<button
						type="button"
						onClick={() => onChange(null)}
						className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted transition hover:border-accent hover:text-accent"
					>
						清空
					</button>
				) : (
					<span className="rounded-full border border-line px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
						待选择
					</span>
				)}
			</div>
			<div className="border-t border-line p-2">
				{groups.map((group) => {
					const expanded = expandedGroups[group.kind];
					return (
						<div key={group.kind} className="overflow-hidden rounded-[14px] border border-line bg-surface not-last:mb-2">
							<button
								type="button"
								onClick={() => toggleGroup(group.kind)}
								aria-expanded={expanded}
								className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
							>
								<div>
									<div className="flex flex-wrap items-center gap-2">
										<p className="text-sm font-semibold text-ink">{group.title}</p>
										<span className={`rounded-full px-2 py-1 text-[11px] font-semibold ${group.priority === "primary" ? "bg-accentSoft text-accent" : "bg-panel text-muted"}`}>
											{group.priority === "primary" ? "主路径" : "补充路径"}
										</span>
									</div>
									<p className="mt-1 text-xs leading-6 text-muted">{group.description}</p>
								</div>
								<span className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted">
									{expanded ? "收起" : "展开"} · {group.targets.length}
								</span>
							</button>
							{expanded ? (
								<div className="border-t border-line p-2">
									{group.targets.length === 0 ? (
										<p className="rounded-[12px] bg-panel px-3 py-3 text-sm leading-6 text-muted">{group.emptyText}</p>
									) : (
										<div className="max-h-64 space-y-2 overflow-auto pr-1">
											{group.targets.map((target) => {
												const isSelected = value === target.name;
												const isDisabled = target.isEmpty === true;
												return (
													<button
														key={`${group.kind}-${target.name}`}
														type="button"
														onClick={() => onChange(target.name)}
														disabled={isDisabled}
														className={`w-full rounded-[12px] border px-3 py-3 text-left transition ${
															isSelected
																? "border-accent bg-accentSoft"
																: "border-line bg-panel hover:border-accent/50"
														} ${isDisabled ? "cursor-not-allowed opacity-60" : ""}`}
													>
														<div className="flex items-start justify-between gap-3">
															<span className="text-sm font-semibold text-ink">{target.name}</span>
															{isSelected ? (
																<span className="rounded-full border border-accent px-2 py-1 text-[11px] font-semibold text-accent">
																	当前选择
																</span>
															) : null}
														</div>
														{isDisabled ? (
															<p className="mt-1 text-xs leading-6 text-danger">策略组为空，不允许作为中转策略组</p>
														) : null}
													</button>
												);
											})}
										</div>
									)}
								</div>
							) : null}
						</div>
					);
				})}
			</div>
		</div>
	);
}