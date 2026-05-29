import { useState } from "react";
import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import type { RuntimeConfigResponse } from "../../types/api";
import { Socks5Modal, PortForwardModal } from "./Modals";
import { TagInput } from "./TagInput";
import { ChevronDownIcon } from "./Icons";
import { NoticeRenderer } from "./Notice";
import { LOCALES, type Locale } from "./locales";

interface Stage1Props {
	workflow: AppWorkflowViewModel;
	locale: Locale;
	colorMode: "dark" | "light";
	runtimeConfig: RuntimeConfigResponse | null;
}

export function Stage1({ workflow, locale, colorMode, runtimeConfig }: Stage1Props) {
	const [isSocks5Open, setIsSocks5Open] = useState(false);
	const [isPortForwardOpen, setIsPortForwardOpen] = useState(false);
	const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
	const [portForwardDraftTags, setPortForwardDraftTags] = useState<string[] | null>(null);

	const { state, updateStage1Input, isConverting, isConflictReadonly } = workflow;
	const stage1Input = state.stage1Input;
	const copy = LOCALES[locale];

	const handleSocks5Submit = (uri: string) => {
		updateStage1Input(curr => ({
			...curr,
			landingRawText: curr.landingRawText ? curr.landingRawText + "\n" + uri : uri
		}));
		setIsSocks5Open(false);
	};

	const handleOpenPortForward = () => {
		setPortForwardDraftTags(curr => curr ?? stage1Input.forwardRelayItems);
		setIsPortForwardOpen(true);
	};

	const handleClosePortForward = () => {
		setIsPortForwardOpen(false);
	};

	const handlePortForwardSubmit = () => {
		const nextTags = portForwardDraftTags ?? [];
		updateStage1Input(curr => ({
			...curr,
			forwardRelayItems: nextTags
		}));
		setPortForwardDraftTags(null);
		setIsPortForwardOpen(false);
	};

	const handleRemoveForwardTag = (index: number) => {
		updateStage1Input(curr => ({
			...curr,
			forwardRelayItems: curr.forwardRelayItems.filter((_, idx) => idx !== index)
		}));
		setPortForwardDraftTags(null);
	};

	const handleToggleEnablePortForward = () => {
		const nextState = !stage1Input.advancedOptions.enablePortForward;
		updateStage1Input(curr => ({
			...curr,
			forwardRelayItems: nextState ? curr.forwardRelayItems : [],
			advancedOptions: {
				...curr.advancedOptions,
				enablePortForward: nextState
			}
		}));
		setPortForwardDraftTags(null);
	};

	const defaultTemplateURL = runtimeConfig?.defaultTemplateURL || "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini";
	const currentTemplateURL = stage1Input.advancedOptions.config ?? "";

	const handleResetTemplateURL = () => {
		updateStage1Input(curr => ({
			...curr,
			advancedOptions: {
				...curr.advancedOptions,
				config: defaultTemplateURL
			}
		}));
	};

	const errors = workflow.getPrimaryBlockingErrorsForStage("stage1");
	const messages = workflow.getStageMessages("stage1");

	const isDark = colorMode === "dark";

	return (
		<div className={`flex flex-col gap-6 backdrop-blur-xl border p-6 rounded-2xl shadow-xl transition-all duration-300 ${isDark ? "bg-zinc-900/50 border-zinc-800/80" : "bg-white border-slate-200/80 shadow-slate-100"}`}>
			<div className="flex items-center justify-between">
				<div>
					<h2 className={`text-2xl font-bold tracking-tight ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{copy.stage1Title}</h2>
					<p className={`text-sm mt-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{copy.stage1Desc}</p>
				</div>
				{workflow.stage1Status.tone === "success" && (
					<span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-semibold rounded-full border border-emerald-500/20">
						{locale === "zh" ? "转换成功" : "Converted"}
					</span>
				)}
			</div>

			<NoticeRenderer messages={messages} blockingErrors={errors} locale={locale} />

			<div className="flex flex-col md:flex-row gap-6">
				{/* 落地节点 */}
				<div className="flex-1 flex flex-col gap-2">
					<div className="flex justify-between items-center">
						<label className={`text-sm font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{copy.landingInfo}</label>
						<button 
							onClick={() => setIsSocks5Open(true)}
							disabled={isConflictReadonly}
							className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 transition-colors disabled:opacity-50"
						>
							{copy.addSocks5}
						</button>
					</div>
					<textarea
						className={`w-full h-40 border rounded-xl p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50 whitespace-pre overflow-x-auto ${isDark ? "bg-zinc-950/80 border-zinc-800 text-zinc-200 focus:border-indigo-500/50" : "bg-slate-50 border-slate-200 text-slate-800 focus:border-indigo-500/50"}`}
						placeholder={copy.landingPlaceholder}
						value={stage1Input.landingRawText}
						aria-label={copy.landingInfo}
						disabled={isConflictReadonly}
						onChange={e => updateStage1Input(c => ({ ...c, landingRawText: e.target.value }))}
					/>
					<FieldErrors errors={workflow.getStage1FieldErrors("landingRawText")} />
				</div>

				{/* 中转节点 */}
				<div className="flex-1 flex flex-col gap-2">
					<div className="flex justify-between items-center">
						<label className={`text-sm font-semibold ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{copy.transitInfo}</label>
						{stage1Input.advancedOptions.enablePortForward && (
							<button 
								onClick={handleOpenPortForward}
								disabled={isConflictReadonly}
								className="text-xs font-semibold text-indigo-500 hover:text-indigo-600 transition-colors disabled:opacity-50"
							>
								{copy.addPortForward}
							</button>
						)}
					</div>
					<textarea
						className={`w-full h-40 border rounded-xl p-3 text-sm font-mono resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all disabled:opacity-50 whitespace-pre overflow-x-auto ${isDark ? "bg-zinc-950/80 border-zinc-800 text-zinc-200 focus:border-indigo-500/50" : "bg-slate-50 border-slate-200 text-slate-800 focus:border-indigo-500/50"}`}
						placeholder={copy.transitPlaceholder}
						value={stage1Input.transitRawText}
						aria-label={copy.transitInfo}
						disabled={isConflictReadonly}
						onChange={e => updateStage1Input(c => ({ ...c, transitRawText: e.target.value }))}
					/>
					<FieldErrors errors={workflow.getStage1FieldErrors("transitRawText")} />
					
					{stage1Input.advancedOptions.enablePortForward && stage1Input.forwardRelayItems.length > 0 && (
						<ul className={`flex flex-wrap gap-2 p-2.5 border rounded-lg ${isDark ? "bg-zinc-950 border-zinc-850" : "bg-slate-50 border-slate-200"}`} aria-label={copy.portForwardTags}>
							{stage1Input.forwardRelayItems.map((item: string, index: number) => (
								<li key={`${item}-${index}`} className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20 font-mono">
									<span>{item}</span>
									<button 
										onClick={() => handleRemoveForwardTag(index)}
										aria-label={copy.removeTag.replace("{tag}", item)}
										className="hover:text-red-400 font-bold transition-colors"
									>
										&times;
									</button>
								</li>
							))}
						</ul>
					)}
					<FieldErrors errors={workflow.getStage1FieldErrors("forwardRelayItems")} />
				</div>
			</div>

			{/* 高级选项 */}
			<div className={`flex flex-col gap-3 border rounded-xl p-4 transition-all duration-300 ${isDark ? "bg-zinc-950/50 border-zinc-800/50" : "bg-slate-50 border-slate-200/50"}`}>
				<button 
					className={`flex items-center gap-2 text-sm font-semibold transition-colors w-full text-left ${isDark ? "text-zinc-300 hover:text-white" : "text-slate-700 hover:text-slate-900"}`}
					onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
					aria-expanded={isAdvancedOpen}
				>
					<ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedOpen ? "rotate-180" : ""}`} />
					{copy.advancedOptions}
				</button>
				
				{isAdvancedOpen && (
					<div className={`flex flex-col gap-5 pt-3 border-t ${isDark ? "border-zinc-800/50" : "border-slate-200/50"}`}>
						<div className="flex flex-col gap-2">
							<label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{copy.templateUrl}</label>
							<div className="flex gap-2">
								<input 
									className={`flex-1 border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all ${isDark ? "bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-indigo-500/50" : "bg-white border-slate-200 text-slate-800 focus:border-indigo-500/50"}`}
									placeholder={copy.templatePlaceholder}
									disabled={isConflictReadonly}
									value={stage1Input.advancedOptions.config ?? ""}
									onChange={e => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, config: e.target.value || null } }))}
								/>
								<button
									type="button"
									onClick={handleResetTemplateURL}
									disabled={currentTemplateURL.trim() === defaultTemplateURL.trim() || isConflictReadonly}
									className={`px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 ${isDark ? "border-zinc-800 hover:border-zinc-700 bg-zinc-900 disabled:opacity-40 text-zinc-300" : "border-slate-200 hover:border-slate-300 bg-slate-100 disabled:opacity-40 text-slate-700"}`}
									title={copy.templateResetDefault}
								>
									<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
										<path d="M21.5 2v6h-6M21.34 15.57a10 10 0 1 1-.57-8.38l5.67-5.67" />
									</svg>
									<span>{copy.templateResetDefault}</span>
								</button>
							</div>
							<FieldErrors errors={workflow.getStage1FieldErrors("config")} />
						</div>

						<div className="flex flex-col md:flex-row gap-4">
							<div className="flex-1 flex flex-col gap-2">
								<label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{copy.includeTags}</label>
								<TagInput 
									tags={stage1Input.advancedOptions.include || []}
									onChange={tags => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, include: tags.length ? tags : null } }))}
									placeholder={copy.tagPlaceholder}
								/>
								<FieldErrors errors={workflow.getStage1FieldErrors("include")} />
							</div>
							<div className="flex-1 flex flex-col gap-2">
								<label className="text-xs font-semibold text-zinc-500 uppercase tracking-wider">{copy.excludeTags}</label>
								<TagInput 
									tags={stage1Input.advancedOptions.exclude || []}
									onChange={tags => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, exclude: tags.length ? tags : null } }))}
									placeholder={copy.tagPlaceholder}
								/>
								<FieldErrors errors={workflow.getStage1FieldErrors("exclude")} />
							</div>
						</div>

						<div className="flex flex-wrap gap-6 pt-2 select-none">
							<label className="flex items-center gap-2 cursor-pointer group">
								<div className="relative flex items-center justify-center">
									<input type="checkbox" className="peer appearance-none w-5 h-5 border border-zinc-700 rounded bg-zinc-950 checked:bg-indigo-600 checked:border-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
										checked={stage1Input.advancedOptions.emoji ?? false}
										disabled={isConflictReadonly}
										onChange={e => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, emoji: e.target.checked || null } }))}
									/>
									<svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none"><path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
								</div>
								<span className={`text-sm font-medium group-hover:text-indigo-400 transition-colors ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{copy.emoji}</span>
							</label>

							<label className="flex items-center gap-2 cursor-pointer group">
								<div className="relative flex items-center justify-center">
									<input type="checkbox" className="peer appearance-none w-5 h-5 border border-zinc-700 rounded bg-zinc-950 checked:bg-indigo-600 checked:border-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
										checked={stage1Input.advancedOptions.udp ?? false}
										disabled={isConflictReadonly}
										onChange={e => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, udp: e.target.checked || null } }))}
									/>
									<svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none"><path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
								</div>
								<span className={`text-sm font-medium group-hover:text-indigo-400 transition-colors ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{copy.udp}</span>
							</label>

							<label className="flex items-center gap-2 cursor-pointer group">
								<div className="relative flex items-center justify-center">
									<input type="checkbox" className="peer appearance-none w-5 h-5 border border-zinc-700 rounded bg-zinc-950 checked:bg-indigo-600 checked:border-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
										checked={stage1Input.advancedOptions.skipCertVerify ?? false}
										disabled={isConflictReadonly}
										onChange={e => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, skipCertVerify: e.target.checked || null } }))}
									/>
									<svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none"><path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
								</div>
								<span className={`text-sm font-medium group-hover:text-indigo-400 transition-colors ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{copy.skipCertVerify}</span>
							</label>

							<div className={`w-px mx-2 ${isDark ? "bg-zinc-800" : "bg-slate-200"}`} />

							<label className="flex items-center gap-2 cursor-pointer group">
								<div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${stage1Input.advancedOptions.enablePortForward ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
									<span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${stage1Input.advancedOptions.enablePortForward ? 'translate-x-5' : 'translate-x-1'}`} />
									<input 
										type="checkbox" 
										className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
										checked={stage1Input.advancedOptions.enablePortForward}
										disabled={isConflictReadonly}
										onChange={handleToggleEnablePortForward}
										aria-label={copy.enablePortForward}
									/>
								</div>
								<span className={`text-sm font-medium group-hover:text-indigo-400 transition-colors ${isDark ? "text-zinc-300" : "text-slate-700"}`}>{copy.enablePortForward}</span>
							</label>
						</div>
					</div>
				)}
			</div>

			<div className="flex justify-end pt-2">
				<button 
					onClick={() => workflow.handleStage1Convert()}
					disabled={isConverting || isConflictReadonly || (stage1Input.landingRawText.trim() === "" && stage1Input.transitRawText.trim() === "")}
					className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center min-w-[140px]"
				>
					{isConverting ? (
						<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
					) : copy.convertAndFill}
				</button>
			</div>

			<Socks5Modal 
				isOpen={isSocks5Open} 
				onClose={() => setIsSocks5Open(false)} 
				onSubmit={handleSocks5Submit} 
				locale={locale}
			/>
			<PortForwardModal 
				isOpen={isPortForwardOpen} 
				onClose={handleClosePortForward} 
				items={portForwardDraftTags ?? stage1Input.forwardRelayItems}
				onItemsChange={setPortForwardDraftTags}
				onSubmit={handlePortForwardSubmit} 
				locale={locale}
			/>
		</div>
	);
}

function FieldErrors({ errors }: { errors: { message: string }[] }) {
	if (!errors || errors.length === 0) return null;
	return (
		<div className="flex flex-col gap-1 mt-1">
			{errors.map((e, i) => <span key={i} className="text-xs text-red-400 font-semibold">{e.message}</span>)}
		</div>
	);
}
