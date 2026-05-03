import { useMemo, useState } from "react";

import type { AppPageProps } from "../../lib/composition";
import { getGlobalPrimaryBlockingErrors } from "../../lib/notices";
import {
	addForwardRelayItem,
	appendManualSocks5ToStage1Input,
	initialManualSocks5FormState,
	parseSocks5URIToManualSocks5FormState,
	removeForwardRelayItem,
	setPortForwardEnabled,
	type ManualSocks5FormState,
} from "../../lib/stage1";
import type { BlockingError, Stage2Row } from "../../types/api";
import "./index.css";

const MODE_LABELS: Record<Stage2Row["mode"], string> = {
	none: "保持原样",
	chain: "链式中转",
	port_forward: "端口转发",
};

// ── helpers ──────────────────────────────────────────────────────────────────

function toNextTagList(current: string[] | null, draft: string) {
	const trimmed = draft.trim();
	if (!trimmed) return current;
	const next = current ?? [];
	return next.includes(trimmed) ? next : [...next, trimmed];
}

function removeTagAtIndex(current: string[] | null, index: number) {
	if (!current) return null;
	const next = current.filter((_, i) => i !== index);
	return next.length === 0 ? null : next;
}

// ── atoms ─────────────────────────────────────────────────────────────────────

function StatusPill({ label, tone }: { label: string; tone: "neutral" | "warning" | "success" }) {
	return <span className={`c-pill c-pill--${tone}`}>{label}</span>;
}

function ErrorBlock({ errors }: { errors: BlockingError[] }) {
	if (errors.length === 0) return null;
	return (
		<ul className="c-error-block">
			{errors.map((e, i) => (
				<li key={`${e.code}-${i}`}>{e.message}</li>
			))}
		</ul>
	);
}

function TagChips({
	items,
	onRemove,
	empty,
}: {
	items: string[];
	onRemove: (i: number) => void;
	empty: string;
}) {
	if (items.length === 0) return <span className="c-empty-label">{empty}</span>;
	return (
		<div className="c-chips">
			{items.map((item, i) => (
				<span key={`${item}-${i}`} className="c-chip">
					{item}
					<button type="button" onClick={() => onRemove(i)} aria-label={`移除 ${item}`}>
						×
					</button>
				</span>
			))}
		</div>
	);
}

// ── layout shells ─────────────────────────────────────────────────────────────

function SectionShell({
	n,
	title,
	desc,
	status,
	action,
	children,
}: {
	n: string;
	title: string;
	desc: string;
	status: React.ReactNode;
	action?: React.ReactNode;
	children: React.ReactNode;
}) {
	return (
		<section className="c-section">
			<div className="c-section-head">
				<div className="c-section-meta">
					<span className="c-stage-badge">Stage {n}</span>
					<h2 className="c-section-title">{title}</h2>
					{status}
				</div>
				<p className="c-section-desc">{desc}</p>
			</div>
			{children}
			{action ? <div className="c-section-footer">{action}</div> : null}
		</section>
	);
}

function Modal({
	title,
	onClose,
	children,
}: {
	title: string;
	onClose: () => void;
	children: React.ReactNode;
}) {
	return (
		<div className="c-backdrop" role="presentation" onClick={onClose}>
			<div className="c-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
				<div className="c-modal-head">
					<h3>{title}</h3>
					<button type="button" className="c-icon-btn" onClick={onClose} aria-label="关闭">
						×
					</button>
				</div>
				{children}
			</div>
		</div>
	);
}

// ── main component ────────────────────────────────────────────────────────────

