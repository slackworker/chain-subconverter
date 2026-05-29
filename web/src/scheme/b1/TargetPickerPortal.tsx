import React, { useState, useEffect, useRef, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { LOCALES, type Locale } from "./locales";
import { ChevronDownIcon } from "./Icons";

interface Choice {
	value: string;
	label: string;
	disabled?: boolean;
	isEmpty?: boolean;
	isConflict?: boolean;
}

interface ChoiceGroup {
	title: string;
	choices: Choice[];
	kind: "proxy-groups" | "proxies" | "port-forward";
}

interface TargetPickerPortalProps {
	rowKey: string;
	selectedTarget: string | null;
	placeholder: string;
	groups: ChoiceGroup[];
	disabled: boolean;
	onChange: (val: string) => void;
	locale: Locale;
	colorMode: "dark" | "light";
}

export function TargetPickerPortal({
	rowKey,
	selectedTarget,
	placeholder,
	groups,
	disabled,
	onChange,
	locale,
	colorMode,
}: TargetPickerPortalProps) {
	const [isOpen, setIsOpen] = useState(false);
	const [searchQuery, setSearchQuery] = useState("");
	const triggerRef = useRef<HTMLButtonElement>(null);
	const panelRef = useRef<HTMLDivElement>(null);
	const [coords, setCoords] = useState({ top: 0, left: 0, width: 0, maxHeight: 320 });

	const copy = LOCALES[locale];
	const isDark = colorMode === "dark";

	// Determine initial open state of sections
	// Common groups ("proxy-groups") is open by default.
	// Fixed nodes ("proxies") starts open only if the currently selected target is in Fixed Nodes.
	const isTargetInFixedNodes = selectedTarget && groups.some(g => g.kind === "proxies" && g.choices.some(c => c.value === selectedTarget));
	const [isFixedNodesOpen, setIsFixedNodesOpen] = useState(!!isTargetInFixedNodes);

	useEffect(() => {
		if (isTargetInFixedNodes) {
			setIsFixedNodesOpen(true);
		}
	}, [isTargetInFixedNodes]);

	const updatePanelPosition = () => {
		const trigger = triggerRef.current;
		if (!trigger) return;
		const rect = trigger.getBoundingClientRect();
		const gap = 4;
		const edge = 12;

		const top = rect.bottom + gap;
		const maxHeight = Math.min(
			Math.max(window.innerHeight - rect.bottom - gap - edge, 160),
			320
		);
		const maxPanelWidth = window.innerWidth - edge * 2;
		const width = Math.min(Math.max(rect.width, 180), maxPanelWidth);
		const left = Math.min(Math.max(edge, rect.left), window.innerWidth - width - edge);

		setCoords({ top, left, width, maxHeight });
	};

	useLayoutEffect(() => {
		if (!isOpen) return;
		updatePanelPosition();

		const handleScrollAndResize = () => {
			updatePanelPosition();
		};

		window.addEventListener("resize", handleScrollAndResize, { passive: true });
		window.addEventListener("scroll", handleScrollAndResize, { capture: true, passive: true });
		const tableWrap = document.querySelector(".overflow-x-auto");
		tableWrap?.addEventListener("scroll", handleScrollAndResize, { passive: true });

		return () => {
			window.removeEventListener("resize", handleScrollAndResize);
			window.removeEventListener("scroll", handleScrollAndResize, { capture: true });
			tableWrap?.removeEventListener("scroll", handleScrollAndResize);
		};
	}, [isOpen]);

	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (event: MouseEvent) => {
			const trigger = triggerRef.current;
			const panel = panelRef.current;
			if (trigger?.contains(event.target as Node) || panel?.contains(event.target as Node)) {
				return;
			}
			setIsOpen(false);
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	const handleToggle = () => {
		if (disabled) return;
		setIsOpen(prev => !prev);
		setSearchQuery("");
	};

	const handleSelect = (value: string) => {
		onChange(value);
		setIsOpen(false);
	};

	const getSelectedLabel = () => {
		if (!selectedTarget) return placeholder;
		for (const g of groups) {
			const choice = g.choices.find(c => c.value === selectedTarget);
			if (choice) return choice.label;
		}
		return selectedTarget;
	};

	const hasActiveSearch = searchQuery.trim() !== "";
	const filterChoices = (choices: Choice[]) => {
		if (!hasActiveSearch) return choices;
		const query = searchQuery.toLowerCase();
		return choices.filter(c => c.label.toLowerCase().includes(query) || c.value.toLowerCase().includes(query));
	};

	// Portal Content
	const portalContent = isOpen && (
		<div
			ref={panelRef}
			style={{
				position: "fixed",
				top: `${coords.top}px`,
				left: `${coords.left}px`,
				width: `${coords.width}px`,
				maxHeight: `${coords.maxHeight}px`,
				zIndex: 9999,
			}}
			className={`flex flex-col border rounded-xl shadow-2xl overflow-hidden transition-all duration-200 animate-in fade-in slide-in-from-top-1 duration-150 ease-out ${
				isDark 
					? "bg-zinc-950 border-zinc-800/80 text-zinc-300" 
					: "bg-white border-slate-200 text-slate-700 shadow-slate-200"
			}`}
		>
			{/* Search Input */}
			<div className={`p-2 border-b shrink-0 ${isDark ? "border-zinc-800/60 bg-zinc-900/30" : "border-slate-100 bg-slate-50"}`}>
				<input
					type="text"
					className={`w-full text-xs rounded-lg px-2.5 py-1.5 focus:outline-none focus:ring-1 focus:ring-indigo-500/50 ${
						isDark 
							? "bg-zinc-950 border-zinc-800 text-zinc-200 placeholder-zinc-700" 
							: "bg-white border-slate-200 text-slate-800 placeholder-slate-400"
					}`}
					placeholder={copy.searchPlaceholder}
					value={searchQuery}
					onChange={e => setSearchQuery(e.target.value)}
					autoFocus
				/>
			</div>

			{/* Choices List */}
			<div className="overflow-y-auto flex-1 p-1.5 space-y-2 custom-scrollbar">
				{groups.map(group => {
					const filtered = filterChoices(group.choices);
					const isCollapsible = group.kind === "proxies";
					const isSectionOpen = isCollapsible ? (hasActiveSearch || isFixedNodesOpen) : true;

					if (filtered.length === 0 && hasActiveSearch) return null;

					return (
						<div key={group.title} className="flex flex-col gap-1">
							{/* Section Header */}
							{isCollapsible ? (
								<button
									type="button"
									onClick={() => setIsFixedNodesOpen(prev => !prev)}
									className={`w-full flex items-center justify-between px-2 py-1 rounded text-[11px] font-bold uppercase tracking-wider text-left transition-colors ${
										isDark 
											? "bg-zinc-900/30 text-indigo-400 hover:bg-zinc-900/60" 
											: "bg-slate-100/60 text-indigo-600 hover:bg-slate-100"
									}`}
								>
									<span>{group.title}</span>
									<span className={`transform transition-transform ${isSectionOpen ? "rotate-90" : ""}`} aria-hidden="true">
										▶
									</span>
								</button>
							) : (
								<div className="px-2 py-1 text-[11px] font-bold uppercase tracking-wider text-zinc-500">
									{group.title}
								</div>
							)}

							{/* Section Body */}
							{isSectionOpen && (
								<ul className="space-y-0.5">
									{filtered.map(choice => {
										const isSelected = selectedTarget === choice.value;
										const isDisabled = choice.disabled;
										
										let errorText = "";
										if (isDisabled) {
											if (choice.isEmpty) {
												errorText = copy.emptyChainTarget;
											} else if (choice.isConflict) {
												errorText = copy.relayConflictHint;
											}
										}

										return (
											<li key={choice.value} title={errorText || undefined}>
												<button
													type="button"
													disabled={isDisabled}
													onClick={() => handleSelect(choice.value)}
													className={`w-full text-left px-2 py-1.5 rounded-lg text-xs font-mono transition-all flex items-center justify-between ${
														isSelected
															? "bg-indigo-600 text-white font-semibold"
															: isDisabled
																? "opacity-40 cursor-not-allowed hover:bg-transparent text-zinc-500"
																: isDark
																	? "hover:bg-zinc-900 text-zinc-300"
																	: "hover:bg-slate-100 text-slate-700"
													}`}
												>
													<span className="truncate">{choice.label}</span>
													{isDisabled && (
														<span className="text-[10px] bg-red-500/10 text-red-400 border border-red-500/20 px-1 py-0.2 rounded scale-90">
															{choice.isEmpty ? "EMPTY" : "USED"}
														</span>
													)}
												</button>
											</li>
										);
									})}
									{filtered.length === 0 && (
										<li className="text-xs italic text-zinc-600 px-2 py-1">
											{copy.noMatch}
										</li>
									)}
								</ul>
							)}
						</div>
					);
				})}

				{/* Global Empty State */}
				{groups.every(g => filterChoices(g.choices).length === 0) && (
					<div className="text-xs italic text-zinc-500 text-center py-4">
						{copy.noMatch}
					</div>
				)}
			</div>
		</div>
	);

	return (
		<div className="relative w-full">
			<button
				ref={triggerRef}
				type="button"
				onClick={handleToggle}
				disabled={disabled}
				className={`a-target-menu__trigger w-full text-left px-3 py-2 rounded-lg text-sm border font-mono flex items-center justify-between transition-all duration-200 outline-none select-none ${
					isOpen
						? "ring-2 ring-indigo-500/20 border-indigo-500"
						: isDark
							? "bg-zinc-950 border-zinc-800 text-zinc-200 hover:border-zinc-700 disabled:opacity-50"
							: "bg-white border-slate-200 text-slate-800 hover:border-slate-300 disabled:opacity-50"
				}`}
			>
				<span className={`truncate ${!selectedTarget ? (isDark ? "text-zinc-600" : "text-slate-400") : ""}`}>
					{getSelectedLabel()}
				</span>
				<ChevronDownIcon className={`w-4 h-4 shrink-0 transition-transform text-zinc-500 ${isOpen ? "rotate-180" : ""}`} />
			</button>
			{isOpen && createPortal(portalContent, document.body)}
		</div>
	);
}
