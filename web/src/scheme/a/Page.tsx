import { useEffect, useId, useRef, useState } from "react";

import type { AppPageProps } from "../../lib/composition";
import {
	getGlobalPrimaryBlockingErrors,
	getOriginStageLabel,
} from "../../lib/notices";
import {
	addForwardRelayItem,
	buildManualSocks5URI,
	initialManualSocks5FormState,
	parseSocks5URIToManualSocks5FormState,
	type ManualSocks5FormState,
	removeForwardRelayItem,
} from "../../lib/stage1";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { TagField } from "./TagField";
import "./index.css";

const DEFAULT_TEMPLATE_HINT =
	"https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini";
const LOCAL_ERROR_ARIA_HINT = "该位置存在错误，请查看当前阶段反馈条。";

function appendMultilineLine(currentValue: string, nextLine: string) {
	if (currentValue === "") {
		return nextLine;
	}
	return currentValue.endsWith("\n") ? `${currentValue}${nextLine}` : `${currentValue}\n${nextLine}`;
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

/** 与 spec「originStage 内主反馈」一致：主阻断摘要锚在阶段动作区，不用顶部全局 flyout；字段/行内 scope 提示仍单独展示（见 04-business-rules 局部提示规则）。 */
function OriginAnchoredBlockingStrip({
	errors,
	stageLabel,
}: {
	errors: { code: string; message: string }[];
	stageLabel?: string;
}) {
	if (errors.length === 0) {
		return null;
	}
	return (
		<div className="a-stage-feedback-strip a-stage-feedback-strip--danger" role="status" aria-live="polite">
			<span className="a-stage-feedback-strip__stage">{stageLabel ?? "当前阶段"}</span>
			<span className="a-stage-feedback-strip__msg">
				{errors.map((error) => (
					<span key={`${error.code}:${error.message}`} className="a-stage-feedback-strip__line">
						{error.message}
					</span>
				))}
			</span>
		</div>
	);
}

function MessagesPanel({ messages }: { messages: { level: string; message: string; code: string }[] }) {
	const [open, setOpen] = useState(false);
	const containerRef = useRef<HTMLDivElement | null>(null);
	const latest = messages.length > 0 ? messages[messages.length - 1] : null;
	const panelId = "a-log-drawer";

	useEffect(() => {
		if (!open) {
			return;
		}

		function handlePointerDown(event: PointerEvent) {
			const target = event.target;
			if (!(target instanceof Node)) {
				return;
			}
			if (!containerRef.current?.contains(target)) {
				setOpen(false);
			}
		}

		function handleKeyDown(event: KeyboardEvent) {
			if (event.key === "Escape") {
				setOpen(false);
			}
		}

		document.addEventListener("pointerdown", handlePointerDown, true);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [open]);

	return (
		<div className="a-log-hub" ref={containerRef}>
			<button
				type="button"
				className="a-log-hub__toggle"
				aria-expanded={open}
				aria-controls={panelId}
				onClick={() => setOpen((current) => !current)}
			>
				<span className="a-log-hub__label">日志</span>
				<span className="a-log-hub__count">{messages.length}</span>
				{latest ? (
					<span className={`a-messages__badge a-messages__badge--${latest.level}`}>{latest.level}</span>
				) : (
					<span className="a-messages__badge a-messages__badge--empty">none</span>
				)}
			</button>

			<section
				id={panelId}
				className={`a-messages a-log-hub__panel ${open ? "a-log-hub__panel--open" : ""}`}
				aria-label="消息日志"
				aria-hidden={!open}
			>
				<p className="a-log-hub__panel-title">消息日志</p>
				{latest ? <p className="a-messages__preview">{latest.message}</p> : <p className="a-messages__preview a-messages__preview--muted">暂无日志</p>}
				{messages.length > 0 ? (
					<ul className="a-messages__list">
						{messages.map((message) => (
							<li key={`${message.code}:${message.message}:${message.level}`} className={`a-messages__item a-messages__item--${message.level}`}>
								{message.message}
							</li>
						))}
					</ul>
				) : (
					<p className="a-messages__empty">当前阶段后端未返回 messages（这通常是正常情况）</p>
				)}
			</section>
		</div>
	);
}

export function AAppPage({ workflow, outputActions, primaryBlockingFeedbackPlacement }: AppPageProps) {
	const {
		state,
		stage2Rows,
		modeOptions,
		originStageLabel,
		responseOriginStage,
		visibleMessages,
		shouldShowStage2StaleNotice,
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
		getStage1FieldErrors,
		getStage3FieldErrors,
		getStage2RowMeta,
		getStage2RowErrors,
		getPrimaryBlockingErrorsForStage,
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
	const [socksURI, setSocksURI] = useState("");
	const [socksError, setSocksError] = useState<string | null>(null);
	const [portForwardOpen, setPortForwardOpen] = useState(false);
	const [portForwardDraftTags, setPortForwardDraftTags] = useState<string[] | null>([]);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [openTargetMenuRow, setOpenTargetMenuRow] = useState<string | null>(null);
	const [primaryOpenByRow, setPrimaryOpenByRow] = useState<Record<string, boolean>>({});
	const [supplementOpenByRow, setSupplementOpenByRow] = useState<Record<string, boolean>>({});

	const preferShort = state.preferShortUrl;
	const hasShort = Boolean(state.generatedUrls?.shortUrl);
	const stage1Empty =
		state.stage1Input.landingRawText.trim() === "" && state.stage1Input.transitRawText.trim() === "";

	const stage1PrimaryBlockingErrors = getPrimaryBlockingErrorsForStage("stage1");
	const stage2PrimaryBlockingErrors = state.stage2Stale || isConflictReadonly ? [] : getPrimaryBlockingErrorsForStage("stage2");
	const stage3PrimaryBlockingErrors = getPrimaryBlockingErrorsForStage("stage3");
	const globalPrimaryBlockingErrors = getGlobalPrimaryBlockingErrors(
		state.blockingErrors,
		responseOriginStage,
		primaryBlockingFeedbackPlacement,
	);
	const showGlobalBlockingFlyout = globalPrimaryBlockingErrors.length > 0;
	const landingFieldErrors = getStage1FieldErrors("landingRawText");
	const transitFieldErrors = getStage1FieldErrors("transitRawText");
	const forwardRelayErrors = getStage1FieldErrors("forwardRelayItems");
	const configFieldErrors = getStage1FieldErrors("config");
	const currentLinkFieldErrors = getStage3FieldErrors("currentLinkInput");
	const landingErrorId = `${stage1Id}-landing-error`;
	const transitErrorId = `${stage1Id}-transit-error`;
	const configErrorId = `${stage1Id}-config-error`;
	const currentLinkErrorId = "a-current-link-error";

	function submitSocks5() {
		try {
			const socksURIToAppend = buildManualSocks5URI(socksForm);
			updateStage1Input((current) => ({
				...current,
				landingRawText: appendMultilineLine(current.landingRawText, socksURIToAppend),
			}));
			setSocksForm(initialManualSocks5FormState);
			setSocksURI("");
			setSocksError(null);
			closeSocksModal();
		} catch (error) {
			setSocksError(error instanceof Error ? error.message : "表单校验失败");
		}
	}

	function parseSocks5URIOnBlur() {
		const trimmedURI = socksURI.trim();
		if (trimmedURI === "") {
			setSocksError(null);
			return;
		}

		try {
			const parsed = parseSocks5URIToManualSocks5FormState(trimmedURI);
			setSocksForm(parsed);
			setSocksError(null);
		} catch (error) {
			setSocksError(error instanceof Error ? error.message : "SOCKS5 URI 解析失败");
		}
	}

	function openPortForwardModal() {
		setPortForwardDraftTags([]);
		setPortForwardOpen(true);
	}

	function openSocksModal() {
		setSocksError(null);
		setSocksOpen(true);
	}

	function closeSocksModal() {
		setSocksError(null);
		setSocksOpen(false);
	}

	function submitPortForwardTags() {
		const nextTags = (portForwardDraftTags ?? []).map((tag) => tag.trim()).filter((tag) => tag !== "");
		updateStage1Input((current) => {
			const withAppendedTags = nextTags.reduce((acc, tag) => addForwardRelayItem(acc, tag), current);
			return {
				...withAppendedTags,
				advancedOptions: {
					...withAppendedTags.advancedOptions,
					enablePortForward: true,
				},
			};
		});
		setPortForwardDraftTags([]);
		setPortForwardOpen(false);
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
					<h1 className="a-title">链式代理 · 订阅转换</h1>
					<p className="a-lede">一站式 链式代理 · 订阅转换工具 for Mihomo</p>
				</div>
				<nav className="a-scheme-nav" aria-label="快捷操作">
					<button
						type="button"
						className="a-scheme-nav__link a-scheme-nav__link--icon"
						aria-label="切换语言（预留）"
						title="切换语言（预留）"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
							<path
								d="M3 12h18M12 3a15 15 0 0 1 0 18M12 3a15 15 0 0 0 0 18M4.8 7.5h14.4M4.8 16.5h14.4M12 3a9 9 0 1 1 0 18a9 9 0 0 1 0-18Z"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</button>
					<button
						type="button"
						className="a-scheme-nav__link a-scheme-nav__link--icon"
						aria-label="切换亮暗主题（预留）"
						title="切换亮暗主题（预留）"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
							<path
								d="M21 12.8A8.8 8.8 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</button>
					<a
						className="a-scheme-nav__link a-scheme-nav__link--icon"
						aria-label="打开 GitHub 仓库"
						title="打开 GitHub 仓库"
						href="https://github.com/slackworker/chain-subconverter"
						target="_blank"
						rel="noopener noreferrer"
					>
						<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
							<path
								d="M9 19c-4.3 1.4-4.3-2.5-6-3m12 6v-3.5c0-1 .1-1.4-.5-2c2.8-.3 5.5-1.4 5.5-6a4.6 4.6 0 0 0-1.3-3.2 4.2 4.2 0 0 0-.1-3.2s-1.1-.3-3.5 1.3a12.3 12.3 0 0 0-6.2 0c-2.4-1.6-3.5-1.3-3.5-1.3a4.2 4.2 0 0 0-.1 3.2 4.6 4.6 0 0 0-1.3 3.2c0 4.6 2.7 5.7 5.5 6c-.6.6-.6 1.2-.5 2V22"
								stroke="currentColor"
								strokeWidth="1.8"
								strokeLinecap="round"
								strokeLinejoin="round"
							/>
						</svg>
					</a>
				</nav>
			</header>

			{showGlobalBlockingFlyout ? (
				<BlockingPanel globalErrors={globalPrimaryBlockingErrors} stageLabel={originStageLabel} />
			) : null}
			<MessagesPanel messages={visibleMessages} />

			<main className="a-main">
				<section className="a-stage" aria-labelledby={`${stage1Id}-h`}>
					<div className="a-stage__head">
						<div>
							<h2 id={`${stage1Id}-h`} className="a-stage__title">
								阶段 1 · 输入
							</h2>
							<p className="a-stage__desc">输入落地与中转信息，执行转换以生成阶段 2 配置基底。</p>
						</div>
						<StatusPill label={stage1Status.label} tone={stage1Status.tone} />
					</div>

					<div className="a-stage1-grid">
						<LineNumberTextarea
							id={`${stage1Id}-landing`}
							label="落地信息"
							labelAction={
								<button type="button" className="a-btn a-btn--secondary a-btn--compact" onClick={openSocksModal}>
									+SOCKS5
								</button>
							}
							value={state.stage1Input.landingRawText}
							onChange={(next) =>
								updateStage1Input((current) => ({
									...current,
									landingRawText: next,
								}))
							}
							placeholder="订阅 URL 或节点 URI，每行一条"
							hasError={landingFieldErrors.length > 0}
							errorId={landingErrorId}
							errorText={landingFieldErrors[0]?.message}
						/>
						<LineNumberTextarea
							id={`${stage1Id}-transit`}
							label="中转信息"
							labelAction={
								<button type="button" className="a-btn a-btn--secondary a-btn--compact" onClick={openPortForwardModal}>
									+端口转发
								</button>
							}
							value={state.stage1Input.transitRawText}
							onChange={(next) =>
								updateStage1Input((current) => ({
									...current,
									transitRawText: next,
								}))
							}
							placeholder="机场订阅、节点 URI 或 data:text/plain,..."
							bottomLeftContent={
								state.stage1Input.forwardRelayItems.length > 0 ? (
									<ul className={`a-tag-list ${forwardRelayErrors.length > 0 ? "a-tag-list--error" : ""}`} aria-label="端口转发标签">
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
								) : null
							}
							hasError={transitFieldErrors.length > 0}
							errorId={transitErrorId}
							errorText={transitFieldErrors[0]?.message}
						/>
					</div>

					<div className="a-stage1-actions-wrap">
						<button type="button" className="a-advanced__toggle" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen}>
							高级选项
						</button>
						{advancedOpen ? (
							<div className="a-advanced">
								<div className="a-advanced__body">
								<label className="a-field a-field--inline">
									<span className="a-field-label">
										模板 URL（config）{" "}
										<span className="a-hint" title={`默认推荐模板：${DEFAULT_TEMPLATE_HINT}`} aria-label="模板 URL 说明">
											?
										</span>
									</span>
									<input
										className={`a-input ${configFieldErrors.length > 0 ? "a-input--error" : ""}`}
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
										aria-invalid={configFieldErrors.length > 0 ? true : undefined}
										aria-describedby={configFieldErrors.length > 0 ? configErrorId : undefined}
									/>
									{configFieldErrors.length > 0 ? (
										<p id={configErrorId} className="a-sr-only" role="status">
											{LOCAL_ERROR_ARIA_HINT}
										</p>
									) : null}
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
								</div>
								</div>
							</div>
						) : null}

						<div className="a-stage-actions a-stage-actions--stage1">
							<button type="button" className="a-btn a-btn--primary" disabled={isConverting || stage1Empty} onClick={() => void handleStage1Convert()}>
								{isConverting ? "转换中…" : "转换并自动填充"}
							</button>
							{(stage1PrimaryBlockingErrors.length > 0 || shouldShowStage2StaleNotice) ? (
								<div className="a-stage-actions__feedback">
									{stage1PrimaryBlockingErrors.length > 0 ? (
										<OriginAnchoredBlockingStrip errors={stage1PrimaryBlockingErrors} stageLabel={originStageLabel} />
									) : null}
									{shouldShowStage2StaleNotice ? (
										<div className="a-stage-feedback-strip a-stage-feedback-strip--warning" role="status">
											<span className="a-stage-feedback-strip__stage">{getOriginStageLabel("stage1")}</span>
											<span className="a-stage-feedback-strip__msg">已变更：请重新执行转换后再生成链接。</span>
										</div>
									) : null}
								</div>
							) : null}
						</div>
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
										const rowErrorId = `a-s2-row-error-${rowIndex}`;

										return (
											<tr key={row.landingNodeName} className={rowErrors.length > 0 ? "a-table__row--error" : ""}>
												<td>
													<div className="a-cell-name">{row.landingNodeName}</div>
													{meta?.restrictedModes && Object.keys(meta.restrictedModes).length > 0 ? (
														<p className="a-cell-meta">本行存在模式限制，详见下拉禁用项提示。</p>
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
															aria-invalid={rowErrors.length > 0 ? true : undefined}
															aria-describedby={[
																activeModeWarning ? modeWarnId : null,
																rowErrors.length > 0 ? rowErrorId : null,
															]
																.filter(Boolean)
																.join(" ") || undefined}
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
																				<span className="a-target-menu__group-label">区域策略组</span>
																				<span className={`a-target-menu__group-icon ${primaryOpen ? "is-open" : ""}`} aria-hidden="true">
																					▾
																				</span>
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
																					<span className="a-target-menu__group-label">固定节点</span>
																					<span className={`a-target-menu__group-icon ${supplementOpen ? "is-open" : ""}`} aria-hidden="true">
																						▾
																					</span>
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
															aria-invalid={rowErrors.length > 0 ? true : undefined}
															aria-describedby={rowErrors.length > 0 ? rowErrorId : undefined}
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
													{rowErrors.length > 0 ? (
														<p id={rowErrorId} className="a-sr-only" role="status">
															{LOCAL_ERROR_ARIA_HINT}
														</p>
													) : null}
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
						{stage2PrimaryBlockingErrors.length > 0 ? (
							<div className="a-stage-actions__feedback">
								<OriginAnchoredBlockingStrip errors={stage2PrimaryBlockingErrors} stageLabel={originStageLabel} />
							</div>
						) : null}
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

					<div className="a-field">
						<label className="a-field-label" htmlFor="a-current-link">
							当前链接（展示值与反向解析输入）
						</label>
						<div className="a-current-link-row">
							<input
								id="a-current-link"
								className={`a-input a-input--mono ${currentLinkFieldErrors.length > 0 ? "a-input--error" : ""}`}
								type="url"
								value={state.currentLinkInput}
								onChange={(event) => setCurrentLinkInput(event.target.value)}
								placeholder="生成或粘贴 longUrl / shortUrl"
								autoComplete="off"
								aria-invalid={currentLinkFieldErrors.length > 0 ? true : undefined}
								aria-describedby={currentLinkFieldErrors.length > 0 ? currentLinkErrorId : undefined}
							/>
							<label className="a-check a-check--block a-check--switch">
								<input
									className="a-switch__input"
									type="checkbox"
									checked={preferShort}
									disabled={isGenerating || isCreatingShortUrl}
									onChange={(event) => void handlePreferShortUrl(event.target.checked)}
								/>
								<span className="a-switch" aria-hidden />
								短链接
								{isCreatingShortUrl ? <span className="a-inline-muted">（创建短链中…）</span> : null}
							</label>
						</div>
						{currentLinkFieldErrors.length > 0 ? (
							<p id={currentLinkErrorId} className="a-sr-only" role="status">
								{LOCAL_ERROR_ARIA_HINT}
							</p>
						) : null}
					</div>

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

					{stage3PrimaryBlockingErrors.length > 0 ? (
						<div className="a-stage-actions">
							<div className="a-stage-actions__feedback">
								<OriginAnchoredBlockingStrip errors={stage3PrimaryBlockingErrors} stageLabel={originStageLabel} />
							</div>
						</div>
					) : null}

					{outputActions.copyState === "done" ? <p className="a-toast a-toast--ok">已复制到剪贴板</p> : null}
					{outputActions.copyState === "failed" ? <p className="a-toast a-toast--err">复制失败，请检查权限或手动复制</p> : null}
				</section>
			</main>

			{socksOpen ? (
				<div className="a-modal-backdrop" role="presentation" onClick={closeSocksModal}>
					<div
						className="a-modal"
						role="dialog"
						aria-modal
						aria-labelledby="a-socks-title"
						onClick={(event) => event.stopPropagation()}
					>
						<h2 id="a-socks-title" className="a-modal__title">
							手动添加 SOCKS5 节点
						</h2>
						<div className="a-modal__grid">
							<label className="a-field">
								<span className="a-field-label">名称</span>
								<input
									className="a-input"
									value={socksForm.name}
									onChange={(event) => setSocksForm((form) => ({ ...form, name: event.target.value }))}
								/>
							</label>
							<div className="a-modal__row-two">
								<label className="a-field">
									<span className="a-field-label">服务器</span>
									<input
										className="a-input"
										value={socksForm.server}
										onChange={(event) => setSocksForm((form) => ({ ...form, server: event.target.value }))}
									/>
								</label>
								<label className="a-field">
									<span className="a-field-label">端口</span>
									<input
										className="a-input"
										value={socksForm.port}
										onChange={(event) => setSocksForm((form) => ({ ...form, port: event.target.value }))}
									/>
								</label>
							</div>
							<div className="a-modal__row-two">
								<label className="a-field">
									<span className="a-field-label">用户名（可选）</span>
									<input
										className="a-input"
										value={socksForm.username}
										onChange={(event) => setSocksForm((form) => ({ ...form, username: event.target.value }))}
									/>
								</label>
								<label className="a-field">
									<span className="a-field-label">密码（可选）</span>
									<input
										className="a-input"
										type="text"
										value={socksForm.password}
										onChange={(event) => setSocksForm((form) => ({ ...form, password: event.target.value }))}
									/>
								</label>
							</div>
							<label className="a-field">
								<span className="a-field-label">SOCKS5 URI（可选）</span>
								<input
									className="a-input"
									value={socksURI}
									onChange={(event) => {
										setSocksURI(event.target.value);
										if (socksError) {
											setSocksError(null);
										}
									}}
									onBlur={parseSocks5URIOnBlur}
									placeholder="socks5://user:pass@host:1080#name"
									autoComplete="off"
								/>
							</label>
						</div>
						{socksError ? <p className="a-field-error">{socksError}</p> : null}
						<div className="a-modal__actions">
							<button type="button" className="a-btn a-btn--secondary" onClick={closeSocksModal}>
								取消
							</button>
							<button type="button" className="a-btn a-btn--primary" onClick={submitSocks5}>
								追加
							</button>
						</div>
					</div>
				</div>
			) : null}
			{portForwardOpen ? (
				<div className="a-modal-backdrop" role="presentation" onClick={() => setPortForwardOpen(false)}>
					<div
						className="a-modal"
						role="dialog"
						aria-modal
						aria-labelledby="a-port-forward-title"
						onClick={(event) => event.stopPropagation()}
					>
						<h2 id="a-port-forward-title" className="a-modal__title">
							添加端口转发标签
						</h2>
						<TagField
							label="端口转发（支持多个 tag）"
							values={portForwardDraftTags}
							onChange={setPortForwardDraftTags}
							placeholder="输入 server:port 后按 Enter 添加"
						/>
						<div className="a-modal__actions">
							<button type="button" className="a-btn a-btn--secondary" onClick={() => setPortForwardOpen(false)}>
								取消
							</button>
							<button type="button" className="a-btn a-btn--primary" onClick={submitPortForwardTags}>
								确认
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
