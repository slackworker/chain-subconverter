import { useEffect, useId, useMemo, useState } from "react";

import type { AppPageProps } from "../../lib/composition";
import { getFieldErrors } from "../../lib/notices";
import {
	addForwardRelayItem,
	appendManualSocks5ToStage1Input,
	initialManualSocks5FormState,
	type ManualSocks5FormState,
	removeForwardRelayItem,
	setPortForwardEnabled,
} from "../../lib/stage1";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { TagField } from "./TagField";
import "./index.css";

const DEFAULT_TEMPLATE_HINT =
	"https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini";

function schemeHref(schemeId: string) {
	const base = import.meta.env.BASE_URL.replace(/\/$/, "");
	return base === "" ? `/ui/${schemeId}` : `${base}/ui/${schemeId}`;
}

function StatusPill({ label, tone }: { label: string; tone: "neutral" | "warning" | "success" }) {
	return <span className={`a-pill a-pill--${tone}`}>{label}</span>;
}

function BlockingPanel({
	globalErrors,
	stageLabel,
}: {
	globalErrors: { code: string; message: string }[];
	stageLabel?: string;
}) {
	if (globalErrors.length === 0) {
		return null;
	}
	return (
		<div className="a-blocking-flyout">
			<section className="a-panel a-panel--danger a-panel--blocking" aria-live="polite">
				<h2 className="a-panel__title">需要处理的问题</h2>
				{stageLabel ? <p className="a-panel__meta">来源：{stageLabel}</p> : null}
				<ul className="a-error-list">
					{globalErrors.map((error) => (
						<li key={`${error.code}:${error.message}`}>{error.message}</li>
					))}
				</ul>
			</section>
		</div>
	);
}

function MessagesPanel({ messages }: { messages: { level: string; message: string; code: string }[] }) {
	if (messages.length === 0) {
		return null;
	}
	const latest = messages[messages.length - 1];
	return (
		<details className="a-messages">
			<summary className="a-messages__summary">
				<span className={`a-messages__badge a-messages__badge--${latest.level}`}>{latest.level}</span>
				<span className="a-messages__preview">{latest.message}</span>
			</summary>
			<ul className="a-messages__list">
				{messages.map((message) => (
					<li key={`${message.code}:${message.message}:${message.level}`} className={`a-messages__item a-messages__item--${message.level}`}>
						{message.message}
					</li>
				))}
			</ul>
		</details>
	);
}

