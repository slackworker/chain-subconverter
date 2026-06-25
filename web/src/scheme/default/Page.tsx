import { useEffect, useId, useRef, useState } from "react";

import type { AppPageProps } from "../../lib/composition";
import { DEFAULT_TEMPLATE_URL } from "../../lib/defaults";
import {
	getGlobalPrimaryBlockingErrors,
	getOriginStageLabel,
} from "../../lib/notices";
import {
	appendForwardRelayItems,
	buildManualSocks5URI,
	initialManualSocks5FormState,
	normalizeForwardRelayItem,
	parseSocks5URIToManualSocks5FormState,
	type ManualSocks5FormState,
	removeForwardRelayItem,
} from "../../lib/stage1";
import { RuntimeStatusBadges } from "../../lib/RuntimeStatusBadges";
import { Tooltip } from "../../lib/Tooltip";
import type { WorkflowLogEntry } from "../../lib/state";
import { formatWorkflowLogTime, getWorkflowLogLevelLabel } from "../../lib/workflow-log-display";
import { ArrowLeftIcon, ArrowRightIcon, CheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon } from "./Icons";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { TagField, type TagFieldHandle, type TagFieldReject } from "./TagField";
import { Stage2Section } from "./Stage2Section";
import "./index.css";

const LOCALE_STORAGE_KEY = "chain-subconverter-ui.locale";
const THEME_STORAGE_KEY = "chain-subconverter-ui.theme";

type Locale = "zh" | "en";
type ColorMode = "light" | "dark";

