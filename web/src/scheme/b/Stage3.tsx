import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import type { OutputActions } from "../../lib/composition";
import { CopyIcon, DownloadIcon, ExternalLinkIcon, CheckIcon } from "./Icons";
import { NoticeRenderer } from "./Notice";

export function Stage3({ workflow, outputActions }: { workflow: AppWorkflowViewModel, outputActions: OutputActions }) {
	const { state, setCurrentLinkInput, handleRestore, isRestoring, isCreatingShortUrl, handlePreferShortUrl } = workflow;
	
	const errors = workflow.getPrimaryBlockingErrorsForStage("stage3");
	const messages = workflow.getStageMessages("stage3");
	const fieldErrors = workflow.getStage3FieldErrors("currentLinkInput");

	const hasLink = state.currentLinkInput.trim() !== "";

	return (
		<div className="flex flex-col gap-6 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 p-6 rounded-2xl shadow-xl mt-6">
			<div>
				<h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">3. 获取订阅</h2>
				<p className="text-zinc-400 text-sm mt-1">复制您的订阅链接，或通过已有链接恢复配置状态</p>
			</div>

			<NoticeRenderer messages={messages} blockingErrors={errors} />

			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<div className="flex flex-col md:flex-row gap-3">
						<div className="flex-1 relative">
							<input 
								className="w-full bg-zinc-950 border border-zinc-800 rounded-xl py-3 pl-4 pr-32 text-zinc-200 font-mono text-sm focus:outline-none focus:border-indigo-500 transition-colors"
								placeholder="生成结果将显示在这里，也可输入已有链接进行反向解析"
								value={state.currentLinkInput}
								onChange={e => setCurrentLinkInput(e.target.value)}
							/>
							<div className="absolute right-2 top-1/2 -translate-y-1/2">
								<button 
									onClick={() => handleRestore()}
									disabled={isRestoring || !hasLink}
									className="px-4 py-1.5 bg-zinc-800 hover:bg-zinc-700 text-zinc-300 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 flex items-center gap-2"
								>
									{isRestoring ? (
										<div className="w-4 h-4 border-2 border-zinc-400 border-t-zinc-100 rounded-full animate-spin" />
									) : "反向解析"}
								</button>
							</div>
						</div>

						{/* 短链切换 */}
						<div className="flex items-center gap-3 px-2">
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
								<span className="text-sm font-medium text-zinc-300 group-hover:text-zinc-100 transition-colors flex items-center gap-2">
									使用短链接
									{isCreatingShortUrl && <div className="w-3 h-3 border-2 border-indigo-400 border-t-indigo-100 rounded-full animate-spin" />}
								</span>
							</label>
						</div>
					</div>
					{fieldErrors.map((e, i) => (
						<span key={i} className="text-xs text-red-400 px-2">{e.message}</span>
					))}
				</div>

				<div className="flex flex-wrap gap-3">
					<button 
						onClick={outputActions.openCurrentLink}
						disabled={!hasLink}
						className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-medium transition-colors disabled:opacity-50"
					>
						<ExternalLinkIcon className="w-4 h-4" />
						打开预览
					</button>
					<button 
						onClick={outputActions.copyCurrentLink}
						disabled={!hasLink}
						className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-medium transition-colors disabled:opacity-50"
					>
						{outputActions.copyState === "done" ? <CheckIcon className="w-4 h-4 text-emerald-400" /> : <CopyIcon className="w-4 h-4" />}
						{outputActions.copyState === "done" ? "已复制" : "复制链接"}
					</button>
					<button 
						onClick={outputActions.downloadCurrentLink}
						disabled={!hasLink}
						className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 rounded-xl font-medium transition-colors disabled:opacity-50"
					>
						<DownloadIcon className="w-4 h-4" />
						下载配置
					</button>
				</div>
			</div>
		</div>
	);
}
