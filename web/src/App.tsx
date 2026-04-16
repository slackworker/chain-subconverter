import { useEffect, useState } from "react";

import { FieldErrorList } from "./components/FieldErrorList";
import { TextAreaField } from "./components/TextAreaField";
import { TextField } from "./components/TextField";
import { ToggleField } from "./components/ToggleField";
import { useAppWorkflow } from "./hooks/useAppWorkflow";
import { useUIScheme } from "./lib/scheme-context";
import type { Stage2Row } from "./types/api";

interface ManualSocks5FormState {
	name: string;
	server: string;
	port: string;
	username: string;
	password: string;
}

const initialManualSocks5FormState: ManualSocks5FormState = {
	name: "",
	server: "",
	port: "",
	username: "",
	password: "",
};

const modeLabelMap: Record<Stage2Row["mode"], string> = {
	none: "不修改",
	chain: "链式代理",
	port_forward: "端口转发",
};

function appendMultilineValue(currentValue: string, nextLine: string) {
	if (currentValue === "") {
		return nextLine;
	}
	return currentValue.endsWith("\n") ? `${currentValue}${nextLine}` : `${currentValue}\n${nextLine}`;
}

function buildManualSocks5URI(formState: ManualSocks5FormState) {
	const name = formState.name.trim();
	const server = formState.server.trim();
	const portText = formState.port.trim();
	const username = formState.username.trim();
	const password = formState.password.trim();

	if (name === "") {
		throw new Error("SOCKS5 节点名称不能为空");
	}
	if (server === "") {
		throw new Error("SOCKS5 服务器地址不能为空");
	}
	if (!/^\d+$/.test(portText)) {
		throw new Error("SOCKS5 端口必须是 1-65535 的整数");
	}
	const port = Number(portText);
	if (port < 1 || port > 65535) {
		throw new Error("SOCKS5 端口必须是 1-65535 的整数");
	}
	if ((username === "") !== (password === "")) {
		throw new Error("用户名与密码必须同时填写或同时留空");
	}

	const credentials = username === "" ? "" : `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
	return `socks5://${credentials}${server}:${port}#${encodeURIComponent(name)}`;
}

function withDownloadFlag(urlString: string) {
	try {
		const url = new URL(urlString, window.location.href);
		url.searchParams.set("download", "1");
		return url.toString();
	} catch {
		return urlString;
	}
}

