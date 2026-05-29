import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import type { OutputActions } from "../../lib/composition";
import { CopyIcon, DownloadIcon, ExternalLinkIcon, CheckIcon } from "./Icons";
import { NoticeRenderer } from "./Notice";
import { LOCALES, type Locale } from "./locales";

interface Stage3Props {
	workflow: AppWorkflowViewModel;
	outputActions: OutputActions;
	locale: Locale;
	colorMode: "dark" | "light";
}

export function Stage3({ workflow, outputActions, locale, colorMode }: Stage3Props) {
	const { state, setCurrentLinkInput, handleRestore, isRestoring, isCreatingShortUrl, handlePreferShortUrl } = workflow;
	
	const errors = workflow.getPrimaryBlockingErrorsForStage("stage3");
	const messages = workflow.getStageMessages("stage3");
	const fieldErrors = workflow.getStage3FieldErrors("currentLinkInput");
	const copy = LOCALES[locale];
	const isDark = colorMode === "dark";

	const hasLink = state.currentLinkInput.trim() !== "";

	return (
		<div className={`flex flex-col gap-6 backdrop-blur-xl border p-6 rounded-2xl shadow-xl transition-all duration-300 ${isDark ? "bg-zinc-900/50 border-zinc-800/80" : "bg-white border-slate-200/80 shadow-slate-100"}`}>
			<div>
				<h2 className={`text-2xl font-bold tracking-tight ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{copy.stage3Title}</h2>
				<p className={`text-sm mt-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{copy.stage3Desc}</p>
			</div>

			<NoticeRenderer messages={messages} blockingErrors={errors} locale={locale} />

			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<div className="flex flex-col md:flex-row gap-3">
						<div className="flex-1 relative">
							<input 
								className={`w-full border rounded-xl py-3 pl-4 pr-32 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all ${
									isDark 
										? "bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-indigo-500/50 placeholder-zinc-700" 
										: "bg-slate-50 border-slate-200 text-slate-800 focus:border-indigo-500/50 placeholder-slate-400"
								}`}
								placeholder={copy.currentLinkPlaceholder}
								value={state.currentLinkInput}
								aria-label={copy.currentLink}
								onChange={e => setCurrentLinkInput(e.target.value)}
							/>
							<div className="absolute right-2 top-1/2 -translate-y-1/2">
								<button 
									onClick={() => handleRestore()}
									disabled={isRestoring || !hasLink}
									className={`px-4 py-1.5 rounded-lg text-sm font-semibold transition-colors disabled:opacity-50 flex items-center gap-2 ${
										isDark 
											? "bg-zinc-800 hover:bg-zinc-750 text-zinc-300" 
											: "bg-slate-200 hover:bg-slate-300 text-slate-700"
									}`}
								>
									{isRestoring ? (
										<div className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-100 rounded-full animate-spin" />
									) : copy.restore}
								</button>
							</div>
						</div>

						{/* 短链切换 */}
						<div className="flex items-center gap-3 px-2 select-none">
							<label className="flex items-center gap-2 cursor-pointer group">
								<div className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${state.preferShortUrl ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
									<span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${state.preferShortUrl ? 'translate-x-6' : 'translate-x-1'}`} />
									<input 
										type="checkbox" 
										className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
										checked={state.preferShortUrl}
										disabled={isCreatingShortUrl || (!state.generatedUrls && !hasLink)}
										onChange={e => handlePreferShortUrl(e.target.checked)}
									/>
								</div>
								<span className={`text-sm font-semibold transition-colors flex items-center gap-2 ${isDark ? "text-zinc-300 group-hover:text-zinc-100" : "text-slate-600 group-hover:text-slate-900"}`}>
									{copy.shortLink}
									{isCreatingShortUrl && <div className="w-3 h-3 border-2 border-indigo-450 border-t-indigo-100 rounded-full animate-spin" />}
								</span>
							</label>
						</div>
					</div>
					{fieldErrors.map((e, i) => (
						<span key={i} className="text-xs text-red-400 px-2 font-semibold">{e.message}</span>
					))}
				</div>

				<div className="flex flex-wrap gap-3">
					<button 
						onClick={outputActions.openCurrentLink}
						disabled={!hasLink}
						className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 active:scale-[0.98] rounded-xl font-bold transition-all disabled:opacity-50 disabled:scale-100 ${
							isDark 
								? "bg-zinc-800 hover:bg-zinc-750 text-zinc-200" 
								: "bg-slate-200 hover:bg-slate-250 text-slate-700"
						}`}
					>
						<ExternalLinkIcon className="w-4 h-4" />
						{copy.openPreview}
					</button>
					<button 
						onClick={outputActions.copyCurrentLink}
						disabled={!hasLink}
						className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 active:scale-[0.98] rounded-xl font-bold transition-all disabled:opacity-50 disabled:scale-100 ${
							outputActions.copyState === "done" 
								? "bg-emerald-600 text-white hover:bg-emerald-500" 
								: isDark 
									? "bg-zinc-800 hover:bg-zinc-750 text-zinc-200" 
									: "bg-slate-200 hover:bg-slate-250 text-slate-700"
						}`}
					>
						{outputActions.copyState === "done" ? <CheckIcon className="w-4 h-4 text-white" /> : <CopyIcon className="w-4 h-4" />}
						{outputActions.copyState === "done" ? copy.copyDone : copy.copy}
					</button>
					<button 
						onClick={outputActions.downloadCurrentLink}
						disabled={!hasLink}
						className={`flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 active:scale-[0.98] rounded-xl font-bold transition-all disabled:opacity-50 disabled:scale-100 ${
							isDark 
								? "bg-zinc-800 hover:bg-zinc-750 text-zinc-200" 
								: "bg-slate-200 hover:bg-slate-250 text-slate-700"
						}`}
					>
						<DownloadIcon className="w-4 h-4" />
						{copy.downloadYaml}
					</button>
				</div>
			</div>
		</div>
	);
}