export function CAppPage({ workflow, outputActions, primaryBlockingFeedbackPlacement }: AppPageProps) {
	const [showAdvanced, setShowAdvanced] = useState(false);
	const [showSocksModal, setShowSocksModal] = useState(false);
	const [showRelayModal, setShowRelayModal] = useState(false);
	const [socksForm, setSocksForm] = useState<ManualSocks5FormState>(initialManualSocks5FormState);
	const [socksURI, setSocksURI] = useState("");
	const [socksErr, setSocksErr] = useState<string | null>(null);
	const [relayDraft, setRelayDraft] = useState("");
	const [relayErr, setRelayErr] = useState<string | null>(null);
	const [inclDraft, setInclDraft] = useState("");
	const [exclDraft, setExclDraft] = useState("");

	const globalErrors = useMemo(
		() => getGlobalPrimaryBlockingErrors(workflow.state.blockingErrors, workflow.responseOriginStage, primaryBlockingFeedbackPlacement),
		[primaryBlockingFeedbackPlacement, workflow.responseOriginStage, workflow.state.blockingErrors],
	);
	const latestMessage = workflow.visibleMessages.slice(-1);

	function setAdvTags(field: "include" | "exclude", next: string[] | null) {
		workflow.updateStage1Input((cur) => ({
			...cur,
			advancedOptions: { ...cur.advancedOptions, [field]: next },
		}));
	}

	function addTag(field: "include" | "exclude", draft: string, reset: () => void) {
		const next = toNextTagList(workflow.state.stage1Input.advancedOptions[field], draft);
		if (next === workflow.state.stage1Input.advancedOptions[field]) {
			reset();
			return;
		}
		setAdvTags(field, next);
		reset();
	}

	function handleSocksURIBlur() {
		if (!socksURI.trim()) {
			setSocksErr(null);
			return;
		}
		try {
			setSocksForm(parseSocks5URIToManualSocks5FormState(socksURI));
			setSocksErr(null);
		} catch (e) {
			setSocksErr(e instanceof Error ? e.message : "SOCKS5 URI 解析失败");
		}
	}

	function handleSocksSubmit() {
		try {
			workflow.updateStage1Input((cur) => appendManualSocks5ToStage1Input(cur, socksForm));
			setSocksForm(initialManualSocks5FormState);
			setSocksURI("");
			setSocksErr(null);
			setShowSocksModal(false);
		} catch (e) {
			setSocksErr(e instanceof Error ? e.message : "SOCKS5 节点添加失败");
		}
	}

	function handleRelayAdd() {
		try {
			workflow.updateStage1Input((cur) => addForwardRelayItem(cur, relayDraft.trim()));
			setRelayDraft("");
			setRelayErr(null);
			setShowRelayModal(false);
		} catch (e) {
			setRelayErr(e instanceof Error ? e.message : "端口转发服务添加失败");
		}
	}

	function getModeState(meta: ReturnType<typeof workflow.getStage2RowMeta>, mode: Stage2Row["mode"]) {
		const unsupported = !workflow.modeOptions.includes(mode);
		const restricted = meta?.restrictedModes?.[mode];
		return {
			disabled: unsupported || restricted !== undefined || !workflow.isStage2Editable,
			reasonText: restricted?.reasonText,
			warningText: meta?.modeWarnings?.[mode]?.reasonText,
		};
	}

	function renderTargetSelect(row: Stage2Row, meta: ReturnType<typeof workflow.getStage2RowMeta>) {
		if (row.mode === "none") {
			return (
				<select disabled value="">
					<option value="">—</option>
				</select>
			);
		}
		if (row.mode === "chain") {
			const groups = workflow.getChainTargetChoiceGroups();
			return (
				<select
					value={row.targetName ?? ""}
					disabled={!workflow.isStage2Editable}
					onChange={(e) => workflow.handleTargetChange(row.landingNodeName, e.target.value)}
				>
					<option value="">请选择目标</option>
					{groups.map((g) => (
						<optgroup key={g.kind} label={g.title}>
							{g.choices.length === 0 ? (
								<option disabled value="">
									{g.emptyText}
								</option>
							) : null}
							{g.choices.map((c) => (
								<option key={c.value} value={c.value} disabled={c.disabled}>
									{c.label}
								</option>
							))}
						</optgroup>
					))}
				</select>
			);
		}
		const relays = workflow.getForwardRelayChoices(row.landingNodeName);
		return (
			<select
				value={row.targetName ?? ""}
				disabled={!workflow.isStage2Editable}
				onChange={(e) => workflow.handleTargetChange(row.landingNodeName, e.target.value)}
			>
				<option value="">请选择端口转发服务</option>
				{relays.length === 0 ? (
					<option disabled value="">
						暂无可用服务
					</option>
				) : null}
				{relays.map((r) => (
					<option key={r.value} value={r.value} disabled={r.disabled}>
						{r.label}
					</option>
				))}
			</select>
		);
	}

	const { stage1Input } = workflow.state;

	return (
		<div className="c-layout">
			{/* ── App header ── */}
			<header className="c-appbar">
				<div className="c-appbar-brand">
					<img
						className="c-brand-logo"
						src={`${import.meta.env.BASE_URL}logo.svg`}
						alt=""
						width={36}
						height={36}
						decoding="async"
						fetchPriority="low"
						aria-hidden="true"
					/>
					<div>
						<p className="c-brand-name">Chain Sub Converter</p>
						<p className="c-brand-sub">订阅链转换与中转配置工具</p>
					</div>
				</div>
				<div className="c-appbar-stages">
					<StatusPill label={workflow.stage1Status.label} tone={workflow.stage1Status.tone} />
					<span className="c-stage-sep" aria-hidden="true">→</span>
					<StatusPill label={workflow.stage2Status.label} tone={workflow.stage2Status.tone} />
					<span className="c-stage-sep" aria-hidden="true">→</span>
					<StatusPill label={workflow.stage3Status.label} tone={workflow.stage3Status.tone} />
				</div>
			</header>

			{/* ── Global notices ── */}
			{globalErrors.length > 0 ? (
				<div className="c-global-notice c-global-notice--error">
					<p className="c-global-notice-title">{workflow.originStageLabel ? `${workflow.originStageLabel} 错误` : "错误"}</p>
					<ErrorBlock errors={globalErrors} />
				</div>
			) : null}
			{latestMessage.length > 0 ? (
				<div className="c-global-notice c-global-notice--info">
					<p className="c-global-notice-title">{workflow.originStageLabel ? `${workflow.originStageLabel} 消息` : "消息"}</p>
					{latestMessage.map((m, i) => (
						<p key={`${m.code}-${i}`} className="c-global-notice-body">{m.message}</p>
					))}
				</div>
			) : null}

			{/* ── Stage 1 ── */}
			<SectionShell
				n="1"
				title="输入"
				desc="录入落地节点、中转信息与高级参数，然后执行转换并自动填充阶段 2。"
				status={<StatusPill label={workflow.stage1Status.label} tone={workflow.stage1Status.tone} />}
				action={
					<button
						type="button"
						className="c-btn c-btn--primary"
						onClick={() => void workflow.handleStage1Convert()}
						disabled={workflow.isConverting}
					>
						{workflow.isConverting ? "转换中…" : "转换并自动填充 →"}
					</button>
				}
			>
				<ErrorBlock errors={workflow.getPrimaryBlockingErrorsForStage("stage1")} />

				<div className="c-input-grid">
					<div className="c-field">
						<div className="c-field-label-row">
							<label htmlFor="c-s1-landing">落地节点</label>
							<button type="button" className="c-link-btn" onClick={() => setShowSocksModal(true)}>
								＋ 手动添加 SOCKS5
							</button>
						</div>
						<textarea
							id="c-s1-landing"
							wrap="off"
							rows={9}
							value={stage1Input.landingRawText}
							onChange={(e) => workflow.updateStage1Input((cur) => ({ ...cur, landingRawText: e.target.value }))}
							placeholder={"订阅 URL\n节点 URI\ntg://socks?..."}
							className="c-mono"
						/>
						<ErrorBlock errors={workflow.getStage1FieldErrors("landingRawText")} />
					</div>

					<div className="c-field">
						<div className="c-field-label-row">
							<label htmlFor="c-s1-transit">中转信息</label>
							{stage1Input.advancedOptions.enablePortForward ? (
								<button type="button" className="c-link-btn" onClick={() => setShowRelayModal(true)}>
									＋ 端口转发服务
								</button>
							) : null}
						</div>
						<textarea
							id="c-s1-transit"
							wrap="off"
							rows={9}
							value={stage1Input.transitRawText}
							onChange={(e) => workflow.updateStage1Input((cur) => ({ ...cur, transitRawText: e.target.value }))}
							placeholder={"订阅 URL\n节点 URI\ndata:text/plain,..."}
							className="c-mono"
						/>
						<ErrorBlock errors={workflow.getStage1FieldErrors("transitRawText")} />
						{stage1Input.advancedOptions.enablePortForward ? (
							<div className="c-relay-row">
								<span className="c-field-sub">端口转发服务</span>
								<TagChips
									items={stage1Input.forwardRelayItems}
									empty="尚未添加"
									onRemove={(i) => workflow.updateStage1Input((cur) => removeForwardRelayItem(cur, i))}
								/>
								<ErrorBlock errors={workflow.getStage1FieldErrors("forwardRelayItems")} />
							</div>
						) : null}
					</div>
				</div>

				<div className="c-advanced">
					<button type="button" className="c-adv-toggle" onClick={() => setShowAdvanced((v) => !v)}>
						<span className={`c-adv-arrow${showAdvanced ? " c-adv-arrow--open" : ""}`} aria-hidden="true">▶</span>
						高级选项
					</button>
					{showAdvanced ? (
						<div className="c-adv-body">
							<div className="c-adv-grid">
								<div className="c-field">
									<label>模板 URL</label>
									<input
										type="text"
										value={stage1Input.advancedOptions.config ?? ""}
										onChange={(e) =>
											workflow.updateStage1Input((cur) => ({
												...cur,
												advancedOptions: {
													...cur.advancedOptions,
													config: e.target.value || null,
												},
											}))
										}
										placeholder="留空使用默认模板"
										className="c-mono"
									/>
									<ErrorBlock errors={workflow.getStage1FieldErrors("config")} />
								</div>

								<div className="c-field">
									<label>Include 标签</label>
									<div className="c-tag-input-row">
										<input
											type="text"
											value={inclDraft}
											onChange={(e) => setInclDraft(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													addTag("include", inclDraft, () => setInclDraft(""));
												}
											}}
											placeholder="输入后回车"
										/>
										<button
											type="button"
											className="c-btn c-btn--sm"
											onClick={() => addTag("include", inclDraft, () => setInclDraft(""))}
										>
											添加
										</button>
									</div>
									<TagChips
										items={stage1Input.advancedOptions.include ?? []}
										empty="无"
										onRemove={(i) => setAdvTags("include", removeTagAtIndex(stage1Input.advancedOptions.include, i))}
									/>
									<ErrorBlock errors={workflow.getStage1FieldErrors("include")} />
								</div>

								<div className="c-field">
									<label>Exclude 标签</label>
									<div className="c-tag-input-row">
										<input
											type="text"
											value={exclDraft}
											onChange={(e) => setExclDraft(e.target.value)}
											onKeyDown={(e) => {
												if (e.key === "Enter") {
													e.preventDefault();
													addTag("exclude", exclDraft, () => setExclDraft(""));
												}
											}}
											placeholder="输入后回车"
										/>
										<button
											type="button"
											className="c-btn c-btn--sm"
											onClick={() => addTag("exclude", exclDraft, () => setExclDraft(""))}
										>
											添加
										</button>
									</div>
									<TagChips
										items={stage1Input.advancedOptions.exclude ?? []}
										empty="无"
										onRemove={(i) => setAdvTags("exclude", removeTagAtIndex(stage1Input.advancedOptions.exclude, i))}
									/>
									<ErrorBlock errors={workflow.getStage1FieldErrors("exclude")} />
								</div>

								<div className="c-check-group">
									<label className="c-check">
										<input
											type="checkbox"
											checked={Boolean(stage1Input.advancedOptions.emoji)}
											onChange={(e) =>
												workflow.updateStage1Input((cur) => ({
													...cur,
													advancedOptions: { ...cur.advancedOptions, emoji: e.target.checked ? true : null },
												}))
											}
										/>
										emoji
									</label>
									<label className="c-check">
										<input
											type="checkbox"
											checked={Boolean(stage1Input.advancedOptions.udp)}
											onChange={(e) =>
												workflow.updateStage1Input((cur) => ({
													...cur,
													advancedOptions: { ...cur.advancedOptions, udp: e.target.checked ? true : null },
												}))
											}
										/>
										udp
									</label>
									<label className="c-check">
										<input
											type="checkbox"
											checked={Boolean(stage1Input.advancedOptions.skipCertVerify)}
											onChange={(e) =>
												workflow.updateStage1Input((cur) => ({
													...cur,
													advancedOptions: { ...cur.advancedOptions, skipCertVerify: e.target.checked ? true : null },
												}))
											}
										/>
										skip cert verify
									</label>
									<label className="c-check">
										<input
											type="checkbox"
											checked={stage1Input.advancedOptions.enablePortForward}
											onChange={(e) =>
												workflow.updateStage1Input((cur) => setPortForwardEnabled(cur, e.target.checked))
											}
										/>
										启用端口转发服务
									</label>
									<div>
										<ErrorBlock errors={workflow.getStage1FieldErrors("emoji")} />
										<ErrorBlock errors={workflow.getStage1FieldErrors("udp")} />
										<ErrorBlock errors={workflow.getStage1FieldErrors("skipCertVerify")} />
									</div>
								</div>
							</div>
						</div>
					) : null}
				</div>
			</SectionShell>

			{/* ── Stage 2 ── */}
			<SectionShell
				n="2"
				title="配置"
				desc="为每个落地节点选择中转模式与对应目标节点。"
				status={<StatusPill label={workflow.stage2Status.label} tone={workflow.stage2Status.tone} />}
				action={
					<button
						type="button"
						className="c-btn c-btn--primary"
						onClick={() => void workflow.handleGenerate()}
						disabled={!workflow.canGenerate}
					>
						{workflow.isGenerating ? "生成中…" : "生成链接 →"}
					</button>
				}
			>
				<ErrorBlock errors={workflow.getPrimaryBlockingErrorsForStage("stage2")} />

				{workflow.shouldShowStage2StaleNotice ? (
					<div className="c-notice c-notice--warning">阶段 1 已变更，当前配置已过期，请重新转换。</div>
				) : null}
				{workflow.isConflictReadonly ? (
					<div className="c-notice c-notice--warning">恢复快照引用的目标已失效，Stage 2 仅供查看，请重新转换。</div>
				) : null}

				{workflow.stage2Rows.length === 0 ? (
					<p className="c-empty-state">Stage 1 转换成功后，此处将出现各落地节点的配置行。</p>
				) : (
					<div className="c-row-list">
						{workflow.stage2Rows.map((row) => {
							const meta = workflow.getStage2RowMeta(row.landingNodeName);
							const rowErrors = workflow.getStage2RowErrors(row.landingNodeName);
							return (
								<div key={row.landingNodeName} className={`c-row-item${rowErrors.length > 0 ? " c-row-item--error" : ""}`}>
									<div className="c-row-head">
										<span className="c-node-name">{row.landingNodeName}</span>
										<span className="c-node-type">{meta?.landingNodeType ?? "—"}</span>
									</div>
									<div className="c-row-controls">
										<div className="c-mode-tabs" role="group">
											{(["none", "chain", "port_forward"] as Array<Stage2Row["mode"]>).map((mode) => {
												const s = getModeState(meta, mode);
												return (
													<button
														key={mode}
														type="button"
														className={`c-mode-tab${row.mode === mode ? " c-mode-tab--active" : ""}`}
														onClick={() => workflow.handleModeChange(row.landingNodeName, mode)}
														disabled={s.disabled}
														title={s.reasonText ?? s.warningText ?? undefined}
													>
														{MODE_LABELS[mode]}
													</button>
												);
											})}
										</div>
										<div className="c-row-target">{renderTargetSelect(row, meta)}</div>
									</div>
									{meta?.modeWarnings?.[row.mode]?.reasonText ? (
										<p className="c-row-hint">⚠ {meta.modeWarnings[row.mode]?.reasonText}</p>
									) : null}
									<ErrorBlock errors={rowErrors} />
								</div>
							);
						})}
					</div>
				)}
			</SectionShell>

			{/* ── Stage 3 ── */}
			<SectionShell
				n="3"
				title="输出"
				desc="获取生成的订阅链接，支持短链切换、复制与反向解析恢复页面状态。"
				status={<StatusPill label={workflow.stage3Status.label} tone={workflow.stage3Status.tone} />}
			>
				<ErrorBlock errors={workflow.getPrimaryBlockingErrorsForStage("stage3")} />

				<div className="c-field">
					<label htmlFor="c-s3-link">当前链接 / 恢复输入</label>
					<input
						id="c-s3-link"
						type="text"
						value={workflow.state.currentLinkInput}
						onChange={(e) => workflow.setCurrentLinkInput(e.target.value)}
						placeholder="生成后自动填入；也可粘贴已有链接进行反向解析"
						className="c-mono"
					/>
					<ErrorBlock errors={workflow.getStage3FieldErrors("currentLinkInput")} />
				</div>

				<div className="c-output-controls">
					<label className="c-check">
						<input
							type="checkbox"
							checked={workflow.state.preferShortUrl}
							onChange={(e) => void workflow.handlePreferShortUrl(e.target.checked)}
							disabled={workflow.isCreatingShortUrl}
						/>
						{workflow.isCreatingShortUrl ? "短链处理中…" : "使用短链接"}
					</label>
					<div className="c-action-row">
						<button
							type="button"
							className="c-btn c-btn--ghost"
							onClick={outputActions.openCurrentLink}
							disabled={!workflow.state.currentLinkInput.trim()}
						>
							打开预览
						</button>
						<button
							type="button"
							className="c-btn c-btn--ghost"
							onClick={() => void outputActions.copyCurrentLink()}
							disabled={!workflow.state.currentLinkInput.trim()}
						>
							{outputActions.copyState === "done" ? "✓ 已复制" : outputActions.copyState === "failed" ? "复制失败" : "复制链接"}
						</button>
						<button
							type="button"
							className="c-btn c-btn--ghost"
							onClick={outputActions.downloadCurrentLink}
							disabled={!workflow.state.currentLinkInput.trim()}
						>
							下载 YAML
						</button>
						<button
							type="button"
							className="c-btn c-btn--primary"
							onClick={() => void workflow.handleRestore()}
							disabled={!workflow.state.currentLinkInput.trim() || workflow.isRestoring}
						>
							{workflow.isRestoring ? "解析中…" : "反向解析"}
						</button>
					</div>
				</div>
			</SectionShell>

			{/* ── SOCKS5 Modal ── */}
			{showSocksModal ? (
				<Modal title="手动添加 SOCKS5 节点" onClose={() => setShowSocksModal(false)}>
					<div className="c-modal-body">
						<div className="c-field">
							<label>SOCKS5 URI（可选，粘贴后失焦自动解析）</label>
							<input
								type="text"
								value={socksURI}
								onChange={(e) => setSocksURI(e.target.value)}
								onBlur={handleSocksURIBlur}
								placeholder="socks5://user:pass@host:1080#节点名"
								className="c-mono"
							/>
						</div>
						<div className="c-modal-grid">
							<div className="c-field c-field--span2">
								<label>节点名称</label>
								<input
									type="text"
									value={socksForm.name}
									onChange={(e) => setSocksForm((f) => ({ ...f, name: e.target.value }))}
								/>
							</div>
							<div className="c-field">
								<label>服务器地址</label>
								<input
									type="text"
									value={socksForm.server}
									onChange={(e) => setSocksForm((f) => ({ ...f, server: e.target.value }))}
									className="c-mono"
								/>
							</div>
							<div className="c-field">
								<label>端口</label>
								<input
									type="text"
									value={socksForm.port}
									onChange={(e) => setSocksForm((f) => ({ ...f, port: e.target.value }))}
									className="c-mono"
								/>
							</div>
							<div className="c-field">
								<label>用户名</label>
								<input
									type="text"
									value={socksForm.username}
									onChange={(e) => setSocksForm((f) => ({ ...f, username: e.target.value }))}
								/>
							</div>
							<div className="c-field">
								<label>密码</label>
								<input
									type="text"
									value={socksForm.password}
									onChange={(e) => setSocksForm((f) => ({ ...f, password: e.target.value }))}
								/>
							</div>
						</div>
						{socksErr ? <div className="c-notice c-notice--error">{socksErr}</div> : null}
						<div className="c-modal-footer">
							<button type="button" className="c-btn c-btn--ghost" onClick={() => setShowSocksModal(false)}>
								取消
							</button>
							<button type="button" className="c-btn c-btn--primary" onClick={handleSocksSubmit}>
								追加到落地节点
							</button>
						</div>
					</div>
				</Modal>
			) : null}

			{/* ── Relay Modal ── */}
			{showRelayModal ? (
				<Modal title="添加端口转发服务" onClose={() => setShowRelayModal(false)}>
					<div className="c-modal-body">
						<div className="c-field">
							<label>服务地址（server:port）</label>
							<input
								type="text"
								value={relayDraft}
								onChange={(e) => setRelayDraft(e.target.value)}
								onKeyDown={(e) => {
									if (e.key === "Enter") {
										e.preventDefault();
										handleRelayAdd();
									}
								}}
								placeholder="relay.example.com:8443"
								className="c-mono"
							/>
						</div>
						{relayErr ? <div className="c-notice c-notice--error">{relayErr}</div> : null}
						<div className="c-modal-footer">
							<button type="button" className="c-btn c-btn--ghost" onClick={() => setShowRelayModal(false)}>
								取消
							</button>
							<button type="button" className="c-btn c-btn--primary" onClick={handleRelayAdd}>
								确认添加
							</button>
						</div>
					</div>
				</Modal>
			) : null}
		</div>
	);
}
