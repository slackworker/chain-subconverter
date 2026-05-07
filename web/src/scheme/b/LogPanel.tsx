import { useState, useRef, useEffect } from "react";
import type { WorkflowLogEntry } from "../../lib/state";
import { InfoIcon, AlertTriangleIcon, AlertCircleIcon, ChevronDownIcon, TerminalIcon } from "./Icons";

interface LogPanelProps {
	entries: WorkflowLogEntry[];
}

export function LogPanel({ entries }: LogPanelProps) {
	const [isOpen, setIsOpen] = useState(false);
	const panelRef = useRef<HTMLDivElement>(null);
	const latestEntry = entries.length > 0 ? entries[entries.length - 1] : null;

	// Close when clicking outside
	useEffect(() => {
		if (!isOpen) return;
		const handleClickOutside = (e: MouseEvent) => {
			if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
				setIsOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [isOpen]);

	if (entries.length === 0) return null;

	const getLevelColor = (level: string) => {
		switch (level) {
			case "error": return "text-red-400 bg-red-400/10";
			case "warning": return "text-amber-400 bg-amber-400/10";
			case "success": return "text-emerald-400 bg-emerald-400/10";
			default: return "text-blue-400 bg-blue-400/10";
		}
	};

	const getLevelIcon = (level: string) => {
		switch (level) {
			case "error": return <AlertCircleIcon className="w-3.5 h-3.5" />;
			case "warning": return <AlertTriangleIcon className="w-3.5 h-3.5" />;
			default: return <InfoIcon className="w-3.5 h-3.5" />;
		}
	};

	return (
		<div className="fixed bottom-8 right-8 z-50 select-none" ref={panelRef}>
			{/* Expanded Panel */}
			{isOpen && (
				<div className="absolute bottom-full right-0 mb-4 w-80 max-h-[480px] bg-zinc-950/95 backdrop-blur-2xl border border-zinc-800/80 rounded-2xl shadow-[0_20px_50px_rgba(0,0,0,0.5)] overflow-hidden flex flex-col animate-in fade-in slide-in-from-bottom-4 duration-300 ease-out">
					<div className="p-4 border-b border-zinc-800/50 flex items-center justify-between bg-zinc-900/30">
						<div className="flex items-center gap-2.5">
							<TerminalIcon className="w-4 h-4 text-zinc-400" />
							<h3 className="text-sm font-semibold text-zinc-100">
								工作流日志
							</h3>
							<span className="px-1.5 py-0.5 rounded text-[10px] bg-zinc-800 text-zinc-500 font-mono font-bold">
								{entries.length}
							</span>
						</div>
						<button 
							onClick={() => setIsOpen(false)}
							className="p-1 rounded-lg text-zinc-500 hover:text-zinc-300 hover:bg-zinc-800/50 transition-all"
						>
							<ChevronDownIcon className="w-4 h-4" />
						</button>
					</div>
					<div className="overflow-y-auto p-2.5 space-y-1.5 custom-scrollbar bg-zinc-950/50">
						{entries.slice().reverse().map((entry) => (
							<div 
								key={entry.id} 
								className="p-2.5 rounded-xl hover:bg-white/[0.03] transition-colors group/item"
							>
								<div className="flex items-start gap-3.5">
									<div className={`mt-0.5 p-1.5 rounded-lg shrink-0 ${getLevelColor(entry.level)}`}>
										{getLevelIcon(entry.level)}
									</div>
									<div className="flex-1 min-w-0">
										<p className="text-[13px] text-zinc-300 leading-relaxed break-words font-medium">
											{entry.message}
										</p>
										<div className="flex items-center gap-3 mt-1.5">
											<span className="text-[10px] text-zinc-500 font-mono">
												{new Date(entry.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false })}
											</span>
											{entry.originStage && (
												<span className="text-[10px] text-zinc-600 bg-zinc-900 px-1.5 py-0.5 rounded uppercase tracking-widest font-bold">
													{entry.originStage}
												</span>
											)}
										</div>
									</div>
								</div>
							</div>
						))}
					</div>
				</div>
			)}

			{/* Floating Trigger */}
			<button
				onClick={() => setIsOpen(!isOpen)}
				className={`
					group relative flex items-center gap-3 pl-4 pr-3.5 py-2.5 rounded-full 
					bg-zinc-900/40 backdrop-blur-xl border transition-all duration-500 ease-out
					${isOpen 
						? "border-zinc-700/80 ring-8 ring-zinc-950/20 bg-zinc-900/60" 
						: "border-zinc-800/50 hover:border-zinc-600/50 hover:bg-zinc-800/40 shadow-xl hover:shadow-indigo-500/5"
					}
				`}
			>
				<div className="relative flex items-center justify-center">
					<TerminalIcon className={`w-4 h-4 transition-colors duration-300 ${isOpen ? 'text-zinc-100' : 'text-zinc-500 group-hover:text-zinc-300'}`} />
					{!isOpen && latestEntry?.level === 'error' && (
						<div className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.5)] animate-pulse"></div>
					)}
				</div>
				
				<span className={`text-[13px] font-semibold transition-colors duration-300 ${isOpen ? 'text-zinc-100' : 'text-zinc-400 group-hover:text-zinc-200'}`}>
					日志
				</span>

				{entries.length > 0 && !isOpen && (
					<span className="flex items-center justify-center min-w-[20px] h-[20px] px-1.5 text-[10px] font-black text-zinc-950 bg-zinc-100 rounded-full shadow-lg transform group-hover:scale-110 transition-transform">
						{entries.length}
					</span>
				)}
			</button>
		</div>
	);
}