const COPY = {
	zh: {
		localErrorAriaHint: "该位置存在错误，请查看当前阶段反馈条。",
		headerEyebrow: "Chain Subconverter for Mihomo",
		headerTitle: "链式代理 · 订阅转换",
		quickActions: "快捷操作",
		languageToggle: "切换界面语言",
		languageZh: "中",
		languageEn: "EN",
		themeToDark: "切换到暗色主题",
		themeToLight: "切换到亮色主题",
		githubRepo: "打开 GitHub 仓库",
		blockingTitle: "需要处理的问题",
		blockingSource: "来源：{stageLabel}",
		blockingExpand: "展开问题详情",
		currentStage: "当前阶段",
		logToggle: "日志",
		messageLog: "工作流日志",
		noLogs: "暂无日志",
		noBadge: "无",
		backendNoMessages: "当前会话尚未记录日志。",
		logLevelInfo: "提示",
		logLevelWarning: "警告",
		logLevelSuccess: "成功",
		logLevelError: "失败",
		stage1Title: "输入",
		stage1Desc: "填写落地与中转，转换生成配置基底",
		landingInfo: "落地信息",
		transitInfo: "中转信息",
		addSocks5: "+ 添加 SOCKS5",
		addPortForward: "+ 添加 端口转发",
		landingPlaceholder: "节点URI或订阅URL，每行一条",
		transitPlaceholder: "节点URI或订阅URL，每行一条",
		portForwardTags: "端口转发标签",
		removeTag: "移除 {tag}",
		advancedOptions: "高级选项",
		templateUrl: "订阅转换模板",
		templateUrlHint:
			"请填入包含地域（区域）策略分组的订阅转换模板 URL。未自定义时由服务端使用部署默认模板。",
		templateUrlHintAria: "订阅转换模板说明",
		templatePlaceholder: "请输入带地域分组的模板 URL",
		templateResetDefault: "恢复默认",
		includeTags: "include 标签",
		excludeTags: "exclude 标签",
		tagPlaceholder: "输入后按 Enter 添加",
		skipCertVerify: "跳过证书校验（scv）",
		converting: "转换中…",
		convertAndFill: "转换并自动填充",
		stageChangedNotice: "已变更：请重新执行转换后再生成链接。",
		stage2Title: "配置",
		stage2Desc: "按落地节点逐行选择模式与目标",
		conflictReadonly: "当前恢复快照引用的目标已失效，恢复结果仅供查看。请回到阶段 1 重新执行「转换并自动填充」后再继续。",
		colLanding: "落地节点",
		colType: "协议",
		colTypeAgg: "类型/协议",
		colServer: "服务器",
		colNodeTree: "服务器-组/节点",
		colAggregation: "聚合/入组",
		colMode: "配置方式",
		colTarget: "目标",
		stage2AggregationMode: "线路聚合模式",
		stage2AggregationModeHint:
			"实验性功能。为同一服务器落地节点配置多条中转线路（建议目标为固定节点或端口转发，而非策略组），各自完成后聚合成策略组，在中转节点不稳定时提高整体可用性。可与「策略组节点切换优化」同时开启。",
		stage2AggregationModeHintAria: "线路聚合模式说明",
		aggregationEnable: "聚合",
		aggregationInclude: "入组",
		typePolicyGroup: "策略组",
		aggregationStrategyLabel: "聚合方式",
		aggregationOff: "关闭",
		memberOrderManage: "顺序管理",
		memberOrderFallbackHint: "fallback 按以下顺序尝试",
		memberOrderUrlTestHint: "url-test 不使用手动顺序",
		memberOrderEmpty: "暂无入组成员",
		memberOrderPrimaryBadge: "首选",
		memberOrderSourceBadge: "源节点",
		memberOrderDerivedBadge: "副本",
		memberOrderDragHandle: "拖拽排序",
		memberOrderDragHandleAria: "拖拽 {name} 调整顺序",
		stage2Empty: "完成阶段 1 转换后，将在此列出各行配置。",
		rowRestrictions: "本行存在模式限制，详见下拉禁用项提示。",
		proxyNameLabel: "节点名",
		proxyNameEditableHint: "可编辑",
		rowSourceLabel: "来源：{name}",
		cloneRow: "复制",
		deleteRow: "删除",
		keepOneDerivedRow: "至少保留一行",
		sourceRowLocked: "源节点不可删除",
		commonGroups: "区域策略组",
		fixedNodes: "固定节点",
		noCommonChoices: "暂无常用候选",
		selectTarget: "请选择",
		switchOptimizationLabel: "目标策略组节点切换优化（实验性）",
		switchOptimizationHint:
			"开启后，为链式代理所选的地域策略组启用更短的健康检查间隔与更快的节点切换；节点异常时尽快切换到可用节点。关闭时沿用订阅模板中的默认设置。",
		switchOptimizationHintAria: "目标策略组节点切换优化说明",
		generating: "生成中…",
		generateLink: "生成链接",
		stage3Title: "输出",
		stage3Desc: "链接输出与反向解析",
		currentLink: "当前链接",
		currentLinkPlaceholder: "生成或粘贴 longUrl / shortUrl / short ID",
		shortLink: "短链接",
		openPreview: "打开预览",
		copy: "复制链接",
		downloadYaml: "下载配置",
		restoring: "反向解析中…",
		restore: "反向解析",
		copyDone: "已复制到剪贴板",
		copyFailed: "复制失败，请检查权限或手动复制",
		addOrConvertSocks5: "添加 / 转换 SOCKS5 节点",
		name: "名称",
		server: "服务器",
		port: "端口",
		usernameOptional: "用户名（可选）",
		passwordOptional: "密码（可选）",
		socks5Uri: "SOCKS5 URI（转换为可解析格式）",
		cancel: "取消",
		add: "添加",
		addPortForwardModal: "添加端口转发服务",
		forwardInfo: "转发信息",
		forwardPlaceholder: "输入 server:port ，按 Enter 添加多个",
		confirm: "确认",
		socksFormValidationFailed: "表单校验失败",
		socksParseFailed: "SOCKS5 URI 解析失败",
		portForwardValidationFailed: "端口转发服务校验失败",
		portForwardDuplicate: "端口转发服务 {tag} 已存在",
		portForwardNothingToAdd: "请至少添加一条端口转发服务",
		stage1Label: "阶段 1",
		stage2Label: "阶段 2",
		stage3Label: "阶段 3",
		mode_none: "无/直连",
		mode_chain: "链式代理",
		mode_port_forward: "端口转发",
		statusAwaitingInput: "等待输入",
		statusChanged: "已变更",
		statusConverted: "已转换",
		statusEditing: "编辑中",
		statusConflict: "冲突",
		statusExpired: "已过期",
		statusStage2Stale: "已过期",
		statusAwaitingInit: "等待转换",
		statusReady: "就绪",
		statusAwaitingGenerate: "等待生成",
		statusShortUrlReady: "短链接已就绪",
		statusLongUrlReady: "长链接已就绪",
		footerCredit: "Chain Subconverter © {year}",
	},
	en: {
		localErrorAriaHint: "There is an error here. Check the current stage feedback strip.",
		headerEyebrow: "Chain Subconverter for Mihomo",
		headerTitle: "Chain Proxy · Subconverter",
		quickActions: "Quick actions",
		languageToggle: "Switch interface language",
		languageZh: "中",
		languageEn: "EN",
		themeToDark: "Switch to dark theme",
		themeToLight: "Switch to light theme",
		githubRepo: "Open GitHub repository",
		blockingTitle: "Issues to resolve",
		blockingSource: "Source: {stageLabel}",
		blockingExpand: "Show issue details",
		currentStage: "Current stage",
		logToggle: "Logs",
		messageLog: "Workflow log",
		noLogs: "No logs yet",
		noBadge: "none",
		backendNoMessages: "No workflow log entries have been recorded for this session.",
		logLevelInfo: "Info",
		logLevelWarning: "Warning",
		logLevelSuccess: "Success",
		logLevelError: "Error",
		stage1Title: "Input",
		stage1Desc: "Fill landing & transit, convert for config baseline",
		landingInfo: "Landing input",
		transitInfo: "Transit input",
		addSocks5: "+SOCKS5",
		addPortForward: "+Port forward",
		landingPlaceholder: "Node URI or subscription URL, one per line",
		transitPlaceholder: "Node URI or subscription URL, one per line",
		portForwardTags: "Port forward tags",
		removeTag: "Remove {tag}",
		advancedOptions: "Advanced options",
		templateUrl: "Subscription template",
		templateUrlHint:
			"Use a subconverter template URL that defines regional policy groups. If unchanged, the deployment default applies.",
		templateUrlHintAria: "Subscription template help",
		templatePlaceholder: "Use a region-aware template URL",
		templateResetDefault: "Reset default",
		includeTags: "Include tags",
		excludeTags: "Exclude tags",
		tagPlaceholder: "Type and press Enter to add",
		skipCertVerify: "Skip certificate verification (scv)",
		converting: "Converting...",
		convertAndFill: "Convert and autofill",
		stageChangedNotice: "Inputs changed. Convert again before generating a link.",
		stage2Title: "Landing config",
		stage2Desc: "Choose the mode and target for each landing node.",
		conflictReadonly: "The restored snapshot references targets that no longer exist. The restored result is read-only. Go back to Stage 1 and run Convert and autofill again before continuing.",
		colLanding: "Landing node",
		colType: "Protocol",
		colTypeAgg: "Type / protocol",
		colServer: "Server",
		colNodeTree: "Server group / node",
		colAggregation: "Aggregate / include",
		colMode: "Mode",
		colTarget: "Target",
		stage2AggregationMode: "Path aggregation",
		stage2AggregationModeHint:
			"Experimental. Configure multiple transit targets per server (prefer fixed nodes or port forwarding over policy groups). Each path completes its chain proxy independently, then results are aggregated into a policy group for better resilience when transit nodes are unstable. Can be used together with switching optimization.",
		stage2AggregationModeHintAria: "Path aggregation help",
		aggregationEnable: "Aggregate",
		aggregationInclude: "Include",
		typePolicyGroup: "Policy group",
		aggregationStrategyLabel: "Aggregation strategy",
		aggregationOff: "Off",
		memberOrderManage: "Manage order",
		memberOrderFallbackHint: "fallback tries members in this order",
		memberOrderUrlTestHint: "url-test does not use manual ordering",
		memberOrderEmpty: "No included members yet",
		memberOrderPrimaryBadge: "Primary",
		memberOrderSourceBadge: "Source",
		memberOrderDerivedBadge: "Derived",
		memberOrderDragHandle: "Drag to reorder",
		memberOrderDragHandleAria: "Drag {name} to reorder",
		stage2Empty: "Run Stage 1 conversion to populate each configuration row here.",
		rowRestrictions: "This row has mode restrictions. Check the disabled options for details.",
		proxyNameLabel: "Proxy name",
		proxyNameEditableHint: "Editable",
		rowSourceLabel: "Source: {name}",
		cloneRow: "Clone",
		deleteRow: "Delete",
		keepOneDerivedRow: "Keep at least one row.",
		sourceRowLocked: "Source rows cannot be deleted.",
		commonGroups: "Regional policy groups",
		fixedNodes: "Fixed nodes",
		noCommonChoices: "No common choices available",
		selectTarget: "Select a target",
		switchOptimizationLabel: "Target policy-group node switching optimization",
		switchOptimizationHint:
			"When enabled, applies shorter health-check intervals and faster node switching to regional policy groups selected for chain proxies. When disabled, the subscription template defaults apply.",
		switchOptimizationHintAria: "Target policy-group node switching optimization help",
		generating: "Generating...",
		generateLink: "Generate link",
		stage3Title: "Output",
		stage3Desc: "Output links or restore from URL",
		currentLink: "Current link",
		currentLinkPlaceholder: "Generate or paste a longUrl / shortUrl / short ID",
		shortLink: "Short link",
		openPreview: "Open preview",
		copy: "Copy link",
		downloadYaml: "Download config",
		restoring: "Restoring...",
		restore: "Restore",
		copyDone: "Copied to clipboard",
		copyFailed: "Copy failed. Check permissions or copy the link manually.",
		addOrConvertSocks5: "Add / convert SOCKS5 node",
		name: "Name",
		server: "Server",
		port: "Port",
		usernameOptional: "Username (optional)",
		passwordOptional: "Password (optional)",
		socks5Uri: "SOCKS5 URI (convert to a parsable format)",
		cancel: "Cancel",
		add: "Add",
		addPortForwardModal: "Add port forwarding service",
		forwardInfo: "Forwarding targets",
		forwardPlaceholder: "Type server:port and press Enter to add multiple entries",
		confirm: "Confirm",
		socksFormValidationFailed: "Form validation failed",
		socksParseFailed: "Failed to parse the SOCKS5 URI",
		portForwardValidationFailed: "Port forwarding validation failed",
		portForwardDuplicate: "Port forwarding service {tag} already exists",
		portForwardNothingToAdd: "Add at least one port forwarding entry",
		stage1Label: "Stage 1",
		stage2Label: "Stage 2",
		stage3Label: "Stage 3",
		mode_none: "Do not configure",
		mode_chain: "Chain proxy",
		mode_port_forward: "Port forwarding",
		statusAwaitingInput: "Awaiting input",
		statusChanged: "Changed",
		statusConverted: "Converted",
		statusEditing: "Editing",
		statusConflict: "Conflict",
		statusExpired: "Expired",
		statusStage2Stale: "Stale",
		statusAwaitingInit: "Awaiting convert",
		statusReady: "Ready",
		statusAwaitingGenerate: "Awaiting generate",
		statusShortUrlReady: "Short URL ready",
		statusLongUrlReady: "Long URL ready",
		footerCredit: "Chain Subconverter © {year}",
	},
} as const satisfies Record<Locale, Record<string, string>>;

