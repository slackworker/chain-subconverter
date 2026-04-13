import { useState } from "react";

import type { ChainTarget } from "../types/api";

interface ChainTargetPickerProps {
	targets: ChainTarget[];
	value: string | null;
	onChange: (targetName: string | null) => void;
}

type ChainTargetGroupKind = ChainTarget["kind"];

const groupMeta: Record<ChainTargetGroupKind, { title: string; description: string; emptyText: string }> = {
	"proxy-groups": {
		title: "策略组",
		description: "默认展开，优先展示地域策略组。",
		emptyText: "当前没有可展示的策略组候选。",
	},
	proxies: {
		title: "代理节点",
		description: "默认折叠，需要时再展开查看单个中转节点。",
		emptyText: "当前没有可展示的代理节点候选。",
	},
};

const groupOrder: ChainTargetGroupKind[] = ["proxy-groups", "proxies"];

function groupTargets(targets: ChainTarget[]) {
	return {
		"proxy-groups": targets.filter((target) => target.kind === "proxy-groups"),
		proxies: targets.filter((target) => target.kind === "proxies"),
	};
}

export function ChainTargetPicker({ targets, value, onChange }: ChainTargetPickerProps) {
	const [expandedGroups, setExpandedGroups] = useState<Record<ChainTargetGroupKind, boolean>>({
		"proxy-groups": true,
		proxies: false,
	});
	const groupedTargets = groupTargets(targets);

	function toggleGroup(kind: ChainTargetGroupKind) {
		setExpandedGroups((current) => ({
			...current,
			[kind]: !current[kind],
		}));
	}

	return (
		<div className="rounded-[16px] border border-line bg-panel">
			<div className="flex flex-wrap items-start justify-between gap-3 px-3 py-3">
				<div>
					<p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted">链式候选</p>
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
				{groupOrder.map((kind) => {
					const items = groupedTargets[kind];
					const expanded = expandedGroups[kind];
					const meta = groupMeta[kind];
					return (
						<div key={kind} className="overflow-hidden rounded-[14px] border border-line bg-surface not-last:mb-2">
							<button
								type="button"
								onClick={() => toggleGroup(kind)}
								aria-expanded={expanded}
								className="flex w-full items-start justify-between gap-3 px-3 py-3 text-left"
							>
								<div>
									<p className="text-sm font-semibold text-ink">{meta.title}</p>
									<p className="mt-1 text-xs leading-6 text-muted">{meta.description}</p>
								</div>
								<span className="rounded-full border border-line px-3 py-1 text-xs font-semibold text-muted">
									{expanded ? "收起" : "展开"} · {items.length}
								</span>
							</button>
							{expanded ? (
								<div className="border-t border-line p-2">
									{items.length === 0 ? (
										<p className="rounded-[12px] bg-panel px-3 py-3 text-sm leading-6 text-muted">{meta.emptyText}</p>
									) : (
										<div className="max-h-64 space-y-2 overflow-auto pr-1">
											{items.map((target) => {
												const isSelected = value === target.name;
												const isDisabled = target.isEmpty === true;
												return (
													<button
														key={`${kind}-${target.name}`}
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