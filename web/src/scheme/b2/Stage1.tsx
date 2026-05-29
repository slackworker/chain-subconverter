import { useState } from "react";
import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import { DEFAULT_TEMPLATE_URL } from "../../lib/defaults";
import {
	appendForwardRelayItems,
	buildManualSocks5URI,
	removeForwardRelayItem,
	setPortForwardEnabled,
	type ManualSocks5FormState,
} from "../../lib/stage1";
import { Socks5Modal, PortForwardModal } from "./Modals";
import { TagInput } from "./TagInput";
import { ChevronDownIcon } from "./Icons";
import { NoticeRenderer } from "./Notice";
import { LineNumberTextarea } from "./LineNumberTextarea";

function appendMultilineLine(currentValue: string, nextLine: string) {
	if (currentValue === "") {
		return nextLine;
	}
	return currentValue.endsWith("\n") ? `${currentValue}${nextLine}` : `${currentValue}\n${nextLine}`;
}

export function Stage1({
	workflow,
	templateDefaultURL = DEFAULT_TEMPLATE_URL,
}: {
	workflow: AppWorkflowViewModel;
	templateDefaultURL?: string;
}) {
	const [isSocks5Open, setIsSocks5Open] = useState(false);
	const [isPortForwardOpen, setIsPortForwardOpen] = useState(false);
	const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

	const { state, updateStage1Input, isConverting, shouldShowStage2StaleNotice } = workflow;
	const stage1Input = state.stage1Input;
	const portForwardEnabled = stage1Input.advancedOptions.enablePortForward;
	const stage1Empty =
		stage1Input.landingRawText.trim() === "" && stage1Input.transitRawText.trim() === "";
	const currentTemplateURL = stage1Input.advancedOptions.config ?? "";

	const errors = workflow.getPrimaryBlockingErrorsForStage("stage1");
	const messages = workflow.getStageMessages("stage1");

	function openPortForwardModal() {
		setIsPortForwardOpen(true);
	}

	function submitPortForwardTags(drafts: string[]) {
		updateStage1Input((current) => appendForwardRelayItems(current, drafts));
		setIsPortForwardOpen(false);
	}

	return (
		<div className="flex flex-col gap-6 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 p-6 rounded-2xl shadow-xl">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">1. 输入订阅信息</h2>
					<p className="text-zinc-400 text-sm mt-1">请填写您的落地节点与中转节点信息</p>
				</div>
				<span
					className={`px-3 py-1 text-xs font-medium rounded-full border ${
						workflow.stage1Status.tone === "success"
							? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
							: workflow.stage1Status.tone === "warning"
								? "bg-amber-500/10 text-amber-400 border-amber-500/20"
								: "bg-zinc-800/80 text-zinc-400 border-zinc-700/50"
					}`}
				>
					{workflow.stage1Status.label}
				</span>
			</div>

			<NoticeRenderer
				messages={messages}
				blockingErrors={errors}
				responseOriginStage={workflow.responseOriginStage}
			/>

			<div className="flex flex-col md:flex-row gap-6">
				<div className="flex-1">
					<LineNumberTextarea
						id="b-stage1-landing"
						label="落地节点信息"
						labelAction={
							<button
								type="button"
								onClick={() => setIsSocks5Open(true)}
								className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
							>
								+ 添加 SOCKS5
							</button>
						}
						value={stage1Input.landingRawText}
						onChange={(next) => updateStage1Input((current) => ({ ...current, landingRawText: next }))}
						placeholder="节点 URI 或订阅 URL，每行一条"
						hasError={workflow.getStage1FieldErrors("landingRawText").length > 0}
						errorText={workflow.getStage1FieldErrors("landingRawText")[0]?.message}
					/>
				</div>

				<div className="flex-1">
					<LineNumberTextarea
						id="b-stage1-transit"
						label="中转信息"
						labelAction={
							portForwardEnabled ? (
								<button
									type="button"
									onClick={openPortForwardModal}
									className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors"
								>
									+ 端口转发
								</button>
							) : null
						}
						value={stage1Input.transitRawText}
						onChange={(next) => updateStage1Input((current) => ({ ...current, transitRawText: next }))}
						placeholder="节点 URI 或订阅 URL，每行一条"
						hasError={workflow.getStage1FieldErrors("transitRawText").length > 0}
						errorText={workflow.getStage1FieldErrors("transitRawText")[0]?.message}
						bottomContent={
							portForwardEnabled && stage1Input.forwardRelayItems.length > 0 ? (
								<ul className="flex flex-wrap gap-2 p-2 bg-zinc-950 border border-zinc-800 rounded-lg">
									{stage1Input.forwardRelayItems.map((item, index) => (
										<li
											key={`${item}-${index}`}
											className="flex items-center gap-1.5 text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/20"
										>
											<span>{item}</span>
											<button
												type="button"
												className="hover:text-white transition-colors"
												aria-label={`移除 ${item}`}
												onClick={() => updateStage1Input((current) => removeForwardRelayItem(current, index))}
											>
												×
											</button>
										</li>
									))}
								</ul>
							) : null
						}
					/>
					{workflow.getStage1FieldErrors("forwardRelayItems").map((error, index) => (
						<span key={index} className="text-xs text-red-400 mt-1 block">
							{error.message}
						</span>
					))}
				</div>
			</div>

			<div className="flex flex-col gap-3 bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-4">
				<button
					type="button"
					className="flex items-center gap-2 text-zinc-300 text-sm font-medium hover:text-white transition-colors w-full text-left"
					onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
					aria-expanded={isAdvancedOpen}
				>
					<ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedOpen ? "rotate-180" : ""}`} />
					高级选项
				</button>

				{isAdvancedOpen ? (
					<div className="flex flex-col gap-5 pt-3 border-t border-zinc-800/50">
						<div className="flex flex-col gap-2">
							<label className="text-xs text-zinc-400">模板 URL</label>
							<div className="flex gap-2">
								<input
									className={`flex-1 bg-zinc-950 border rounded-lg p-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors ${
										workflow.getStage1FieldErrors("config").length > 0 ? "border-red-500/70" : "border-zinc-800"
									}`}
									placeholder="请使用带地域分组的模板 URL"
									value={currentTemplateURL}
									onChange={(event) =>
										updateStage1Input((current) => ({
											...current,
											advancedOptions: {
												...current.advancedOptions,
												config: event.target.value.trim() === "" ? null : event.target.value,
											},
										}))
									}
								/>
								<button
									type="button"
									className="px-3 py-2 text-xs rounded-lg border border-zinc-700 text-zinc-300 hover:bg-zinc-800 transition-colors disabled:opacity-40"
									disabled={currentTemplateURL.trim() === templateDefaultURL}
									onClick={() =>
										updateStage1Input((current) => ({
											...current,
											advancedOptions: {
												...current.advancedOptions,
												config: templateDefaultURL,
											},
										}))
									}
								>
									恢复默认
								</button>
							</div>
							{workflow.getStage1FieldErrors("config").map((error, index) => (
								<span key={index} className="text-xs text-red-400">
									{error.message}
								</span>
							))}
						</div>

						<div className="flex flex-col md:flex-row gap-4">
							<div className="flex-1 flex flex-col gap-2">
								<label className="text-xs text-zinc-400">包含节点 (include)</label>
								<TagInput
									tags={stage1Input.advancedOptions.include || []}
									onChange={(tags) =>
										updateStage1Input((current) => ({
											...current,
											advancedOptions: { ...current.advancedOptions, include: tags.length ? tags : null },
										}))
									}
									placeholder="输入后按 Enter 添加"
								/>
							</div>
							<div className="flex-1 flex flex-col gap-2">
								<label className="text-xs text-zinc-400">排除节点 (exclude)</label>
								<TagInput
									tags={stage1Input.advancedOptions.exclude || []}
									onChange={(tags) =>
										updateStage1Input((current) => ({
											...current,
											advancedOptions: { ...current.advancedOptions, exclude: tags.length ? tags : null },
										}))
									}
									placeholder="输入后按 Enter 添加"
								/>
							</div>
						</div>

						<div className="flex flex-wrap gap-6 pt-2">
							<CheckboxField
								label="emoji"
								checked={stage1Input.advancedOptions.emoji === true}
								onChange={(checked) =>
									updateStage1Input((current) => ({
										...current,
										advancedOptions: { ...current.advancedOptions, emoji: checked ? true : null },
									}))
								}
							/>
							<CheckboxField
								label="udp"
								checked={stage1Input.advancedOptions.udp === true}
								onChange={(checked) =>
									updateStage1Input((current) => ({
										...current,
										advancedOptions: { ...current.advancedOptions, udp: checked ? true : null },
									}))
								}
							/>
							<CheckboxField
								label="跳过证书校验 (scv)"
								checked={stage1Input.advancedOptions.skipCertVerify === true}
								onChange={(checked) =>
									updateStage1Input((current) => ({
										...current,
										advancedOptions: { ...current.advancedOptions, skipCertVerify: checked ? true : null },
									}))
								}
							/>

							<div className="w-px bg-zinc-800 mx-2" />

							<label className="flex items-center gap-2 cursor-pointer group">
								<div
									className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
										portForwardEnabled ? "bg-indigo-600" : "bg-zinc-700"
									}`}
								>
									<span
										className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
											portForwardEnabled ? "translate-x-5" : "translate-x-1"
										}`}
									/>
									<input
										type="checkbox"
										className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
										checked={portForwardEnabled}
										onChange={(event) => {
											const enabled = event.target.checked;
											updateStage1Input((current) => setPortForwardEnabled(current, enabled));
											if (!enabled) {
												setIsPortForwardOpen(false);
											}
										}}
									/>
								</div>
								<span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">
									启用端口转发服务
								</span>
							</label>
						</div>
					</div>
				) : null}
			</div>

			<div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 pt-2">
				{(errors.length > 0 || shouldShowStage2StaleNotice) && (
					<div className="flex flex-col gap-2 sm:mr-auto">
						{errors.length > 0 ? (
							<div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
								{errors.map((error) => (
									<p key={`${error.code}:${error.message}`}>{error.message}</p>
								))}
							</div>
						) : null}
						{shouldShowStage2StaleNotice ? (
							<div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
								已变更：请重新执行转换后再生成链接。
							</div>
						) : null}
					</div>
				)}
				<button
					type="button"
					onClick={() => void workflow.handleStage1Convert()}
					disabled={isConverting || stage1Empty}
					className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center min-w-[140px]"
				>
					{isConverting ? (
						<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
					) : (
						"转换并自动填充"
					)}
				</button>
			</div>

			<Socks5Modal isOpen={isSocks5Open} onClose={() => setIsSocks5Open(false)} onSubmit={handleSocks5Submit} />
			<PortForwardModal
				isOpen={isPortForwardOpen}
				onClose={() => setIsPortForwardOpen(false)}
				onSubmit={submitPortForwardTags}
			/>
		</div>
	);

	function handleSocks5Submit(form: ManualSocks5FormState) {
		const uri = buildManualSocks5URI(form);
		updateStage1Input((current) => ({
			...current,
			landingRawText: appendMultilineLine(current.landingRawText, uri),
		}));
		setIsSocks5Open(false);
	}
}

function CheckboxField({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
}) {
	return (
		<label className="flex items-center gap-2 cursor-pointer group">
			<div className="relative flex items-center justify-center">
				<input
					type="checkbox"
					className="peer appearance-none w-5 h-5 border border-zinc-700 rounded bg-zinc-950 checked:bg-indigo-600 checked:border-indigo-500 transition-colors cursor-pointer"
					checked={checked}
					onChange={(event) => onChange(event.target.checked)}
				/>
				<svg
					className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100"
					viewBox="0 0 14 10"
					fill="none"
					aria-hidden
				>
					<path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
				</svg>
			</div>
			<span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">{label}</span>
		</label>
	);
}