function getInitialLocale(): Locale {
	if (typeof window === "undefined") {
		return "zh";
	}
	const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
	if (saved === "zh" || saved === "en") {
		return saved;
	}
	return window.navigator.language.toLowerCase().startsWith("zh") ? "zh" : "en";
}

function getInitialColorMode(): ColorMode {
	if (typeof window === "undefined") {
		return "light";
	}
	const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
	if (saved === "light" || saved === "dark") {
		return saved;
	}
	return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
}

function translate(template: string, values: Record<string, string> = {}) {
	return Object.entries(values).reduce(
		(result, [key, value]) => result.split(`{${key}}`).join(value),
		template,
	);
}

function getModeLabel(mode: string, locale: Locale) {
	const labels: Record<string, string> = {
		none: COPY[locale].mode_none,
		chain: COPY[locale].mode_chain,
		port_forward: COPY[locale].mode_port_forward,
	};
	return labels[mode] ?? mode;
}

function getStageLabel(stage: "stage1" | "stage2" | "stage3" | null, locale: Locale) {
	if (stage === null) {
		return undefined;
	}
	return COPY[locale][`${stage}Label` as const];
}

function getStatusLabel(label: string, locale: Locale) {
	const statusMap: Record<string, keyof typeof COPY.zh> = {
		"Awaiting Input": "statusAwaitingInput",
		Changed: "statusChanged",
		Converted: "statusConverted",
		Editing: "statusEditing",
		Conflict: "statusConflict",
		Expired: "statusExpired",
		"Stage 2 Stale": "statusStage2Stale",
		"Awaiting Init": "statusAwaitingInit",
		Ready: "statusReady",
		"Awaiting Generate": "statusAwaitingGenerate",
		"Short URL Ready": "statusShortUrlReady",
		"Long URL Ready": "statusLongUrlReady",
	};
	const copyKey = statusMap[label];
	return copyKey ? COPY[locale][copyKey] : label;
}

