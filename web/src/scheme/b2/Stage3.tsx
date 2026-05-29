import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import type { OutputActions } from "../../lib/composition";
import { CopyIcon, DownloadIcon, ExternalLinkIcon, CheckIcon } from "./Icons";
import { NoticeRenderer } from "./Notice";
import type { ColorMode } from "./theme";
import {
	actionButton,
	cardShell,
	cardSubtitle,
	cardTitle,
	fieldLabel,
	isDark,
	neutralBadge,
} from "./theme";

export function Stage3({
	workflow,
	outputActions,
	colorMode,
}: {
	workflow: AppWorkflowViewModel;
	outputActions: OutputActions;
	colorMode: ColorMode;
}) {
	const {
		state,
		setCurrentLinkInput,
		handleRestore,
		isRestoring,
		isCreatingShortUrl,
		isGenerating,
		handlePreferShortUrl,
	} = workflow;

	const errors = workflow.getPrimaryBlockingErrorsForStage("stage3");
	const messages = workflow.getStageMessages("stage3");
	const fieldErrors = workflow.getStage3FieldErrors("currentLinkInput");
	const hasLink = state.currentLinkInput.trim() !== "";
	const dark = isDark(colorMode);

	const statusBadgeClass =
		workflow.stage3Status.tone === "success"
			? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
			: workflow.stage3Status.tone === "warning"
				? "bg-amber-500/10 text-amber-400 border-amber-500/20"
				: neutralBadge(colorMode);

	const linkShellClass = `flex flex-col md:flex-row gap-3 md:items-center rounded-xl border p-2 ${
		fieldErrors.length > 0 ? "border-red-500/70" : dark ? "border-zinc-800" : "border-slate-200"
	} ${dark ? "bg-zinc-950/80" : "bg-slate-50"}`;

	const toggleLabelClass = `text-sm font-semibold transition-colors flex items-center gap-2 ${
		dark ? "text-zinc-300 group-hover:text-zinc-100" : "text-slate-600 group-hover:text-slate-900"
	}`;

	return (
		<div className={cardShell(colorMode)}>
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className={cardTitle(colorMode)}>3. 获取订阅</h2>
					<p className={cardSubtitle(colorMode)}>复制订阅链接，或输入已有链接 / short ID 进行反向解析</p>
				</div>
				<span className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-full border ${statusBadgeClass}`}>
					{workflow.stage3Status.label}
				</span>
			</div>

			<NoticeRenderer messages={messages} blockingErrors={errors} responseOriginStage={workflow.responseOriginStage} />

			<div className="flex flex-col gap-4">
				<div className="flex flex-col gap-2">
					<label className={fieldLabel(colorMode)} htmlFor="b-current-link">
						当前链接
					</label>
					<div className={linkShellClass}>
						<input
							id="b-current-link"
							className={`flex-1 bg-transparent py-2 pl-2 pr-2 font-mono text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 ${
								dark ? "text-zinc-200 placeholder-zinc-700" : "text-slate-800 placeholder-slate-400"
							}`}
							placeholder="生成或粘贴 longUrl / shortUrl / short ID"
							value={state.currentLinkInput}
							onChange={(event) => setCurrentLinkInput(event.target.value)}
							autoComplete="off"
						/>
						<label className="flex items-center gap-2 cursor-pointer group shrink-0 px-2 select-none">
							<div
								className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
									state.preferShortUrl ? "bg-indigo-600" : dark ? "bg-zinc-700" : "bg-slate-300"
								}`}
							>
								<span
									className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
										state.preferShortUrl ? "translate-x-6" : "translate-x-1"
									}`}
								/>
								<input
									type="checkbox"
									className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
									checked={state.preferShortUrl}
									disabled={isGenerating || isCreatingShortUrl}
									onChange={(event) => void handlePreferShortUrl(event.target.checked)}
								/>
							</div>
							<span className={toggleLabelClass}>
								使用短链接
								{isCreatingShortUrl ? (
									<div className="w-3 h-3 border-2 border-indigo-400 border-t-indigo-100 rounded-full animate-spin" />
								) : null}
							</span>
						</label>
					</div>
					{fieldErrors.map((error, index) => (
						<span key={index} className="text-xs text-red-400 px-2 font-semibold">
							{error.message}
						</span>
					))}
				</div>

				<div className="flex flex-wrap gap-3">
					<button
						type="button"
						onClick={outputActions.openCurrentLink}
						disabled={!hasLink}
						className={actionButton(colorMode)}
					>
						<ExternalLinkIcon className="w-4 h-4" />
						打开预览
					</button>
					<button
						type="button"
						onClick={() => void outputActions.copyCurrentLink()}
						disabled={!hasLink}
						className={`${actionButton(colorMode)} ${
							outputActions.copyState === "done" ? "!bg-emerald-600 !text-white hover:!bg-emerald-500" : ""
						}`}
					>
						{outputActions.copyState === "done" ? (
							<CheckIcon className="w-4 h-4 text-white" />
						) : (
							<CopyIcon className="w-4 h-4" />
						)}
						{outputActions.copyState === "done" ? "已复制" : "复制链接"}
					</button>
					<button
						type="button"
						onClick={outputActions.downloadCurrentLink}
						disabled={!hasLink}
						className={actionButton(colorMode)}
					>
						<DownloadIcon className="w-4 h-4" />
						下载配置
					</button>
					<button
						type="button"
						onClick={() => void handleRestore()}
						disabled={isRestoring || !hasLink}
						className="flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] text-white rounded-xl font-bold transition-all disabled:opacity-50 disabled:scale-100"
					>
						{isRestoring ? (
							<div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
						) : (
							"反向解析"
						)}
					</button>
				</div>

				{errors.length > 0 ? (
					<div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
						{errors.map((error) => (
							<p key={`${error.code}:${error.message}`}>{error.message}</p>
						))}
					</div>
				) : null}

				{outputActions.copyState === "done" ? <p className="text-sm text-emerald-400 font-semibold">已复制到剪贴板</p> : null}
				{outputActions.copyState === "failed" ? (
					<p className="text-sm text-red-400 font-semibold">复制失败，请检查权限或手动复制</p>
				) : null}
			</div>
		</div>
	);
}