export default function App() {
	const { NoticeRenderer, StageContainer, StatusDisplay, TargetChooser } = useUIScheme();
	const {
		state,
		stage2Rows,
		modeOptions,
		responseOriginStage,
		isConverting,
		isRestoring,
		isGenerating,
		isCreatingShortUrl,
		isConflictReadonly,
		isStage2Editable,
		canGenerate,
		stage1Status,
		stage2Status,
		stage3Status,
		setCurrentLinkInput,
		updateStage1Input,
		getStage2RowMeta,
		getStage2RowErrors,
		getStageMessages,
		getTargetChoices,
		handleStage1Convert,
		handleRestore,
		handleModeChange,
		handleTargetChange,
		handleGenerate,
		handlePreferShortUrl,
	} = useAppWorkflow();
	const [isAdvancedOptionsOpen, setIsAdvancedOptionsOpen] = useState(false);
	const [manualSocks5Form, setManualSocks5Form] = useState(initialManualSocks5FormState);
	const [manualSocks5Error, setManualSocks5Error] = useState<string | null>(null);
	const [forwardRelayDraft, setForwardRelayDraft] = useState("");
	const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");

	useEffect(() => {
		if (copyState === "idle") {
			return undefined;
		}
		const timer = window.setTimeout(() => setCopyState("idle"), 1800);
		return () => window.clearTimeout(timer);
	}, [copyState]);

	const currentLinkValue = state.currentLinkInput;
	const trimmedCurrentLinkValue = currentLinkValue.trim();

	function updateManualSocks5Field(field: keyof ManualSocks5FormState, value: string) {
		setManualSocks5Form((current) => ({
			...current,
			[field]: value,
		}));
		if (manualSocks5Error !== null) {
			setManualSocks5Error(null);
		}
	}

	function handleAppendManualSocks5() {
		try {
			const socks5URI = buildManualSocks5URI(manualSocks5Form);
			updateStage1Input((current) => ({
				...current,
				landingRawText: appendMultilineValue(current.landingRawText, socks5URI),
			}));
			setManualSocks5Form(initialManualSocks5FormState);
			setManualSocks5Error(null);
		} catch (error) {
			setManualSocks5Error(error instanceof Error ? error.message : "无法追加 SOCKS5 节点");
		}
	}

	function handleAddForwardRelayItem() {
		if (forwardRelayDraft === "") {
			return;
		}
		updateStage1Input((current) => ({
			...current,
			forwardRelayItems: [...current.forwardRelayItems, forwardRelayDraft],
		}));
		setForwardRelayDraft("");
	}

	function handleRemoveForwardRelayItem(index: number) {
		updateStage1Input((current) => ({
			...current,
			forwardRelayItems: current.forwardRelayItems.filter((_, itemIndex) => itemIndex !== index),
		}));
	}

	function handleOpenOutput() {
		if (trimmedCurrentLinkValue === "") {
			return;
		}
		window.open(trimmedCurrentLinkValue, "_blank", "noopener,noreferrer");
	}

	async function handleCopyOutput() {
		if (trimmedCurrentLinkValue === "") {
			return;
		}
		try {
			await navigator.clipboard.writeText(trimmedCurrentLinkValue);
			setCopyState("done");
		} catch {
			setCopyState("failed");
		}
	}

	function handleDownloadOutput() {
		if (trimmedCurrentLinkValue === "") {
			return;
		}
		const anchor = document.createElement("a");
		anchor.href = withDownloadFlag(trimmedCurrentLinkValue);
		anchor.rel = "noopener noreferrer";
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
	}

	return (
		<div className="min-h-screen bg-canvas text-ink">
			<div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-8 md:py-10">
				<main className="space-y-6">
					<NoticeRenderer messages={[]} blockingErrors={state.blockingErrors} responseOriginStage={responseOriginStage} />
					<StageContainer
						eyebrow="Stage 1"
						title="输入与自动填充"
						description="按 spec 收集落地与中转输入，修改任一输入后 Stage 2 标记过期，需重新执行转换并自动填充。"
						aside={<StatusDisplay label={stage1Status.label} tone={stage1Status.tone} />}
					>
						<NoticeRenderer messages={getStageMessages("stage1")} blockingErrors={[]} />
						<div className="grid gap-5">
							<TextAreaField
								label="落地信息"
								helper="每行一条，保留行号和横向滚动"
								placeholder="ss://...\nvmess://..."
								value={state.stage1Input.landingRawText}
								onChange={(value) => updateStage1Input((current) => ({ ...current, landingRawText: value }))}
							/>
							<FieldErrorList errors={state.blockingErrors} field="landingRawText" />
							<div className="rounded-[24px] border border-line bg-panel p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<p className="text-sm font-semibold text-ink">手动添加 SOCKS5 节点</p>
										<p className="mt-1 text-sm leading-6 text-muted">只支持 SOCKS5。提交后会生成标准 socks5 URI，并追加到落地输入区末尾。</p>
									</div>
									<button
										type="button"
										onClick={handleAppendManualSocks5}
										className="rounded-[18px] border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
									>
										追加到落地信息
									</button>
								</div>
								<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
									<TextField
										label="节点名称"
										helper="必填"
										placeholder="Tokyo Socks"
										value={manualSocks5Form.name}
										onChange={(value) => updateManualSocks5Field("name", value)}
									/>
									<TextField
										label="服务器地址"
										helper="必填"
										placeholder="relay.example.com"
										value={manualSocks5Form.server}
										onChange={(value) => updateManualSocks5Field("server", value)}
									/>
									<TextField
										label="端口"
										helper="1-65535"
										placeholder="1080"
										value={manualSocks5Form.port}
										onChange={(value) => updateManualSocks5Field("port", value)}
									/>
									<TextField
										label="用户名"
										helper="可选"
										placeholder="username"
										value={manualSocks5Form.username}
										onChange={(value) => updateManualSocks5Field("username", value)}
									/>
									<TextField
										label="密码"
										helper="与用户名成对出现"
										placeholder="password"
										value={manualSocks5Form.password}
										onChange={(value) => updateManualSocks5Field("password", value)}
									/>
								</div>
								{manualSocks5Error ? <p className="mt-3 text-sm leading-7 text-danger">{manualSocks5Error}</p> : null}
							</div>
							<TextAreaField
								label="中转信息"
								helper="支持订阅 URL、节点 URI、data:text/plain"
								placeholder="https://example.com/subscription.txt"
								value={state.stage1Input.transitRawText}
								onChange={(value) => updateStage1Input((current) => ({ ...current, transitRawText: value }))}
							/>
							<FieldErrorList errors={state.blockingErrors} field="transitRawText" />

							{state.stage1Input.advancedOptions.enablePortForward ? (
								<div className="rounded-[24px] border border-line bg-panel p-4">
									<div className="flex flex-wrap items-start justify-between gap-3">
										<div>
											<p className="text-sm font-semibold text-ink">端口转发服务</p>
											<p className="mt-1 text-sm leading-6 text-muted">TagInput 逐项录入 server:port。输入顺序会按数组保留，非法项与重复项由后端返回阻断错误。</p>
										</div>
										<button
											type="button"
											onClick={handleAddForwardRelayItem}
											className="rounded-[18px] border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
										>
											添加服务
										</button>
									</div>
									<div className="mt-4 flex flex-wrap gap-2">
										{state.stage1Input.forwardRelayItems.length === 0 ? (
											<p className="text-sm leading-7 text-muted">尚未添加端口转发服务。</p>
										) : state.stage1Input.forwardRelayItems.map((item, index) => (
											<span key={`${item}-${index}`} className="inline-flex items-center gap-2 rounded-full border border-line bg-surface px-3 py-2 text-sm text-ink">
												<span className="font-mono">{item}</span>
												<button
													type="button"
													onClick={() => handleRemoveForwardRelayItem(index)}
													className="text-xs font-semibold text-muted transition hover:text-danger"
												>
													移除
												</button>
											</span>
										))}
									</div>
									<div className="mt-4 flex flex-col gap-3 md:flex-row">
										<input
											className="w-full rounded-[20px] border border-line bg-surface px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft"
											placeholder="relay.example.com:1080"
											value={forwardRelayDraft}
											onChange={(event) => setForwardRelayDraft(event.target.value)}
											onKeyDown={(event) => {
												if (event.key === "Enter") {
													event.preventDefault();
													handleAddForwardRelayItem();
												}
											}}
										/>
										<button
											type="button"
											onClick={handleAddForwardRelayItem}
											disabled={forwardRelayDraft === ""}
											className="rounded-[20px] bg-ink px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
										>
											录入 Tag
										</button>
									</div>
								</div>
							) : null}
							<FieldErrorList errors={state.blockingErrors} field="forwardRelayItems" />

							<div className="overflow-hidden rounded-[24px] border border-line bg-panel">
								<button
									type="button"
									onClick={() => setIsAdvancedOptionsOpen((current) => !current)}
									className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
								>
									<div>
										<p className="text-sm font-semibold text-ink">高级菜单</p>
										<p className="mt-1 text-sm leading-6 text-muted">Stage 1 的高级参数统一收纳在这里；展开后可编辑 emoji、udp、证书校验、模板 URL 与过滤条件。</p>
									</div>
									<span className="rounded-full border border-line px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
										{isAdvancedOptionsOpen ? "收起" : "展开"}
									</span>
								</button>
								{isAdvancedOptionsOpen ? (
									<div className="border-t border-line px-4 py-4">
										<div className="grid gap-4 lg:grid-cols-2">
											<ToggleField
												label="Emoji"
												description="对应上游 emoji 参数；当前前端 checkbox 只在 true 与 null 之间切换。"
												checked={state.stage1Input.advancedOptions.emoji === true}
												onChange={(checked) =>
													updateStage1Input((current) => ({
														...current,
														advancedOptions: {
															...current.advancedOptions,
															emoji: checked ? true : null,
														},
													}))
												}
											/>
											<ToggleField
												label="UDP"
												description="对应上游 udp 参数；当前前端 checkbox 只在 true 与 null 之间切换。"
												checked={state.stage1Input.advancedOptions.udp === true}
												onChange={(checked) =>
													updateStage1Input((current) => ({
														...current,
														advancedOptions: {
															...current.advancedOptions,
															udp: checked ? true : null,
														},
													}))
												}
											/>
											<ToggleField
												label="跳过证书验证"
												description="业务语义对应 skip_cert_verify；当前前端 checkbox 只在 true 与 null 之间切换，实际映射到上游 scv 参数。"
												checked={state.stage1Input.advancedOptions.skipCertVerify === true}
												onChange={(checked) =>
													updateStage1Input((current) => ({
														...current,
														advancedOptions: {
															...current.advancedOptions,
															skipCertVerify: checked ? true : null,
														},
													}))
												}
											/>
											<ToggleField
												label="启用端口转发（实验性）"
												description="关闭时会隐藏并清空端口转发服务输入区。"
												checked={state.stage1Input.advancedOptions.enablePortForward}
												onChange={(checked) =>
													updateStage1Input((current) => ({
														...current,
														forwardRelayItems: checked ? current.forwardRelayItems : [],
														advancedOptions: {
															...current.advancedOptions,
															enablePortForward: checked,
														},
													}))
												}
											/>
										</div>
										<div className="mt-4 grid gap-4 lg:grid-cols-2">
											<div className="space-y-3">
												<TextField
													label="模板 URL"
													helper="留空时使用默认 Aethersailor 模板"
													placeholder="不填写将使用默认 Aethersailor 模板"
													value={state.stage1Input.advancedOptions.config ?? ""}
													inputAside={
														<span
															title="当前默认推荐模板 URL 为 https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini，上游更新可能导致规则变化。"
															aria-label="默认推荐模板提示"
															className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-warm/30 bg-warm/10 text-sm font-bold text-warm"
														>
															!
														</span>
													}
													onChange={(value) =>
														updateStage1Input((current) => ({
															...current,
															advancedOptions: {
																...current.advancedOptions,
																config: value.trim() === "" ? null : value,
															},
														}))
													}
												/>
												<p className="rounded-[18px] border border-line bg-surface px-4 py-3 text-sm leading-7 text-muted">
													! 当前默认推荐模板 URL 为 https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini，上游更新可能导致规则变化。
												</p>
												<FieldErrorList errors={state.blockingErrors} field="config" />
											</div>
											<div className="space-y-3">
												<TextField
													label="Include"
													helper="非空时透传给上游 include"
													placeholder="hk|jp"
													value={state.stage1Input.advancedOptions.include ?? ""}
													onChange={(value) =>
														updateStage1Input((current) => ({
															...current,
															advancedOptions: {
																...current.advancedOptions,
																include: value.trim() === "" ? null : value,
															},
														}))
													}
												/>
												<FieldErrorList errors={state.blockingErrors} field="include" />
												<TextField
													label="Exclude"
													helper="非空时透传给上游 exclude"
													placeholder="test|expire"
													value={state.stage1Input.advancedOptions.exclude ?? ""}
													onChange={(value) =>
														updateStage1Input((current) => ({
															...current,
															advancedOptions: {
																...current.advancedOptions,
																exclude: value.trim() === "" ? null : value,
															},
														}))
													}
												/>
												<FieldErrorList errors={state.blockingErrors} field="exclude" />
											</div>
										</div>
									</div>
								) : null}
							</div>

							<div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-dashed border-line bg-panel px-4 py-4">
								<p className="text-sm leading-7 text-muted">当前输入框已支持行号、禁止自动换行和横向滚动，长 URI 与多行订阅文本会按原始分行编辑。</p>
								<button type="button" onClick={() => void handleStage1Convert()} disabled={isConverting} className="rounded-[18px] bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
									{isConverting ? "转换中..." : "转换并自动填充"}
								</button>
							</div>
						</div>
					</StageContainer>

					<StageContainer
						eyebrow="Stage 2"
						title="配置区"
						description="Stage 2 直接消费后端返回的固定行模型；可编辑态使用当前候选列表，只读冲突态保留恢复快照以便核对。"
						aside={<StatusDisplay label={stage2Status.label} tone={stage2Status.tone} />}
					>
						<NoticeRenderer messages={getStageMessages("stage2")} blockingErrors={[]} />
						<div className="overflow-hidden rounded-[24px] border border-line">
							<div className="grid grid-cols-[1.2fr_0.8fr_1fr] bg-panel px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
								<span>落地节点</span>
								<span>配置方式</span>
								<span>目标</span>
							</div>
							{stage2Rows.length === 0 ? (
								<div className="border-t border-line bg-surface px-4 py-6 text-sm leading-7 text-muted">
									尚未获得 Stage 2 初始化结果。请先填写 Stage 1 输入并执行“转换并自动填充”。
								</div>
							) : null}
							{stage2Rows.map((row) => {
								const rowMeta = getStage2RowMeta(row.landingNodeName);
								const rowErrors = getStage2RowErrors(row.landingNodeName);
								const portForwardChoices = row.mode === "port_forward" ? getTargetChoices(row.mode) : [];
								const restrictedReason = rowMeta?.restrictedModes?.[row.mode]?.reasonText;
								return (
								<div key={row.landingNodeName} className="border-t border-line bg-surface px-4 py-4 text-sm">
									<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr_1fr] lg:items-start">
									<div>
										<p className="font-semibold text-ink">{row.landingNodeName}</p>
										<p className="text-xs text-muted">{isConflictReadonly ? "恢复冲突：当前只读展示恢复快照" : "稳定行模型由当前 stage2Init 决定"}</p>
									</div>
									<div>
										{isStage2Editable ? (
											<select
												value={row.mode}
												onChange={(event) => handleModeChange(row.landingNodeName, event.target.value as Stage2Row["mode"])}
												className="w-full rounded-[16px] border border-line bg-panel px-3 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft"
											>
												{modeOptions.map((mode) => {
													const disabledReason = rowMeta?.restrictedModes?.[mode]?.reasonText;
													return (
														<option key={mode} value={mode} disabled={disabledReason !== undefined}>
															{disabledReason ? `${modeLabelMap[mode]}（${disabledReason}）` : modeLabelMap[mode]}
														</option>
													);
												})}
											</select>
										) : (
											<div className="rounded-[16px] border border-line bg-panel px-3 py-3 text-sm text-ink">
												<p>{modeLabelMap[row.mode]}</p>
												{restrictedReason ? <p className="mt-1 text-xs text-muted">{restrictedReason}</p> : null}
											</div>
										)}
									</div>
									<div>
										{isStage2Editable && row.mode === "chain" ? (
											<TargetChooser
												targets={state.stage2Init?.chainTargets ?? []}
												value={row.targetName}
												onChange={(targetName) => handleTargetChange(row.landingNodeName, targetName ?? "")}
											/>
										) : isStage2Editable ? (
											<select
												value={row.targetName ?? ""}
												onChange={(event) => handleTargetChange(row.landingNodeName, event.target.value)}
												disabled={row.mode === "none"}
												className="w-full rounded-[16px] border border-line bg-panel px-3 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
											>
												<option value="">{row.mode === "none" ? "当前模式无需目标" : "请选择目标"}</option>
												{portForwardChoices.map((choice) => (
													<option key={choice.value} value={choice.value} disabled={choice.disabled}>
														{choice.label}
													</option>
												))}
											</select>
										) : (
											<div className="rounded-[16px] border border-line bg-panel px-3 py-3 text-sm text-ink">
												{row.targetName ?? "当前模式无需目标"}
											</div>
										)}
									</div>
									</div>
									{rowErrors.length > 0 ? (
										<div className="mt-3 space-y-2">
											{rowErrors.map((error) => (
												<p key={`${row.landingNodeName}-${error.code}-${error.message}`} className="text-sm leading-7 text-danger">
													{error.message}
												</p>
											))}
										</div>
									) : null}
								</div>
								);
							})}
						</div>
						<div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-dashed border-line bg-panel px-4 py-4 text-sm leading-7 text-muted">
							<p>
								{isConflictReadonly
									? "当前恢复快照引用的目标已失效，仅供查看；请回到 Stage 1 重新执行转换并自动填充。"
									: state.stage2Stale
										? "Stage 1 已变更，当前 Stage 2 已过期；重新转换后才允许生成链接。"
										: state.stage2Init === null
											? "Stage 2 仍在等待后端初始化结果。"
											: "当前 Stage 2 已可编辑，生成时会提交完整的 Stage 1 与 Stage 2 快照。"}
							</p>
							<button
								type="button"
								onClick={() => void handleGenerate()}
								disabled={!canGenerate}
								className="rounded-[18px] bg-ink px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
							>
								{isGenerating ? "校验并生成链接..." : "生成链接"}
							</button>
						</div>
					</StageContainer>

					<StageContainer
						eyebrow="Stage 3"
						title="输出与恢复"
						description="Stage 3 使用单一当前链接输入框承载展示、手动编辑与反向解析输入；短链切换只改变该输入框的当前值。"
						aside={<StatusDisplay label={stage3Status.label} tone={stage3Status.tone} />}
					>
						<NoticeRenderer messages={getStageMessages("stage3")} blockingErrors={[]} />
						<div className="rounded-[24px] border border-line bg-panel p-4">
							<div className="flex flex-wrap items-center justify-between gap-3">
								<div>
									<p className="text-sm font-semibold text-ink">当前链接</p>
									<p className="mt-1 text-sm leading-6 text-muted">同一输入框同时承担展示、手动编辑和反向解析输入。可粘贴 longUrl 或 shortUrl 后直接执行恢复。</p>
								</div>
								<StatusDisplay label={state.restoreStatus === "idle" ? "Idle" : state.restoreStatus} tone={state.restoreStatus === "idle" ? "neutral" : "warning"} />
							</div>
							<div className="mt-4">
								<input
									className="w-full rounded-[20px] border border-line bg-surface px-4 py-3 font-mono text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft"
									placeholder="尚未生成链接，或粘贴 longUrl / shortUrl 以恢复页面状态"
									value={currentLinkValue}
									onChange={(event) => setCurrentLinkInput(event.target.value)}
								/>
							</div>
						</div>
						{state.generatedUrls !== null ? (
							<ToggleField
								label="使用短链接"
								description={isCreatingShortUrl ? "正在创建短链接..." : "开启后优先展示短链接；首次开启时会调用 short-links 接口创建别名。"}
								checked={state.generatedUrls.preferShortUrl && state.generatedUrls.shortUrl !== null}
								disabled={isCreatingShortUrl}
								onChange={(checked) => void handlePreferShortUrl(checked)}
							/>
						) : null}
						<div className="flex flex-wrap gap-3">
							<button type="button" onClick={handleOpenOutput} disabled={trimmedCurrentLinkValue === ""} className="rounded-[18px] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-60">打开</button>
							<button type="button" onClick={() => void handleCopyOutput()} disabled={trimmedCurrentLinkValue === ""} className="rounded-[18px] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-60">{copyState === "done" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}</button>
							<button type="button" onClick={handleDownloadOutput} disabled={trimmedCurrentLinkValue === ""} className="rounded-[18px] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-60">下载</button>
							<button type="button" onClick={() => void handleRestore()} disabled={isRestoring || trimmedCurrentLinkValue === ""} className="rounded-[18px] bg-accent px-4 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">{isRestoring ? "恢复中..." : "反向解析"}</button>
						</div>
					</StageContainer>
				</main>
			</div>
		</div>
	);
}