function appendMultilineLine(currentValue: string, nextLine: string) {
	if (currentValue === "") {
		return nextLine;
	}
	return currentValue.endsWith("\n") ? `${currentValue}${nextLine}` : `${currentValue}\n${nextLine}`;
}

function StatusPill({ label, tone }: { label: string; tone: "neutral" | "warning" | "success" }) {
	return <span className={`a-pill a-pill--${tone}`}>{label}</span>;
}

/** 视觉为「步骤号 · 标题」；完整阶段名保留在 aria-label / title 供读屏与错误上下文沿用 copy.stageNLabel */
function StageHeadline({
	id,
	step,
	stageLabel,
	title,
}: {
	id: string;
	step: 1 | 2 | 3;
	stageLabel: string;
	title: string;
}) {
	return (
		<h2 id={id} className="a-stage__headline" aria-label={`${stageLabel} — ${title}`}>
			<span className="a-stage-headline__visual" aria-hidden="true">
				<span className="a-stage-step" title={stageLabel}>
					{step}
				</span>
				<span className="a-stage__title">{title}</span>
			</span>
		</h2>
	);
}

function BlockingPanel({
	globalErrors,
	stageLabel,
	locale,
}: {
	globalErrors: { code: string; message: string }[];
	stageLabel?: string;
	locale: Locale;
}) {
	const copy = COPY[locale];
	const panelId = useId();
	const panelRef = useRef<HTMLDivElement>(null);
	const [expanded, setExpanded] = useState(true);
	const errorSignature = globalErrors.map((error) => `${error.code}:${error.message}`).join("|");
	const sourceLabel = stageLabel ? translate(copy.blockingSource, { stageLabel }) : null;
	const primaryMessage = globalErrors[0]?.message ?? "";

	useEffect(() => {
		setExpanded(true);
	}, [errorSignature]);

	useEffect(() => {
		if (!expanded) {
			return undefined;
		}
		const handlePointerDown = (event: PointerEvent) => {
			if (!panelRef.current?.contains(event.target as Node)) {
				setExpanded(false);
			}
		};
		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.key === "Escape") {
				setExpanded(false);
			}
		};
		document.addEventListener("pointerdown", handlePointerDown);
		document.addEventListener("keydown", handleKeyDown);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown);
			document.removeEventListener("keydown", handleKeyDown);
		};
	}, [expanded]);

	if (globalErrors.length === 0) {
		return null;
	}

	return (
		<div
			ref={panelRef}
			id={panelId}
			className={`a-blocking-flyout${expanded ? "" : " a-blocking-flyout--collapsed"}`}
		>
			{expanded ? (
				<section
					className="a-panel a-panel--danger a-panel--blocking"
					aria-live="polite"
				>
					<div className="a-panel__head">
						<h2 className="a-panel__title">{copy.blockingTitle}</h2>
						{sourceLabel ? <p className="a-panel__meta a-panel__meta--inline">{sourceLabel}</p> : null}
					</div>
					<ul className="a-error-list">
						{globalErrors.map((error) => (
							<li key={`${error.code}:${error.message}`}>{error.message}</li>
						))}
					</ul>
				</section>
			) : (
				<button
					type="button"
					className="a-blocking-flyout__chip"
					aria-expanded="false"
					aria-controls={panelId}
					aria-label={`${copy.blockingExpand}：${primaryMessage}`}
					onClick={() => setExpanded(true)}
				>
					<span className="a-blocking-flyout__chip-title">{copy.blockingTitle}</span>
					<span className="a-blocking-flyout__chip-message">{primaryMessage}</span>
					{sourceLabel ? <span className="a-blocking-flyout__chip-source">{sourceLabel}</span> : null}
				</button>
			)}
		</div>
	);
}

/** 与 spec「originStage 内主反馈」一致：主阻断摘要锚在阶段动作区，不用顶部全局 flyout；字段/行内 scope 提示仍单独展示（见 04-business-rules 局部提示规则）。 */
function OriginAnchoredBlockingStrip({
	errors,
	stageLabel,
	locale,
}: {
	errors: { code: string; message: string }[];
	stageLabel?: string;
	locale: Locale;
}) {
	const copy = COPY[locale];
	if (errors.length === 0) {
		return null;
	}
	return (
		<div className="a-stage-feedback-strip a-stage-feedback-strip--danger" role="status" aria-live="polite">
			<span className="a-stage-feedback-strip__stage">{stageLabel ?? copy.currentStage}</span>
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

function WorkflowLogPanel({ entries, locale, footerCredit }: { entries: WorkflowLogEntry[]; locale: Locale; footerCredit: string }) {
	const copy = COPY[locale];
	const [open, setOpen] = useState(false);
	const latest = entries.length > 0 ? entries[entries.length - 1] : null;
	const panelId = "a-workflow-log-panel";
	const collapsedAriaLabel = latest
		? `${copy.logToggle} ${entries.length} ${getWorkflowLogLevelLabel(latest.level, locale)} ${latest.message}`
		: `${copy.logToggle} ${entries.length} ${copy.noLogs}`;
	const containerRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		if (!open) return;
		const handleClickOutside = (event: MouseEvent) => {
			if (!containerRef.current) return;
			if (!containerRef.current.contains(event.target as Node)) {
				setOpen(false);
			}
		};
		document.addEventListener("mousedown", handleClickOutside);
		return () => document.removeEventListener("mousedown", handleClickOutside);
	}, [open]);

	if (entries.length === 0) {
		return (
			<div className="a-footer__inner">
				<RuntimeStatusBadges locale={locale} footerCredit={footerCredit} />
			</div>
		);
	}

	return (
		<div className="a-log-footer-wrap" aria-label={copy.messageLog} ref={containerRef}>
			<section
				id={panelId}
				className={`a-messages a-log-footer__panel ${open ? "a-log-footer__panel--open" : ""}`}
				aria-hidden={!open}
			>
				<ul className="a-messages__list a-messages__list--timeline">
					{entries.slice().reverse().map((entry) => (
						<li key={entry.id} className={`a-messages__item a-messages__item--${entry.level}`}>
							<time className="a-messages__time" dateTime={entry.createdAt}>
								{formatWorkflowLogTime(entry.createdAt, locale)}
							</time>
							<span className="a-messages__stage" {...(entry.originStage ? {} : { "aria-hidden": true })}>
								{entry.originStage ? getStageLabel(entry.originStage, locale) : "\u00a0"}
							</span>
							<span className={`a-messages__badge a-messages__badge--${entry.level}`}>{getWorkflowLogLevelLabel(entry.level, locale)}</span>
							<p className="a-messages__body">{entry.message}</p>
						</li>
					))}
				</ul>
			</section>
			<div className="a-footer__inner">
				<RuntimeStatusBadges
					locale={locale}
					footerCredit={footerCredit}
					endSlot={
						<button
							type="button"
							className="a-log-footer__toggle"
							aria-expanded={open}
							aria-controls={panelId}
							aria-label={collapsedAriaLabel}
							onClick={() => setOpen((current) => !current)}
						>
							{copy.logToggle}
						</button>
					}
				/>
			</div>
		</div>
	);
}