export function AAppPage({ workflow, outputActions }: AppPageProps) {
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
		updateStage1Input,
		getStage2RowMeta,
		getStage2RowErrors,
		getStageMessages,
		getChainTargetChoiceGroups,
		getForwardRelayChoices,
		handleStage1Convert,
		handleRestore,
		handleModeChange,
		handleTargetChange,
		handleGenerate,
		handlePreferShortUrl,
	} = workflow;

	const stage1Id = useId();
	const [socksOpen, setSocksOpen] = useState(false);
	const [socksForm, setSocksForm] = useState<ManualSocks5FormState>(initialManualSocks5FormState);
	const [socksError, setSocksError] = useState<string | null>(null);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [relayDraft, setRelayDraft] = useState("");
	const [openTargetMenuRow, setOpenTargetMenuRow] = useState<string | null>(null);
	const [primaryOpenByRow, setPrimaryOpenByRow] = useState<Record<string, boolean>>({});
	const [supplementOpenByRow, setSupplementOpenByRow] = useState<Record<string, boolean>>({});

	const globalErrors = useMemo(() => state.blockingErrors.filter((error) => error.scope === "global"), [state.blockingErrors]);

	const stageLabel = useMemo(() => {
		if (responseOriginStage === "stage1") {
			return "阶段 1";
		}
		if (responseOriginStage === "stage2") {
			return "阶段 2";
		}
		if (responseOriginStage === "stage3") {
			return "阶段 3";
		}
		return undefined;
	}, [responseOriginStage]);

	const visibleMessages = useMemo(() => {
		if (responseOriginStage === null) {
			return state.messages;
		}
		return getStageMessages(responseOriginStage);
	}, [responseOriginStage, state.messages, getStageMessages]);

	const preferShort = state.generatedUrls?.preferShortUrl ?? false;
	const hasShort = Boolean(state.generatedUrls?.shortUrl);
	const stage1Empty =
		state.stage1Input.landingRawText.trim() === "" && state.stage1Input.transitRawText.trim() === "";

	function submitSocks5() {
		try {
			updateStage1Input((current) => appendManualSocks5ToStage1Input(current, socksForm));
			setSocksForm(initialManualSocks5FormState);
			setSocksError(null);
			setSocksOpen(false);
		} catch (error) {
			setSocksError(error instanceof Error ? error.message : "表单校验失败");
		}
	}

	function appendRelayTag() {
		const trimmed = relayDraft.trim();
		if (trimmed === "") {
			return;
		}
		updateStage1Input((current) => addForwardRelayItem(current, trimmed));
		setRelayDraft("");
	}

	function setSupplementOpen(landingNodeName: string, open: boolean) {
		setSupplementOpenByRow((current) => ({
			...current,
			[landingNodeName]: open,
		}));
	}

	function setPrimaryOpen(landingNodeName: string, open: boolean) {
		setPrimaryOpenByRow((current) => ({
			...current,
			[landingNodeName]: open,
		}));
	}

	useEffect(() => {
		function handlePointerDown(event: PointerEvent) {
			const target = event.target;
			if (!(target instanceof Node)) {
				setOpenTargetMenuRow(null);
				return;
			}
			const element = target instanceof Element ? target : target.parentElement;
			if (element?.closest(".a-target-menu")) {
				return;
			}
			setOpenTargetMenuRow(null);
		}

		document.addEventListener("pointerdown", handlePointerDown, true);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
		};
	}, []);

	return (
		<div className="a-shell">
			<header className="a-header">
				<div className="a-header__brand">
					<p className="a-eyebrow">Chain Subconverter</p>
					<h1 className="a-title">方案 A · 工作流</h1>
					<p className="a-lede">三阶段自上而下：输入与转换、落地配置、链接产出与恢复。以下为方案层独立壳层与样式基线。</p>
				</div>
				<nav className="a-scheme-nav" aria-label="UI 方案切换">
					<a className="a-scheme-nav__link a-scheme-nav__link--active" href={schemeHref("a")}>
						A
					</a>
					<a className="a-scheme-nav__link" href={schemeHref("b")}>
						B
					</a>
					<a className="a-scheme-nav__link" href={schemeHref("c")}>
						C
					</a>
				</nav>
			</header>

			<BlockingPanel globalErrors={globalErrors} stageLabel={stageLabel} />
			<MessagesPanel messages={visibleMessages} />

			<main className="a-main">
				<section className="a-stage" aria-labelledby={`${stage1Id}-h`}>
					<div className="a-stage__head">
						<div>
							<h2 id={`${stage1Id}-h`} className="a-stage__title">
								阶段 1 · 输入
							</h2>
							<p className="a-stage__desc">落地与中转原文、高级选项与端口转发；完成后执行转换以生成阶段 2 基底。</p>
						</div>
						<StatusPill label={stage1Status.label} tone={stage1Status.tone} />
					</div>

					<div className="a-stage1-grid">
						<LineNumberTextarea
							id={`${stage1Id}-landing`}
							label="落地节点信息（每行一条，横向滚动）"
							value={state.stage1Input.landingRawText}
							onChange={(next) =>
								updateStage1Input((current) => ({
									...current,
									landingRawText: next,
								}))
							}
							placeholder="订阅 URL 或节点 URI，每行一条"
						/>
						<LineNumberTextarea
							id={`${stage1Id}-transit`}
							label="中转信息（每行一条）"
							value={state.stage1Input.transitRawText}
							onChange={(next) =>
								updateStage1Input((current) => ({
									...current,
									transitRawText: next,
								}))
							}
							placeholder="中转订阅、节点 URI 或 data:text/plain,..."
						/>
					</div>

					<div className="a-inline-actions">
						<button type="button" className="a-btn a-btn--secondary" onClick={() => setSocksOpen(true)}>
							手动添加 SOCKS5 节点
						</button>
					</div>

					{getFieldErrors(state.blockingErrors, "landingRawText").length > 0 ? (
						<p className="a-field-error">{getFieldErrors(state.blockingErrors, "landingRawText").map((error) => error.message).join(" ")}</p>
					) : null}
					{getFieldErrors(state.blockingErrors, "transitRawText").length > 0 ? (
						<p className="a-field-error">{getFieldErrors(state.blockingErrors, "transitRawText").map((error) => error.message).join(" ")}</p>
					) : null}

					<div className="a-advanced">
						<button type="button" className="a-advanced__toggle" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen}>
							高级选项 {advancedOpen ? "\u25BC" : "\u25B6"}
						</button>
						{advancedOpen ? (
							<div className="a-advanced__body">
								<label className="a-field a-field--inline">
									<span className="a-field-label">
										模板 URL（config）{" "}
										<span className="a-hint" title={`默认推荐模板：${DEFAULT_TEMPLATE_HINT}`} aria-label="模板 URL 说明">
											?
										</span>
									</span>
									<input
										className="a-input"
										type="text"
										value={state.stage1Input.advancedOptions.config ?? ""}
										onChange={(event) =>
											updateStage1Input((current) => ({
												...current,
												advancedOptions: {
													...current.advancedOptions,
													config: event.target.value.trim() === "" ? null : event.target.value,
												},
											}))
										}
										placeholder="请使用带地域分组的模板，留空将使用推荐的 Aethersailor 模板"
									/>
								</label>

								<div className="a-advanced__row-tags">
									<TagField
										label="include 标签"
										values={state.stage1Input.advancedOptions.include}
										onChange={(next) =>
											updateStage1Input((current) => ({
												...current,
												advancedOptions: { ...current.advancedOptions, include: next },
											}))
										}
										placeholder="输入后按 Enter 添加"
									/>
									<TagField
										label="exclude 标签"
										values={state.stage1Input.advancedOptions.exclude}
										onChange={(next) =>
											updateStage1Input((current) => ({
												...current,
												advancedOptions: { ...current.advancedOptions, exclude: next },
											}))
										}
										placeholder="输入后按 Enter 添加"
									/>
								</div>

								<div className="a-check-row">
									<label className="a-check">
										<input
											type="checkbox"
											checked={state.stage1Input.advancedOptions.emoji === true}
											onChange={(event) =>
												updateStage1Input((current) => ({
													...current,
													advancedOptions: {
														...current.advancedOptions,
														emoji: event.target.checked ? true : null,
													},
												}))
											}
										/>
										emoji
									</label>
									<label className="a-check">
										<input
											type="checkbox"
											checked={state.stage1Input.advancedOptions.udp === true}
											onChange={(event) =>
												updateStage1Input((current) => ({
													...current,
													advancedOptions: {
														...current.advancedOptions,
														udp: event.target.checked ? true : null,
													},
												}))
											}
										/>
										udp
									</label>
									<label className="a-check">
										<input
											type="checkbox"
											checked={state.stage1Input.advancedOptions.skipCertVerify === true}
											onChange={(event) =>
												updateStage1Input((current) => ({
													...current,
													advancedOptions: {
														...current.advancedOptions,
														skipCertVerify: event.target.checked ? true : null,
													},
												}))
											}
										/>
										跳过证书校验（scv）
									</label>
									<label className="a-check a-check--switch">
										<input
											type="checkbox"
											checked={state.stage1Input.advancedOptions.enablePortForward}
											onChange={(event) =>
												updateStage1Input((current) => setPortForwardEnabled(current, event.target.checked))
											}
										/>
										启用端口转发（实验性）
									</label>
								</div>

								{state.stage1Input.advancedOptions.enablePortForward ? (
									<div className="a-relay-block">
										<span className="a-field-label">端口转发服务（server:port，逐项添加）</span>
										<ul className="a-tag-list">
											{state.stage1Input.forwardRelayItems.map((item, index) => (
												<li key={`${item}-${index}`} className="a-tag-chip">
													<span className="a-tag-chip__text">{item}</span>
													<button
														type="button"
														className="a-tag-chip__remove"
														onClick={() =>
															updateStage1Input((current) => removeForwardRelayItem(current, index))
														}
														aria-label={`移除 ${item}`}
													>
														×
													</button>
												</li>
											))}
										</ul>
										<div className="a-relay-input-row">
											<input
												className="a-input"
												value={relayDraft}
												onChange={(event) => setRelayDraft(event.target.value)}
												onKeyDown={(event) => {
													if (event.key === "Enter") {
														event.preventDefault();
														appendRelayTag();
													}
												}}
												placeholder="例如10.0.0.1:8388"
											/>
											<button type="button" className="a-btn a-btn--secondary" onClick={appendRelayTag}>
												添加
											</button>
										</div>
									</div>
								) : null}
							</div>
						) : null}
					</div>

					<div className="a-stage-actions">
						<button type="button" className="a-btn a-btn--primary" disabled={isConverting || stage1Empty} onClick={() => void handleStage1Convert()}>
							{isConverting ? "转换中…" : "转换并自动填充"}
						</button>
						{state.stage2Stale && stage2Rows.length > 0 ? (
							<p className="a-stale-hint">阶段 1 已变更：请重新执行转换后再生成链接。</p>
						) : null}
					</div>
				</section>

				<section className="a-stage" aria-labelledby="a-stage2-h">
					<div className="a-stage__head">
						<div>
							<h2 id="a-stage2-h" className="a-stage__title">
								阶段 2 · 落地配置
							</h2>
							<p className="a-stage__desc">按落地节点逐行选择模式与目标；生成链接前须处于就绪且非过期状态。</p>
						</div>
						<StatusPill label={stage2Status.label} tone={stage2Status.tone} />
					</div>

					{isConflictReadonly ? (
						<p className="a-conflict-banner">
							当前恢复快照引用的目标已失效，恢复结果仅供查看。请回到阶段 1 重新执行「转换并自动填充」后再继续。
						</p>
					) : null}

					<div className="a-table-wrap">
						<table className="a-table">
							<thead>
								<tr>
									<th scope="col">落地节点</th>
									<th scope="col">节点类型</th>
									<th scope="col">配置方式</th>
									<th scope="col">目标</th>
								</tr>
							</thead>
							<tbody>
								{stage2Rows.length === 0 ? (
									<tr>
										<td colSpan={4} className="a-table__empty">
											完成阶段 1 转换后，将在此列出各行配置。
										</td>
									</tr>
								) : (
									stage2Rows.map((row, rowIndex) => {
										const meta = getStage2RowMeta(row.landingNodeName);
										const rowErrors = getStage2RowErrors(row.landingNodeName);
										const chainTargetGroups = getChainTargetChoiceGroups();
										const primaryGroup = chainTargetGroups.find((group) => group.kind === "proxy-groups") ?? null;
										const supplementGroup = chainTargetGroups.find((group) => group.kind === "proxies") ?? null;
										const forwardRelayChoices = getForwardRelayChoices(row.landingNodeName);
										const selectedInSupplement = Boolean(
											supplementGroup?.choices.some((choice) => choice.value === row.targetName),
										);
										const primaryOpen = primaryOpenByRow[row.landingNodeName] !== false;
										const supplementOpen = supplementOpenByRow[row.landingNodeName] ?? selectedInSupplement;
										const selectedTargetLabel =
											primaryGroup?.choices.find((choice) => choice.value === row.targetName)?.label ??
											supplementGroup?.choices.find((choice) => choice.value === row.targetName)?.label ??
											"请选择";
										const editable = isStage2Editable;
										const activeModeWarning = meta?.modeWarnings?.[row.mode];
										const modeWarnId = `a-s2-mode-warn-${rowIndex}`;

										return (
											<tr key={row.landingNodeName}>
												<td>
													<div className="a-cell-name">{row.landingNodeName}</div>
													{meta?.restrictedModes && Object.keys(meta.restrictedModes).length > 0 ? (
														<p className="a-cell-meta">本行存在模式限制，详见下拉禁用项提示。</p>
													) : null}
													{rowErrors.length > 0 ? (
														<ul className="a-row-errors">
															{rowErrors.map((error) => (
																<li key={`${error.code}:${error.message}`}>{error.message}</li>
															))}
														</ul>
													) : null}
												</td>
												<td>
													<div className="a-cell-type">{meta?.landingNodeType ?? "—"}</div>
												</td>
												<td>
													<div className="a-mode-cell">
														<select
															className="a-select"
															value={row.mode}
															disabled={!editable}
															aria-describedby={activeModeWarning ? modeWarnId : undefined}
															onChange={(event) =>
																handleModeChange(
																	row.landingNodeName,
																	event.target.value as typeof row.mode,
																)
															}
														>
															{modeOptions.map((mode) => {
																const restriction = meta?.restrictedModes?.[mode];
																const modeWarn = meta?.modeWarnings?.[mode];
																return (
																	<option
																		key={mode}
																		value={mode}
																		disabled={Boolean(restriction)}
																		title={modeWarn && !restriction ? modeWarn.reasonText : undefined}
																	>
																		{restriction ? `${mode}（${restriction.reasonText}）` : mode}
																	</option>
																);
															})}
														</select>
														<span className="a-mode-warning-slot">
															{activeModeWarning ? (
																<>
																	<span id={modeWarnId} className="a-sr-only">
																		{activeModeWarning.reasonText}
																	</span>
																	<span
																		className="a-mode-warning-hint"
																		title={activeModeWarning.reasonText}
																		aria-hidden="true"
																	>
																		<svg
																			xmlns="http://www.w3.org/2000/svg"
																			viewBox="0 0 24 24"
																			width="18"
																			height="18"
																			fill="none"
																			aria-hidden="true"
																		>
																			<circle
																				cx="12"
																				cy="12"
																				r="10"
																				stroke="var(--color-line)"
																				strokeWidth="2"
																			/>
																			<path
																				d="M12 8v4M12 16h.01"
																				stroke="currentColor"
																				strokeWidth="2"
																				strokeLinecap="round"
																			/>
																		</svg>
																	</span>
																</>
															) : null}
														</span>
													</div>
												</td>
												<td>
													{row.mode === "chain" ? (
														<div className="a-target-picker">
															<div className="a-target-menu">
																<button
																	type="button"
																	className={`a-select a-target-menu__trigger ${editable ? "" : "a-target-menu__summary--disabled"}`}
																	disabled={!editable}
																	aria-expanded={openTargetMenuRow === row.landingNodeName}
																	onClick={() =>
																		setOpenTargetMenuRow((current) =>
																			current === row.landingNodeName ? null : row.landingNodeName,
																		)
																	}
																>
																	{selectedTargetLabel}
																</button>
																{openTargetMenuRow === row.landingNodeName ? (
																	<div className="a-target-menu__panel">
																		<div className="a-target-menu__section">
																			<button
																				type="button"
																				className="a-target-menu__group-toggle"
																				disabled={!editable}
																				aria-expanded={primaryOpen}
																				onClick={() => setPrimaryOpen(row.landingNodeName, !primaryOpen)}
																			>
																				{primaryOpen ? "收起区域策略组" : "展开区域策略组"}
																			</button>
																			{primaryOpen ? (
																				primaryGroup?.choices.length ? (
																					<ul className="a-target-menu__list">
																						{primaryGroup.choices.map((choice) => (
																							<li key={choice.value}>
																								<button
																									type="button"
																									className={`a-target-menu__item ${row.targetName === choice.value ? "a-target-menu__item--active" : ""}`}
																									disabled={!editable || choice.disabled}
																									onClick={() => {
																										handleTargetChange(row.landingNodeName, choice.value);
																										setOpenTargetMenuRow(null);
																									}}
																								>
																									{choice.label}
																								</button>
																							</li>
																						))}
																					</ul>
																				) : (
																					<p className="a-picker-help">{primaryGroup?.emptyText ?? "暂无常用候选"}</p>
																				)
																			) : null}
																		</div>
																		{supplementGroup ? (
																			<div className="a-target-menu__section">
																				<button
																					type="button"
																					className="a-target-menu__group-toggle"
																					disabled={!editable}
																					aria-expanded={supplementOpen}
																					onClick={() => setSupplementOpen(row.landingNodeName, !supplementOpen)}
																				>
																					{supplementOpen ? "收起节点" : "展开节点"}
																				</button>
																				{supplementOpen ? (
																					<ul className="a-target-menu__list">
																						{supplementGroup.choices.map((choice) => (
																							<li key={choice.value}>
																								<button
																									type="button"
																									className={`a-target-menu__item ${row.targetName === choice.value ? "a-target-menu__item--active" : ""}`}
																									disabled={!editable || choice.disabled}
																									onClick={() => {
																										handleTargetChange(row.landingNodeName, choice.value);
																										setOpenTargetMenuRow(null);
																									}}
																								>
																									{choice.label}
																								</button>
																							</li>
																						))}
																					</ul>
																				) : null}
																			</div>
																		) : null}
																	</div>
																) : null}
															</div>
														</div>
													) : (
														<select
															className="a-select"
															value={row.targetName ?? ""}
															disabled={!editable || row.mode === "none"}
															onChange={(event) =>
																handleTargetChange(
																	row.landingNodeName,
																	event.target.value === "" ? "" : event.target.value,
																)
															}
														>
															<option value="">{row.mode === "none" ? "—" : "请选择"}</option>
															{forwardRelayChoices.map((choice) => (
																<option key={choice.value} value={choice.value} disabled={choice.disabled}>
																	{choice.label}
																</option>
															))}
														</select>
													)}
												</td>
											</tr>
										);
									})
								)}
							</tbody>
						</table>
					</div>

					<div className="a-stage-actions">
						<button type="button" className="a-btn a-btn--primary" disabled={!canGenerate || isGenerating} onClick={() => void handleGenerate()}>
							{isGenerating ? "生成中…" : "生成链接"}
						</button>
					</div>
				</section>

				<section className="a-stage" aria-labelledby="a-stage3-h">
					<div className="a-stage__head">
						<div>
							<h2 id="a-stage3-h" className="a-stage__title">
								阶段 3 · 链接与恢复
							</h2>
							<p className="a-stage__desc">当前订阅链接触发打开、复制与下载；亦可粘贴已有长/短链进行反向解析恢复。</p>
						</div>
						<StatusPill label={stage3Status.label} tone={stage3Status.tone} />
					</div>

					<label className="a-field" htmlFor="a-current-link">
						<span className="a-field-label">当前链接（展示值与反向解析输入）</span>
						<input
							id="a-current-link"
							className="a-input a-input--mono"
							type="url"
							value={state.currentLinkInput}
							onChange={(event) => workflow.setCurrentLinkInput(event.target.value)}
							placeholder="生成或粘贴 longUrl / shortUrl"
							autoComplete="off"
						/>
					</label>

					{state.generatedUrls ? (
						<label className="a-check a-check--block">
							<input
								type="checkbox"
								checked={preferShort}
								disabled={isCreatingShortUrl}
								onChange={(event) => void handlePreferShortUrl(event.target.checked)}
							/>
							使用短链接展示
							{isCreatingShortUrl ? <span className="a-inline-muted">（创建短链中…）</span> : null}
							{hasShort ? null : preferShort ? <span className="a-inline-muted">（将请求创建短链）</span> : null}
						</label>
					) : null}

					<div className="a-output-actions">
						<button type="button" className="a-btn a-btn--secondary" onClick={outputActions.openCurrentLink}>
							打开预览
						</button>
						<button type="button" className="a-btn a-btn--secondary" onClick={() => void outputActions.copyCurrentLink()}>
							复制
						</button>
						<button type="button" className="a-btn a-btn--secondary" onClick={outputActions.downloadCurrentLink}>
							下载 YAML
						</button>
						<button type="button" className="a-btn a-btn--primary" disabled={isRestoring || state.currentLinkInput.trim() === ""} onClick={() => void handleRestore()}>
							{isRestoring ? "反向解析中…" : "反向解析"}
						</button>
					</div>

					{outputActions.copyState === "done" ? <p className="a-toast a-toast--ok">已复制到剪贴板</p> : null}
					{outputActions.copyState === "failed" ? <p className="a-toast a-toast--err">复制失败，请检查权限或手动复制</p> : null}
				</section>
			</main>

			{socksOpen ? (
				<div className="a-modal-backdrop" role="presentation" onClick={() => setSocksOpen(false)}>
					<div
						className="a-modal"
						role="dialog"
						aria-modal
						aria-labelledby="a-socks-title"
						onClick={(event) => event.stopPropagation()}
					>
						<h2 id="a-socks-title" className="a-modal__title">
							手动添加 SOCKS5
						</h2>
						<div className="a-modal__grid">
							<label className="a-field">
								<span className="a-field-label">名称</span>
								<input className="a-input" value={socksForm.name} onChange={(event) => setSocksForm((form) => ({ ...form, name: event.target.value }))} />
							</label>
							<label className="a-field">
								<span className="a-field-label">服务器</span>
								<input className="a-input" value={socksForm.server} onChange={(event) => setSocksForm((form) => ({ ...form, server: event.target.value }))} />
							</label>
							<label className="a-field">
								<span className="a-field-label">端口</span>
								<input className="a-input" value={socksForm.port} onChange={(event) => setSocksForm((form) => ({ ...form, port: event.target.value }))} />
							</label>
							<label className="a-field">
								<span className="a-field-label">用户名（可选）</span>
								<input className="a-input" value={socksForm.username} onChange={(event) => setSocksForm((form) => ({ ...form, username: event.target.value }))} />
							</label>
							<label className="a-field">
								<span className="a-field-label">密码（可选）</span>
								<input className="a-input" type="password" value={socksForm.password} onChange={(event) => setSocksForm((form) => ({ ...form, password: event.target.value }))} />
							</label>
						</div>
						{socksError ? <p className="a-field-error">{socksError}</p> : null}
						<div className="a-modal__actions">
							<button type="button" className="a-btn a-btn--secondary" onClick={() => setSocksOpen(false)}>
								取消
							</button>
							<button type="button" className="a-btn a-btn--primary" onClick={submitSocks5}>
								追加到落地输入区
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
