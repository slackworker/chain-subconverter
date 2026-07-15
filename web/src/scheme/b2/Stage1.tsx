import { useState } from "react";
import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import { DEFAULT_TEMPLATE_URL } from "../../lib/defaults";
import {
	appendForwardRelayItems,
	buildManualSocks5URI,
	removeForwardRelayItem,
	type ManualSocks5FormState,
} from "../../lib/stage1";
import { Socks5Modal, PortForwardModal } from "./Modals";
import { TagInput } from "./TagInput";
import { ChevronDownIcon } from "./Icons";
import { NoticeRenderer } from "./Notice";
import { LineNumberTextarea } from "./LineNumberTextarea";
import type { ColorMode } from "./theme";
import {
	accentLink,
	advancedDivider,
	advancedPanel,
	advancedToggle,
	cardShell,
	cardSubtitle,
	cardTitle,
	checkboxLabel,
	isDark,
	neutralBadge,
	outlineButton,
	sectionLabel,
	tagListShell,
	textInput,
} from "./theme";

function appendMultilineLine(currentValue: string, nextLine: string) {
	if (currentValue === "") {
		return nextLine;
	}
	return currentValue.endsWith("\n") ? `${currentValue}${nextLine}` : `${currentValue}\n${nextLine}`;
}

export function Stage1({
	workflow,
	templateDefaultURL = DEFAULT_TEMPLATE_URL,
	colorMode,
}: {
	workflow: AppWorkflowViewModel;
	templateDefaultURL?: string;
	colorMode: ColorMode;
}) {
	const [isSocks5Open, setIsSocks5Open] = useState(false);
	const [isPortForwardOpen, setIsPortForwardOpen] = useState(false);
	const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);
	const dark = isDark(colorMode);

	const { state, updateStage1Input, isConverting, shouldShowStage2StaleNotice } = workflow;
	const stage1Input = state.stage1Input;
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

	const statusBadgeClass =
		workflow.stage1Status.tone === "success"
			? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
			: workflow.stage1Status.tone === "warning"
				? "bg-amber-500/10 text-amber-400 border-amber-500/20"
				: neutralBadge(colorMode);

	return (
		<div className={cardShell(colorMode)}>
			<div className="flex items-center justify-between">
				<div>
					<h2 className={cardTitle(colorMode)}>1. 输入订阅信息</h2>
					<p className={cardSubtitle(colorMode)}>请填写您的落地节点与中转节点信息</p>
				</div>
				<span className={`px-3 py-1 text-xs font-semibold rounded-full border ${statusBadgeClass}`}>
					{workflow.stage1Status.label}
				</span>
			</div>

			<NoticeRenderer
				messages={messages}
				blockingErrors={errors}
				responseOriginStage={workflow.responseOriginStage}
			/>

			<div className="flex flex-col gap-6 md:flex-row">
				<div className="min-w-0 flex-1">
					<LineNumberTextarea
						id="b-stage1-landing"
						colorMode={colorMode}
						label="落地节点信息"
						labelAction={
							<button type="button" onClick={() => setIsSocks5Open(true)} className={accentLink()}>
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

				<div className="min-w-0 flex-1">
					<LineNumberTextarea
						id="b-stage1-transit"
						colorMode={colorMode}
						label="中转信息"
						labelAction={
							<button type="button" onClick={openPortForwardModal} className={accentLink()}>
								+ 端口转发
							</button>
						}
						value={stage1Input.transitRawText}
						onChange={(next) => updateStage1Input((current) => ({ ...current, transitRawText: next }))}
						placeholder="节点 URI 或订阅 URL，每行一条"
						hasError={workflow.getStage1FieldErrors("transitRawText").length > 0}
						errorText={workflow.getStage1FieldErrors("transitRawText")[0]?.message}
						bottomContent={
							stage1Input.forwardRelayItems.length > 0 ? (
								<ul className={tagListShell(colorMode)} aria-label="端口转发标签">
									{stage1Input.forwardRelayItems.map((item, index) => (
										<li
											key={`${item}-${index}`}
											className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20 font-mono"
										>
											<span>{item}</span>
											<button
												type="button"
												className="hover:text-red-400 font-bold transition-colors"
												aria-label={`移除 ${item}`}
												onClick={() => updateStage1Input((current) => removeForwardRelayItem(current, index))}
											>
												&times;
											</button>
										</li>
									))}
								</ul>
							) : null
						}
					/>
					{workflow.getStage1FieldErrors("forwardRelayItems").map((error, index) => (
						<span key={index} className="text-xs text-red-400 font-semibold mt-1 block">
							{error.message}
						</span>
					))}
				</div>
			</div>

			<div className={advancedPanel(colorMode)}>
				<button
					type="button"
					className={advancedToggle(colorMode)}
					onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
					aria-expanded={isAdvancedOpen}
				>
					<ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedOpen ? "rotate-180" : ""}`} />
					高级选项
				</button>

				{isAdvancedOpen ? (
					<div className={advancedDivider(colorMode)}>
						<div className="flex flex-col gap-2">
							<label className={sectionLabel()}>模板 URL</label>
							<div className="flex gap-2">
								<input
									className={textInput(colorMode, workflow.getStage1FieldErrors("config").length > 0)}
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
									className={outlineButton(colorMode)}
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
								<span key={index} className="text-xs text-red-400 font-semibold">
									{error.message}
								</span>
							))}
						</div>

						<div className="flex flex-col md:flex-row gap-4">
							<div className="flex-1 flex flex-col gap-2">
								<label className={sectionLabel()}>包含节点 (include)</label>
								<TagInput
									colorMode={colorMode}
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
								<label className={sectionLabel()}>排除节点 (exclude)</label>
								<TagInput
									colorMode={colorMode}
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

						<div className="flex flex-wrap gap-6 pt-2 select-none">
							<CheckboxField
								colorMode={colorMode}
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
								colorMode={colorMode}
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
								colorMode={colorMode}
								label="跳过证书校验 (scv)"
								checked={stage1Input.advancedOptions.skipCertVerify === true}
								onChange={(checked) =>
									updateStage1Input((current) => ({
										...current,
										advancedOptions: { ...current.advancedOptions, skipCertVerify: checked ? true : null },
									}))
								}
							/>

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
					className="px-6 py-3 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 active:scale-[0.98] text-white rounded-xl font-bold shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center min-w-[140px]"
				>
					{isConverting ? (
						<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
					) : (
						"转换并自动填充"
					)}
				</button>
			</div>

			<Socks5Modal
				isOpen={isSocks5Open}
				onClose={() => setIsSocks5Open(false)}
				onSubmit={handleSocks5Submit}
				colorMode={colorMode}
			/>
			<PortForwardModal
				isOpen={isPortForwardOpen}
				onClose={() => setIsPortForwardOpen(false)}
				onSubmit={submitPortForwardTags}
				colorMode={colorMode}
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
	colorMode,
}: {
	label: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	colorMode: ColorMode;
}) {
	const dark = isDark(colorMode);
	return (
		<label className="flex items-center gap-2 cursor-pointer group">
			<div className="relative flex items-center justify-center">
				<input
					type="checkbox"
					className={`peer appearance-none w-5 h-5 border rounded transition-colors cursor-pointer disabled:opacity-50 checked:bg-indigo-600 checked:border-indigo-500 ${
						dark ? "border-zinc-700 bg-zinc-950" : "border-slate-300 bg-white"
					}`}
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
			<span className={checkboxLabel(colorMode)}>{label}</span>
		</label>
	);
}