export function SchemePage({ workflow, outputActions, primaryBlockingFeedbackPlacement, runtimeConfig }: AppPageProps) {
	const {
		state,
		responseOriginStage,
		workflowLog,
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
		getPrimaryBlockingErrorsForStage,
		handleStage1Convert,
		handleRestore,
		handleGenerate,
		handlePreferShortUrl,
	} = workflow;
	const [locale, setLocale] = useState<Locale>(getInitialLocale);
	const [colorMode, setColorMode] = useState<ColorMode>(getInitialColorMode);
	const copy = COPY[locale];

	const stage1Id = useId();
	const [socksOpen, setSocksOpen] = useState(false);
	const [socksForm, setSocksForm] = useState<ManualSocks5FormState>(initialManualSocks5FormState);
	const [socksURI, setSocksURI] = useState("");
	const [socksError, setSocksError] = useState<string | null>(null);
	const [portForwardOpen, setPortForwardOpen] = useState(false);
	const [portForwardDraftTags, setPortForwardDraftTags] = useState<string[] | null>(null);
	const [portForwardError, setPortForwardError] = useState<string | null>(null);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [stage2AdvancedOpen, setStage2AdvancedOpen] = useState(false);
	const [stage2AggregationMode, setStage2AggregationMode] = useState(false);
	const [headerScrolled, setHeaderScrolled] = useState(false);
	const portForwardTagFieldRef = useRef<TagFieldHandle>(null);
	const stage2TableWrapRef = useRef<HTMLDivElement | null>(null);

	const preferShort = state.preferShortUrl;
	const hasShort = Boolean(state.generatedUrls?.shortUrl);
	const stage1Empty =
		state.stage1Input.landingRawText.trim() === "" && state.stage1Input.transitRawText.trim() === "";

	const stage1PrimaryBlockingErrors = getPrimaryBlockingErrorsForStage("stage1");
	const stage2PrimaryBlockingErrors = state.stage2Stale || isConflictReadonly ? [] : getPrimaryBlockingErrorsForStage("stage2");
	const stage3PrimaryBlockingErrors = getPrimaryBlockingErrorsForStage("stage3");
	const localizedOriginStageLabel = getStageLabel(responseOriginStage, locale);
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
	const localizedStage1Status = getStatusLabel(stage1Status.label, locale);
	const localizedStage2Status = getStatusLabel(stage2Status.label, locale);
	const localizedStage3Status = getStatusLabel(stage3Status.label, locale);
	const templateDefaultURL = runtimeConfig?.defaultTemplateURL?.trim() || DEFAULT_TEMPLATE_URL;
	const currentTemplateURL = state.stage1Input.advancedOptions.config ?? "";

	useEffect(() => {
		window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
		document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
	}, [locale]);

	useEffect(() => {
		window.localStorage.setItem(THEME_STORAGE_KEY, colorMode);
		document.documentElement.style.colorScheme = colorMode === "dark" ? "dark" : "light";
	}, [colorMode]);

	const HEADER_SCROLL_ELEVATE_PX = 12;

	useEffect(() => {
		function readScroll() {
			const y = window.scrollY || document.documentElement.scrollTop || 0;
			const next = y > HEADER_SCROLL_ELEVATE_PX;
			setHeaderScrolled((prev) => (prev === next ? prev : next));
		}
		readScroll();
		window.addEventListener("scroll", readScroll, { passive: true });
		return () => {
			window.removeEventListener("scroll", readScroll);
		};
	}, []);

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
			setSocksError(error instanceof Error ? error.message : copy.socksFormValidationFailed);
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
			setSocksError(error instanceof Error ? error.message : copy.socksParseFailed);
		}
	}

	function openPortForwardModal() {
		setPortForwardError(null);
		setPortForwardDraftTags((current) => current ?? []);
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

	function closePortForwardModal() {
		setPortForwardError(null);
		setPortForwardOpen(false);
	}

	function resetPortForwardDraft() {
		setPortForwardDraftTags(null);
	}

	function portForwardRejectMessage(reject: TagFieldReject) {
		if (reject.reason === "duplicate") {
			return translate(copy.portForwardDuplicate, { tag: reject.tag ?? "" });
		}
		return reject.message ?? copy.portForwardValidationFailed;
	}

	function submitPortForwardTags() {
		const flush = portForwardTagFieldRef.current?.flushDraft();
		let nextTags = portForwardDraftTags ?? [];
		if (flush?.kind === "committed") {
			nextTags = flush.next ?? [];
		} else if (flush?.kind === "rejected" && nextTags.length === 0) {
			setPortForwardError(portForwardRejectMessage(flush));
			return;
		}
		if (nextTags.length === 0) {
			setPortForwardError(copy.portForwardNothingToAdd);
			return;
		}
		try {
			const nextStage1Input = appendForwardRelayItems(state.stage1Input, nextTags);
			updateStage1Input(() => nextStage1Input);
			setPortForwardError(null);
			resetPortForwardDraft();
			closePortForwardModal();
		} catch (error) {
			setPortForwardError(error instanceof Error ? error.message : copy.portForwardValidationFailed);
		}
	}

	const themeToggleLabel = colorMode === "dark" ? copy.themeToLight : copy.themeToDark;

	return (
		<div className={`a-shell${colorMode === "dark" ? " a-shell--dark" : ""}`}>
			<header className={`a-header${headerScrolled ? " a-header--scrolled" : ""}`}>
				<div className="a-header__brand">
					<img
						className="a-header__brand-icon"
						src={`${import.meta.env.BASE_URL}logo.svg`}
						alt=""
						width={36}
						height={36}
						decoding="async"
						fetchPriority="low"
						aria-hidden="true"
					/>
					<div className="a-header__brand-text">
						<h1 className="a-title">{copy.headerTitle}</h1>
						<p className="a-eyebrow">{copy.headerEyebrow}</p>
					</div>
				</div>
				<nav className="a-scheme-nav" aria-label={copy.quickActions}>
					<button
						type="button"
						className="a-locale-switch"
						onClick={() => setLocale((current) => (current === "zh" ? "en" : "zh"))}
						aria-label={copy.languageToggle}
						title={copy.languageToggle}
					>
						{locale === "zh" ? copy.languageZh : copy.languageEn}
					</button>
					<button
						type="button"
						className="a-scheme-nav__link a-scheme-nav__link--icon a-scheme-nav__theme-toggle"
						aria-label={themeToggleLabel}
						title={themeToggleLabel}
						aria-pressed={colorMode === "dark"}
						onClick={() => setColorMode((current) => (current === "dark" ? "light" : "dark"))}
					>
						{colorMode === "dark" ? (
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
								<circle cx="12" cy="12" r="4" stroke="currentColor" strokeWidth="1.8" />
								<path
									d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"
									stroke="currentColor"
									strokeWidth="1.8"
									strokeLinecap="round"
								/>
							</svg>
						) : (
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="18" height="18" fill="none" aria-hidden="true">
								<path
									d="M21 14.5A8.5 8.5 0 0 1 9.5 3a8.5 8.5 0 1 0 11.5 11.5Z"
									stroke="currentColor"
									strokeWidth="1.8"
									strokeLinecap="round"
									strokeLinejoin="round"
								/>
							</svg>
						)}
					</button>
					<a
						className="a-scheme-nav__link a-scheme-nav__link--icon"
						aria-label={copy.githubRepo}
						title={copy.githubRepo}
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
				<BlockingPanel globalErrors={globalPrimaryBlockingErrors} stageLabel={localizedOriginStageLabel} locale={locale} />
			) : null}

			<main className="a-main">
				<section className="a-stage" aria-labelledby={`${stage1Id}-h`}>
					<div className="a-stage__head">
						<div>
							<StageHeadline id={`${stage1Id}-h`} step={1} stageLabel={copy.stage1Label} title={copy.stage1Title} />
							<p className="a-stage__desc">{copy.stage1Desc}</p>
						</div>
						<StatusPill label={localizedStage1Status} tone={stage1Status.tone} />
					</div>

					<div className="a-stage1-grid">
						<LineNumberTextarea
							id={`${stage1Id}-landing`}
							label={copy.landingInfo}
							labelAction={
								<button type="button" className="a-link-btn" onClick={openSocksModal}>
									{copy.addSocks5}
								</button>
							}
							value={state.stage1Input.landingRawText}
							onChange={(next) =>
								updateStage1Input((current) => ({
									...current,
									landingRawText: next,
								}))
							}
							placeholder={copy.landingPlaceholder}
							hasError={landingFieldErrors.length > 0}
							errorId={landingErrorId}
							errorText={landingFieldErrors[0]?.message}
							localErrorAriaHint={copy.localErrorAriaHint}
						/>
						<LineNumberTextarea
							id={`${stage1Id}-transit`}
							label={copy.transitInfo}
							labelAction={
								<button type="button" className="a-link-btn" onClick={openPortForwardModal}>
									{copy.addPortForward}
								</button>
							}
							value={state.stage1Input.transitRawText}
							onChange={(next) =>
								updateStage1Input((current) => ({
									...current,
									transitRawText: next,
								}))
							}
							placeholder={copy.transitPlaceholder}
							bottomLeftContent={
								state.stage1Input.forwardRelayItems.length > 0 ? (
									<ul className={`a-tag-list ${forwardRelayErrors.length > 0 ? "a-tag-list--error" : ""}`} aria-label={copy.portForwardTags}>
										{state.stage1Input.forwardRelayItems.map((item, index) => (
											<li key={`${item}-${index}`} className="a-tag-chip">
												<span className="a-tag-chip__text">{item}</span>
												<button
													type="button"
													className="a-tag-chip__remove"
													onClick={() =>
														updateStage1Input((current) => removeForwardRelayItem(current, index))
													}
													aria-label={translate(copy.removeTag, { tag: item })}
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
							localErrorAriaHint={copy.localErrorAriaHint}
						/>
					</div>

					<div className="a-stage1-actions-wrap">
						<button type="button" className="a-advanced__toggle" onClick={() => setAdvancedOpen((open) => !open)} aria-expanded={advancedOpen}>
							<span className={`a-adv-arrow${advancedOpen ? " a-adv-arrow--open" : ""}`} aria-hidden="true">
								▶
							</span>
							{copy.advancedOptions}
						</button>
						{advancedOpen ? (
							<div className="a-advanced">
								<div className="a-advanced__body">
								<label className="a-field a-field--inline">
									<span className="a-field-label">
										{copy.templateUrl}{" "}
										<Tooltip content={copy.templateUrlHint}>
											<span className="a-hint" aria-label={copy.templateUrlHintAria}>
												?
											</span>
										</Tooltip>
									</span>
									<div
										className={`a-template-url-row ${configFieldErrors.length > 0 ? "a-template-url-row--error" : ""}`}
									>
										<input
											className={`a-input ${configFieldErrors.length > 0 ? "a-input--error" : ""}`}
											type="text"
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
											placeholder={copy.templatePlaceholder}
											aria-invalid={configFieldErrors.length > 0 ? true : undefined}
											aria-describedby={configFieldErrors.length > 0 ? configErrorId : undefined}
										/>
										<button
											type="button"
											className="a-template-url-row__reset"
											disabled={currentTemplateURL.trim() === templateDefaultURL}
											aria-label={copy.templateResetDefault}
											title={copy.templateResetDefault}
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
											<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" aria-hidden="true">
												<path
													d="M4 7v5h5M5.5 12a6.5 6.5 0 1 0 2-4.7L4 10.8"
													stroke="currentColor"
													strokeWidth="1.8"
													strokeLinecap="round"
													strokeLinejoin="round"
												/>
											</svg>
										</button>
									</div>
									{configFieldErrors.length > 0 ? (
										<p id={configErrorId} className="a-sr-only" role="status">
											{copy.localErrorAriaHint}
										</p>
									) : null}
								</label>

								<div className="a-advanced__row-tags">
									<TagField
										label={copy.includeTags}
										values={state.stage1Input.advancedOptions.include}
										onChange={(next) =>
											updateStage1Input((current) => ({
												...current,
												advancedOptions: { ...current.advancedOptions, include: next },
											}))
										}
										placeholder={copy.tagPlaceholder}
										addLabel={copy.add}
										removeTagAriaLabel={(tag) => translate(copy.removeTag, { tag })}
									/>
									<TagField
										label={copy.excludeTags}
										values={state.stage1Input.advancedOptions.exclude}
										onChange={(next) =>
											updateStage1Input((current) => ({
												...current,
												advancedOptions: { ...current.advancedOptions, exclude: next },
											}))
										}
										placeholder={copy.tagPlaceholder}
										addLabel={copy.add}
										removeTagAriaLabel={(tag) => translate(copy.removeTag, { tag })}
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
										{copy.skipCertVerify}
									</label>
								</div>
								</div>
							</div>
						) : null}

						<div className="a-stage-actions a-stage-actions--primary-end">
							{(stage1PrimaryBlockingErrors.length > 0 || shouldShowStage2StaleNotice) ? (
								<div className="a-stage-actions__feedback">
									{stage1PrimaryBlockingErrors.length > 0 ? (
										<OriginAnchoredBlockingStrip errors={stage1PrimaryBlockingErrors} stageLabel={localizedOriginStageLabel} locale={locale} />
									) : null}
									{shouldShowStage2StaleNotice ? (
										<div className="a-stage-feedback-strip a-stage-feedback-strip--warning" role="status">
											<span className="a-stage-feedback-strip__stage">{getStageLabel("stage1", locale) ?? copy.currentStage}</span>
											<span className="a-stage-feedback-strip__msg">{copy.stageChangedNotice}</span>
										</div>
									) : null}
								</div>
							) : null}
							<button type="button" className="a-btn a-btn--primary" disabled={isConverting || stage1Empty} onClick={() => void handleStage1Convert()}>
								{isConverting ? (
									copy.converting
								) : (
									<>
										{copy.convertAndFill}
										<ArrowRightIcon className="a-icon" aria-hidden />
									</>
								)}
							</button>
						</div>
					</div>
				</section>

				<Stage2Section
					workflow={workflow}
					locale={locale}
					copy={copy}
					localizedStage2Status={localizedStage2Status}
					stage2StatusTone={stage2Status.tone}
					isConflictReadonly={isConflictReadonly}
					stage2AggregationMode={stage2AggregationMode}
					setStage2AggregationMode={setStage2AggregationMode}
					stage2AdvancedOpen={stage2AdvancedOpen}
					setStage2AdvancedOpen={setStage2AdvancedOpen}
					stage2PrimaryBlockingErrors={stage2PrimaryBlockingErrors}
					localizedOriginStageLabel={localizedOriginStageLabel}
					isGenerating={isGenerating}
					canGenerate={canGenerate}
					handleGenerate={() => void handleGenerate()}
					isStage2Editable={isStage2Editable}
					tableWrapRef={stage2TableWrapRef}
				/>

				<section className="a-stage" aria-labelledby="a-stage3-h">
					<div className="a-stage__head">
						<div>
							<StageHeadline id="a-stage3-h" step={3} stageLabel={copy.stage3Label} title={copy.stage3Title} />
							<p className="a-stage__desc">{copy.stage3Desc}</p>
						</div>
						<StatusPill label={localizedStage3Status} tone={stage3Status.tone} />
					</div>

					<div className="a-field">
						<label className="a-field-label" htmlFor="a-current-link">
							{copy.currentLink}
						</label>
						<div
							className={`a-current-link-row ${currentLinkFieldErrors.length > 0 ? "a-current-link-row--error" : ""}`}
						>
							<input
								id="a-current-link"
								className={`a-input a-input--mono a-input--current-link ${currentLinkFieldErrors.length > 0 ? "a-input--error" : ""}`}
								type="url"
								value={state.currentLinkInput}
								onChange={(event) => setCurrentLinkInput(event.target.value)}
								placeholder={copy.currentLinkPlaceholder}
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
								{copy.shortLink}
							</label>
						</div>
						{currentLinkFieldErrors.length > 0 ? (
							<p id={currentLinkErrorId} className="a-sr-only" role="status">
								{copy.localErrorAriaHint}
							</p>
						) : null}
					</div>

					<div className="a-output-actions">
						<button type="button" className="a-btn a-btn--secondary" disabled={state.currentLinkInput.trim() === ""} onClick={outputActions.openCurrentLink}>
							<ExternalLinkIcon className="a-icon" aria-hidden />
							{copy.openPreview}
						</button>
						<button type="button" className="a-btn a-btn--secondary" disabled={state.currentLinkInput.trim() === ""} onClick={() => void outputActions.copyCurrentLink()}>
							{outputActions.copyState === "done" ? (
								<CheckIcon className="a-icon a-icon--success" aria-hidden />
							) : (
								<CopyIcon className="a-icon" aria-hidden />
							)}
							{copy.copy}
						</button>
						<button type="button" className="a-btn a-btn--secondary" disabled={state.currentLinkInput.trim() === ""} onClick={outputActions.downloadCurrentLink}>
							<DownloadIcon className="a-icon" aria-hidden />
							{copy.downloadYaml}
						</button>
						<button type="button" className="a-btn a-btn--primary" disabled={isRestoring || state.currentLinkInput.trim() === ""} onClick={() => void handleRestore()}>
							{isRestoring ? (
								copy.restoring
							) : (
								<>
									<ArrowLeftIcon className="a-icon" aria-hidden />
									{copy.restore}
								</>
							)}
						</button>
					</div>

					{stage3PrimaryBlockingErrors.length > 0 ? (
						<div className="a-stage-actions">
							<div className="a-stage-actions__feedback">
								<OriginAnchoredBlockingStrip errors={stage3PrimaryBlockingErrors} stageLabel={localizedOriginStageLabel} locale={locale} />
							</div>
						</div>
					) : null}

					{outputActions.copyState === "done" ? <p className="a-toast a-toast--ok">{copy.copyDone}</p> : null}
					{outputActions.copyState === "failed" ? <p className="a-toast a-toast--err">{copy.copyFailed}</p> : null}
				</section>
			</main>

			<footer className="a-footer">
				<WorkflowLogPanel
					entries={workflowLog}
					locale={locale}
					footerCredit={translate(copy.footerCredit, { year: String(new Date().getFullYear()) })}
				/>
			</footer>

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
							{copy.addOrConvertSocks5}
						</h2>
						<div className="a-modal__grid">
							<label className="a-field">
								<span className="a-field-label">{copy.name}</span>
								<input
									className="a-input"
									value={socksForm.name}
									onChange={(event) => setSocksForm((form) => ({ ...form, name: event.target.value }))}
								/>
							</label>
							<div className="a-modal__row-two">
								<label className="a-field">
									<span className="a-field-label">{copy.server}</span>
									<input
										className="a-input"
										value={socksForm.server}
										onChange={(event) => setSocksForm((form) => ({ ...form, server: event.target.value }))}
									/>
								</label>
								<label className="a-field">
									<span className="a-field-label">{copy.port}</span>
									<input
										className="a-input"
										value={socksForm.port}
										onChange={(event) => setSocksForm((form) => ({ ...form, port: event.target.value }))}
									/>
								</label>
							</div>
							<div className="a-modal__row-two">
								<label className="a-field">
									<span className="a-field-label">{copy.usernameOptional}</span>
									<input
										className="a-input"
										value={socksForm.username}
										onChange={(event) => setSocksForm((form) => ({ ...form, username: event.target.value }))}
									/>
								</label>
								<label className="a-field">
									<span className="a-field-label">{copy.passwordOptional}</span>
									<input
										className="a-input"
										type="text"
										value={socksForm.password}
										onChange={(event) => setSocksForm((form) => ({ ...form, password: event.target.value }))}
									/>
								</label>
							</div>
							<label className="a-field a-field--socks-uri-divider">
								<span className="a-field-label">{copy.socks5Uri}</span>
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
								{copy.cancel}
							</button>
							<button type="button" className="a-btn a-btn--primary" onClick={submitSocks5}>
								{copy.add}
							</button>
						</div>
					</div>
				</div>
			) : null}
			{portForwardOpen ? (
				<div className="a-modal-backdrop" role="presentation" onClick={closePortForwardModal}>
					<div
						className="a-modal"
						role="dialog"
						aria-modal
						aria-labelledby="a-port-forward-title"
						onClick={(event) => event.stopPropagation()}
					>
						<h2 id="a-port-forward-title" className="a-modal__title">
							{copy.addPortForwardModal}
						</h2>
						<TagField
							ref={portForwardTagFieldRef}
							label={copy.forwardInfo}
							values={portForwardDraftTags}
							autoNormalizeFullWidthColon
							splitByDelimiters
							onChange={(next) => {
								setPortForwardDraftTags(next);
								if (portForwardError) {
									setPortForwardError(null);
								}
							}}
							onReject={(reject) => setPortForwardError(portForwardRejectMessage(reject))}
							placeholder={copy.forwardPlaceholder}
							addLabel={copy.add}
							removeTagAriaLabel={(tag) => translate(copy.removeTag, { tag })}
							formatTag={normalizeForwardRelayItem}
							existingTags={state.stage1Input.forwardRelayItems}
						/>
						{portForwardError ? <p className="a-field-error">{portForwardError}</p> : null}
						<div className="a-modal__actions">
							<button type="button" className="a-btn a-btn--secondary" onClick={closePortForwardModal}>
								{copy.cancel}
							</button>
							<button type="button" className="a-btn a-btn--primary" onClick={submitPortForwardTags}>
								{copy.confirm}
							</button>
						</div>
					</div>
				</div>
			) : null}
		</div>
	);
}
