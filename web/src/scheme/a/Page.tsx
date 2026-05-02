import { useEffect, useId, useRef, useState } from "react";

import type { AppPageProps } from "../../lib/composition";
import { DEFAULT_TEMPLATE_URL } from "../../lib/defaults";
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
	setPortForwardEnabled,
} from "../../lib/stage1";
import { LineNumberTextarea } from "./LineNumberTextarea";
import { TagField } from "./TagField";
import "./index.css";

const LOCALE_STORAGE_KEY = "chain-subconverter-ui.locale";
const THEME_STORAGE_KEY = "chain-subconverter-ui.theme";

type Locale = "zh" | "en";
type ColorMode = "light" | "dark";

const COPY = {
	zh: {
		localErrorAriaHint: "该位置存在错误，请查看当前阶段反馈条。",
		headerEyebrow: "Chain Subconverter",
		headerTitle: "链式代理 · 订阅转换",
		headerLede: "交互式 链式代理 · 订阅转换 for Mihomo",
		quickActions: "快捷操作",
		languageToggle: "切换界面语言",
		languageZh: "中",
		languageEn: "EN",
		themeToDark: "切换到暗色主题",
		themeToLight: "切换到亮色主题",
		githubRepo: "打开 GitHub 仓库",
		blockingTitle: "需要处理的问题",
		blockingSource: "来源：{stageLabel}",
		currentStage: "当前阶段",
		logToggle: "日志",
		messageLog: "消息日志",
		noLogs: "暂无日志",
		noBadge: "无",
		backendNoMessages: "当前阶段后端未返回 messages",
		stage1Title: "阶段 1 · 输入",
		stage1Desc: "输入落地与中转信息，执行转换以生成阶段 2 配置基底",
		landingInfo: "落地信息",
		transitInfo: "中转信息",
		addSocks5: "+SOCKS5",
		addPortForward: "+端口转发",
		landingPlaceholder: "订阅 URL 或节点 URI，每行一条",
		transitPlaceholder: "机场订阅、节点 URI 或 data:text/plain,...",
		portForwardTags: "端口转发标签",
		removeTag: "移除 {tag}",
		advancedOptions: "高级选项",
		templateUrl: "订阅转换模板",
		templateUrlHint: `远程配置; 初始值来自部署默认模板：${DEFAULT_TEMPLATE_URL}`,
		templateUrlHintAria: "模板 URL 说明",
		templatePlaceholder: "请输入带地域分组的模板 URL",
		templateResetDefault: "恢复默认",
		includeTags: "include 标签",
		excludeTags: "exclude 标签",
		tagPlaceholder: "输入后按 Enter 添加",
		skipCertVerify: "跳过证书校验（scv）",
		enablePortForward: "启用端口转发",
		converting: "转换中…",
		convertAndFill: "转换并自动填充",
		stageChangedNotice: "已变更：请重新执行转换后再生成链接。",
		stage2Title: "阶段 2 · 落地配置",
		stage2Desc: "按落地节点逐行选择模式与目标",
		conflictReadonly: "当前恢复快照引用的目标已失效，恢复结果仅供查看。请回到阶段 1 重新执行「转换并自动填充」后再继续。",
		colLanding: "落地节点",
		colType: "节点类型",
		colMode: "配置方式",
		colTarget: "目标",
		stage2Empty: "完成阶段 1 转换后，将在此列出各行配置。",
		rowRestrictions: "本行存在模式限制，详见下拉禁用项提示。",
		commonGroups: "区域策略组",
		fixedNodes: "固定节点",
		noCommonChoices: "暂无常用候选",
		selectTarget: "请选择",
		generating: "生成中…",
		generateLink: "生成链接",
		stage3Title: "阶段 3 · 输出",
		stage3Desc: "打开、复制、下载生成的订阅链接；输入已有链接进行反向解析",
		currentLink: "当前链接",
		currentLinkPlaceholder: "生成或粘贴 longUrl / shortUrl",
		shortLink: "短链接",
		creatingShortLink: "（创建短链中…）",
		openPreview: "打开预览",
		copy: "复制",
		downloadYaml: "下载 YAML",
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
		addPortForwardModal: "添加端口转发服务（实验性）",
		forwardInfo: "转发信息",
		forwardPlaceholder: "输入 server:port ，按 Enter 添加多个",
		confirm: "确认",
		socksFormValidationFailed: "表单校验失败",
		socksParseFailed: "SOCKS5 URI 解析失败",
		portForwardValidationFailed: "端口转发服务校验失败",
		stage1Label: "阶段 1",
		stage2Label: "阶段 2",
		stage3Label: "阶段 3",
		mode_none: "不配置",
		mode_chain: "链式代理",
		mode_port_forward: "端口转发",
		statusAwaitingInput: "等待输入",
		statusChanged: "已变更",
		statusConverted: "已转换",
		statusEditing: "编辑中",
		statusConflict: "冲突",
		statusStage2Stale: "阶段 2 已过期",
		statusAwaitingInit: "等待初始化",
		statusReady: "就绪",
		statusAwaitingGenerate: "等待生成",
		statusShortUrlReady: "短链接已就绪",
		statusLongUrlReady: "长链接已就绪",
	},
	en: {
		localErrorAriaHint: "There is an error here. Check the current stage feedback strip.",
		headerEyebrow: "Chain Subconverter",
		headerTitle: "Chain Proxy · Subscription Converter",
		headerLede: "Interactive chain proxy subscription conversion for Mihomo",
		quickActions: "Quick actions",
		languageToggle: "Switch interface language",
		languageZh: "中",
		languageEn: "EN",
		themeToDark: "Switch to dark theme",
		themeToLight: "Switch to light theme",
		githubRepo: "Open GitHub repository",
		blockingTitle: "Issues to resolve",
		blockingSource: "Source: {stageLabel}",
		currentStage: "Current stage",
		logToggle: "Logs",
		messageLog: "Message log",
		noLogs: "No logs yet",
		noBadge: "none",
		backendNoMessages: "The backend returned no messages for the current stage.",
		stage1Title: "Stage 1 · Input",
		stage1Desc: "Provide landing and transit inputs, then convert them into the Stage 2 baseline.",
		landingInfo: "Landing input",
		transitInfo: "Transit input",
		addSocks5: "+SOCKS5",
		addPortForward: "+Port forward",
		landingPlaceholder: "Subscription URL or node URI, one per line",
		transitPlaceholder: "Airport subscription, node URI, or data:text/plain,...",
		portForwardTags: "Port forward tags",
		removeTag: "Remove {tag}",
		advancedOptions: "Advanced options",
		templateUrl: "Subscription template",
		templateUrlHint: `Remote config; initial value comes from the deployment default template: ${DEFAULT_TEMPLATE_URL}`,
		templateUrlHintAria: "Template URL help",
		templatePlaceholder: "Use a region-aware template URL",
		templateResetDefault: "Reset default",
		includeTags: "Include tags",
		excludeTags: "Exclude tags",
		tagPlaceholder: "Type and press Enter to add",
		skipCertVerify: "Skip certificate verification (scv)",
		enablePortForward: "Enable port forwarding",
		converting: "Converting...",
		convertAndFill: "Convert and autofill",
		stageChangedNotice: "Inputs changed. Convert again before generating a link.",
		stage2Title: "Stage 2 · Landing config",
		stage2Desc: "Choose the mode and target for each landing node.",
		conflictReadonly: "The restored snapshot references targets that no longer exist. The restored result is read-only. Go back to Stage 1 and run Convert and autofill again before continuing.",
		colLanding: "Landing node",
		colType: "Node type",
		colMode: "Mode",
		colTarget: "Target",
		stage2Empty: "Run Stage 1 conversion to populate each configuration row here.",
		rowRestrictions: "This row has mode restrictions. Check the disabled options for details.",
		commonGroups: "Regional policy groups",
		fixedNodes: "Fixed nodes",
		noCommonChoices: "No common choices available",
		selectTarget: "Select a target",
		generating: "Generating...",
		generateLink: "Generate link",
		stage3Title: "Stage 3 · Output",
		stage3Desc: "Open, copy, or download the generated subscription link, or paste an existing link to restore state.",
		currentLink: "Current link",
		currentLinkPlaceholder: "Generate or paste a longUrl / shortUrl",
		shortLink: "Short link",
		creatingShortLink: "(creating short link...)",
		openPreview: "Open preview",
		copy: "Copy",
		downloadYaml: "Download YAML",
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
		addPortForwardModal: "Add port forwarding service (experimental)",
		forwardInfo: "Forwarding targets",
		forwardPlaceholder: "Type server:port and press Enter to add multiple entries",
		confirm: "Confirm",
		socksFormValidationFailed: "Form validation failed",
		socksParseFailed: "Failed to parse the SOCKS5 URI",
		portForwardValidationFailed: "Port forwarding validation failed",
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
		statusStage2Stale: "Stage 2 stale",
		statusAwaitingInit: "Awaiting init",
		statusReady: "Ready",
		statusAwaitingGenerate: "Awaiting generate",
		statusShortUrlReady: "Short URL ready",
		statusLongUrlReady: "Long URL ready",
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
	if (globalErrors.length === 0) {
		return null;
	}
	return (
		<div className="a-blocking-flyout">
			<section className="a-panel a-panel--danger a-panel--blocking" aria-live="polite">
				<h2 className="a-panel__title">{copy.blockingTitle}</h2>
				{stageLabel ? <p className="a-panel__meta">{translate(copy.blockingSource, { stageLabel })}</p> : null}
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

function MessagesPanel({ messages, locale }: { messages: { level: string; message: string; code: string }[]; locale: Locale }) {
	const copy = COPY[locale];
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
				<span className="a-log-hub__label">{copy.logToggle}</span>
				<span className="a-log-hub__count">{messages.length}</span>
				{latest ? (
					<span className={`a-messages__badge a-messages__badge--${latest.level}`}>{latest.level}</span>
				) : (
					<span className="a-messages__badge a-messages__badge--empty">{copy.noBadge}</span>
				)}
			</button>

			<section
				id={panelId}
				className={`a-messages a-log-hub__panel ${open ? "a-log-hub__panel--open" : ""}`}
				aria-label={copy.messageLog}
				aria-hidden={!open}
			>
				<p className="a-log-hub__panel-title">{copy.messageLog}</p>
				{latest ? <p className="a-messages__preview">{latest.message}</p> : <p className="a-messages__preview a-messages__preview--muted">{copy.noLogs}</p>}
				{messages.length > 0 ? (
					<ul className="a-messages__list">
						{messages.map((message) => (
							<li key={`${message.code}:${message.message}:${message.level}`} className={`a-messages__item a-messages__item--${message.level}`}>
								{message.message}
							</li>
						))}
					</ul>
				) : (
					<p className="a-messages__empty">{copy.backendNoMessages}</p>
				)}
			</section>
		</div>
	);
}

export function AAppPage({ workflow, outputActions, primaryBlockingFeedbackPlacement, runtimeConfig }: AppPageProps) {
	const {
		state,
		stage2Rows,
		modeOptions,
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
	const [locale, setLocale] = useState<Locale>(getInitialLocale);
	const [colorMode, setColorMode] = useState<ColorMode>(getInitialColorMode);
	const copy = COPY[locale];

	const stage1Id = useId();
	const [socksOpen, setSocksOpen] = useState(false);
	const [socksForm, setSocksForm] = useState<ManualSocks5FormState>(initialManualSocks5FormState);
	const [socksURI, setSocksURI] = useState("");
	const [socksError, setSocksError] = useState<string | null>(null);
	const [portForwardOpen, setPortForwardOpen] = useState(false);
	const [portForwardDraftTags, setPortForwardDraftTags] = useState<string[] | null>([]);
	const [portForwardError, setPortForwardError] = useState<string | null>(null);
	const [advancedOpen, setAdvancedOpen] = useState(false);
	const [openTargetMenuRow, setOpenTargetMenuRow] = useState<string | null>(null);
	const [primaryOpenByRow, setPrimaryOpenByRow] = useState<Record<string, boolean>>({});
	const [supplementOpenByRow, setSupplementOpenByRow] = useState<Record<string, boolean>>({});

	const preferShort = state.preferShortUrl;
	const hasShort = Boolean(state.generatedUrls?.shortUrl);
	const portForwardEnabled = state.stage1Input.advancedOptions.enablePortForward;
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

	function closePortForwardModal() {
		setPortForwardError(null);
		setPortForwardDraftTags([]);
		setPortForwardOpen(false);
	}

	function submitPortForwardTags() {
		const nextTags = portForwardDraftTags ?? [];
		try {
			updateStage1Input((current) => nextTags.reduce((acc, tag) => addForwardRelayItem(acc, tag), current));
			setPortForwardError(null);
			closePortForwardModal();
		} catch (error) {
			setPortForwardError(error instanceof Error ? error.message : copy.portForwardValidationFailed);
		}
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

	const themeToggleLabel = colorMode === "dark" ? copy.themeToLight : copy.themeToDark;

	return (
		<div className={`a-shell${colorMode === "dark" ? " a-shell--dark" : ""}`}>
			<header className="a-header">
				<div className="a-header__brand">
					<p className="a-eyebrow">{copy.headerEyebrow}</p>
					<h1 className="a-title">{copy.headerTitle}</h1>
					<p className="a-lede">{copy.headerLede}</p>
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
			<MessagesPanel messages={visibleMessages} locale={locale} />

			<main className="a-main">
				<section className="a-stage" aria-labelledby={`${stage1Id}-h`}>
					<div className="a-stage__head">
						<div>
							<h2 id={`${stage1Id}-h`} className="a-stage__title">
								{copy.stage1Title}
							</h2>
							<p className="a-stage__desc">{copy.stage1Desc}</p>
						</div>
						<StatusPill label={localizedStage1Status} tone={stage1Status.tone} />
					</div>

					<div className="a-stage1-grid">
						<LineNumberTextarea
							id={`${stage1Id}-landing`}
							label={copy.landingInfo}
							labelAction={
								<button type="button" className="a-btn a-btn--secondary a-btn--compact" onClick={openSocksModal}>
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
							labelAction={portForwardEnabled ? (
								<button type="button" className="a-btn a-btn--secondary a-btn--compact" onClick={openPortForwardModal}>
									{copy.addPortForward}
								</button>
							) : null}
							value={state.stage1Input.transitRawText}
							onChange={(next) =>
								updateStage1Input((current) => ({
									...current,
									transitRawText: next,
								}))
							}
							placeholder={copy.transitPlaceholder}
							bottomLeftContent={
								portForwardEnabled && state.stage1Input.forwardRelayItems.length > 0 ? (
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
							{copy.advancedOptions}
						</button>
						{advancedOpen ? (
							<div className="a-advanced">
								<div className="a-advanced__body">
								<label className="a-field a-field--inline">
									<span className="a-field-label">
										{copy.templateUrl}{" "}
										<span className="a-hint" title={copy.templateUrlHint} aria-label={copy.templateUrlHintAria}>
											?
										</span>
									</span>
									<div className="a-template-url-row">
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
									<label className="a-check a-check--switch">
										<input
											className="a-switch__input"
											type="checkbox"
											checked={portForwardEnabled}
											onChange={(event) => {
												const enabled = event.target.checked;
												updateStage1Input((current) => setPortForwardEnabled(current, enabled));
												if (!enabled) {
													closePortForwardModal();
												}
											}}
										/>
										<span className="a-switch" aria-hidden />
										{copy.enablePortForward}
									</label>
								</div>
								</div>
							</div>
						) : null}

						<div className="a-stage-actions a-stage-actions--stage1">
							<button type="button" className="a-btn a-btn--primary" disabled={isConverting || stage1Empty} onClick={() => void handleStage1Convert()}>
								{isConverting ? copy.converting : copy.convertAndFill}
							</button>
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
						</div>
					</div>
				</section>

				<section className="a-stage" aria-labelledby="a-stage2-h">
					<div className="a-stage__head">
						<div>
							<h2 id="a-stage2-h" className="a-stage__title">
								{copy.stage2Title}
							</h2>
							<p className="a-stage__desc">{copy.stage2Desc}</p>
						</div>
						<StatusPill label={localizedStage2Status} tone={stage2Status.tone} />
					</div>

					{isConflictReadonly ? (
						<p className="a-conflict-banner">
							{copy.conflictReadonly}
						</p>
					) : null}

					<div className="a-table-wrap">
						<table className="a-table">
							<thead>
								<tr>
									<th scope="col">{copy.colLanding}</th>
									<th scope="col">{copy.colType}</th>
									<th scope="col">{copy.colMode}</th>
									<th scope="col">{copy.colTarget}</th>
								</tr>
							</thead>
							<tbody>
								{stage2Rows.length === 0 ? (
									<tr>
										<td colSpan={4} className="a-table__empty">
											{copy.stage2Empty}
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
														<p className="a-cell-meta">{copy.rowRestrictions}</p>
													) : null}
												</td>
												<td>
													<div className="a-cell-type">{meta?.landingNodeType ?? "--"}</div>
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
																	const label = getModeLabel(mode, locale);
																return (
																	<option
																		key={mode}
																		value={mode}
																		disabled={Boolean(restriction)}
																		title={modeWarn && !restriction ? modeWarn.reasonText : undefined}
																	>
																		{restriction ? `${label}（${restriction.reasonText}）` : label}
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
																				<span className="a-target-menu__group-label">{copy.commonGroups}</span>
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
																					<p className="a-picker-help">{primaryGroup?.emptyText ?? copy.noCommonChoices}</p>
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
																					<span className="a-target-menu__group-label">{copy.fixedNodes}</span>
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
														<div className="a-target-picker">
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
																<option value="">{row.mode === "none" ? "--" : copy.selectTarget}</option>
																{forwardRelayChoices.map((choice) => (
																	<option key={choice.value} value={choice.value} disabled={choice.disabled}>
																		{choice.label}
																	</option>
																))}
															</select>
														</div>
													)}
													{rowErrors.length > 0 ? (
														<p id={rowErrorId} className="a-sr-only" role="status">
															{copy.localErrorAriaHint}
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
							{isGenerating ? copy.generating : copy.generateLink}
						</button>
						{stage2PrimaryBlockingErrors.length > 0 ? (
							<div className="a-stage-actions__feedback">
								<OriginAnchoredBlockingStrip errors={stage2PrimaryBlockingErrors} stageLabel={localizedOriginStageLabel} locale={locale} />
							</div>
						) : null}
					</div>
				</section>

				<section className="a-stage" aria-labelledby="a-stage3-h">
					<div className="a-stage__head">
						<div>
							<h2 id="a-stage3-h" className="a-stage__title">
								{copy.stage3Title}
							</h2>
							<p className="a-stage__desc">{copy.stage3Desc}</p>
						</div>
						<StatusPill label={localizedStage3Status} tone={stage3Status.tone} />
					</div>

					<div className="a-field">
						<label className="a-field-label" htmlFor="a-current-link">
							{copy.currentLink}
						</label>
						<div className="a-current-link-row">
							<input
								id="a-current-link"
								className={`a-input a-input--mono ${currentLinkFieldErrors.length > 0 ? "a-input--error" : ""}`}
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
								{isCreatingShortUrl ? <span className="a-inline-muted">{copy.creatingShortLink}</span> : null}
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
							{copy.openPreview}
						</button>
						<button type="button" className="a-btn a-btn--secondary" disabled={state.currentLinkInput.trim() === ""} onClick={() => void outputActions.copyCurrentLink()}>
							{copy.copy}
						</button>
						<button type="button" className="a-btn a-btn--secondary" disabled={state.currentLinkInput.trim() === ""} onClick={outputActions.downloadCurrentLink}>
							{copy.downloadYaml}
						</button>
						<button type="button" className="a-btn a-btn--primary" disabled={isRestoring || state.currentLinkInput.trim() === ""} onClick={() => void handleRestore()}>
							{isRestoring ? copy.restoring : copy.restore}
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
			{portForwardEnabled && portForwardOpen ? (
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
							label={copy.forwardInfo}
							values={portForwardDraftTags}
							onChange={(next) => {
								setPortForwardDraftTags(next);
								if (portForwardError) {
									setPortForwardError(null);
								}
							}}
							placeholder={copy.forwardPlaceholder}
							removeTagAriaLabel={(tag) => translate(copy.removeTag, { tag })}
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
