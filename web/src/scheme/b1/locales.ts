export type Locale = "zh" | "en";

export interface LocaleDict {
	localErrorAriaHint: string;
	headerEyebrow: string;
	headerTitle: string;
	quickActions: string;
	languageToggle: string;
	languageZh: string;
	languageEn: string;
	themeToDark: string;
	themeToLight: string;
	githubRepo: string;
	blockingTitle: string;
	blockingSource: string;
	blockingExpand: string;
	currentStage: string;
	logToggle: string;
	messageLog: string;
	noLogs: string;
	noBadge: string;
	backendNoMessages: string;
	logLevelInfo: string;
	logLevelWarning: string;
	logLevelSuccess: string;
	logLevelError: string;
	stage1Title: string;
	stage1Desc: string;
	landingInfo: string;
	transitInfo: string;
	addSocks5: string;
	addPortForward: string;
	landingPlaceholder: string;
	transitPlaceholder: string;
	portForwardTags: string;
	removeTag: string;
	advancedOptions: string;
	templateUrl: string;
	templateUrlHint: string;
	templateUrlHintAria: string;
	templatePlaceholder: string;
	templateResetDefault: string;
	includeTags: string;
	excludeTags: string;
	tagPlaceholder: string;
	skipCertVerify: string;
	enablePortForward: string;
	converting: string;
	convertAndFill: string;
	stageChangedNotice: string;
	statusAwaitingInput: string;
	statusChanged: string;
	statusConverted: string;
	statusEditing: string;
	statusConflict: string;
	statusExpired: string;
	statusStage2Stale: string;
	statusAwaitingInit: string;
	statusReady: string;
	statusAwaitingGenerate: string;
	statusShortUrlReady: string;
	statusLongUrlReady: string;
	stage2Title: string;
	stage2Desc: string;
	conflictReadonly: string;
	colLanding: string;
	colType: string;
	colMode: string;
	colTarget: string;
	stage2Empty: string;
	rowRestrictions: string;
	proxyNameLabel: string;
	proxyNameEditableHint: string;
	rowSourceLabel: string;
	cloneRow: string;
	deleteRow: string;
	keepOneDerivedRow: string;
	sourceRowLocked: string;
	commonGroups: string;
	fixedNodes: string;
	noCommonChoices: string;
	selectTarget: string;
	selectPortForward: string;
	generating: string;
	generateLink: string;
	stage3Title: string;
	stage3Desc: string;
	currentLink: string;
	currentLinkPlaceholder: string;
	shortLink: string;
	openPreview: string;
	copy: string;
	downloadYaml: string;
	restoring: string;
	restore: string;
	copyDone: string;
	copyFailed: string;
	addOrConvertSocks5: string;
	name: string;
	server: string;
	port: string;
	usernameOptional: string;
	passwordOptional: string;
	socks5Uri: string;
	cancel: string;
	confirm: string;
	addPortForwardTitle: string;
	portForwardPlaceholder: string;
	confirmButton: string;
	addButton: string;
	emptyPortForward: string;
	socksFormValidationFailed: string;
	socksParseFailed: string;
	portForwardValidationFailed: string;
	searchPlaceholder: string;
	emptyChainTarget: string;
	relayConflictHint: string;
	noMatch: string;
	emoji: string;
	udp: string;
	modeOptions: {
		none: string;
		chain: string;
		port_forward: string;
	};
}

export const LOCALES: Record<Locale, LocaleDict> = {
	zh: {
		localErrorAriaHint: "该位置存在错误，请查看当前阶段反馈条。",
		headerEyebrow: "Chain Subconverter for Mihomo",
		headerTitle: "链式代理 · 订阅转换 (探索版 B)",
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
		stage1Title: "1. 订阅输入",
		stage1Desc: "填写落地与中转，转换生成配置基底",
		landingInfo: "落地信息",
		transitInfo: "中转信息",
		addSocks5: "+ 添加 SOCKS5",
		addPortForward: "+ 添加 端口转发",
		landingPlaceholder: "每行一个节点或订阅链接",
		transitPlaceholder: "每行一个节点或订阅链接",
		portForwardTags: "端口转发标签",
		removeTag: "移除 {tag}",
		advancedOptions: "高级选项",
		templateUrl: "订阅转换模板",
		templateUrlHint: "请填入包含地域（区域）策略分组的订阅转换模板 URL。未自定义时由服务端使用部署默认模板。",
		templateUrlHintAria: "订阅转换模板说明",
		templatePlaceholder: "请使用带地域分组的模板，留空将使用推荐的 Aethersailor 模板",
		templateResetDefault: "恢复默认",
		includeTags: "包含节点 (include)",
		excludeTags: "排除节点 (exclude)",
		tagPlaceholder: "输入节点匹配规则",
		skipCertVerify: "跳过证书验证",
		enablePortForward: "启用端口转发",
		converting: "转换中…",
		convertAndFill: "转换并自动填充",
		stageChangedNotice: "已变更：请重新执行转换后再生成链接。",
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
		stage2Title: "2. 节点配置",
		stage2Desc: "按落地节点逐行选择模式与目标",
		conflictReadonly: "当前恢复快照引用的目标已失效，恢复结果仅供查看。请回到阶段 1 重新执行「转换并自动填充」后再继续。",
		colLanding: "落地节点",
		colType: "节点类型",
		colMode: "配置方式",
		colTarget: "目标",
		stage2Empty: "请先在上方输入信息并点击「转换并自动填充」",
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
		selectTarget: "请选择中转目标",
		selectPortForward: "请选择端口转发服务",
		generating: "生成中…",
		generateLink: "生成链接",
		stage3Title: "3. 获取订阅",
		stage3Desc: "链接输出与反向解析",
		currentLink: "当前链接",
		currentLinkPlaceholder: "生成结果将显示在这里，也可输入已有链接进行反向解析",
		shortLink: "短链接",
		openPreview: "打开预览",
		copy: "复制链接",
		downloadYaml: "下载配置",
		restoring: "反向解析中…",
		restore: "反向解析",
		copyDone: "已复制",
		copyFailed: "复制失败",
		addOrConvertSocks5: "添加 SOCKS5 节点",
		name: "名称 *",
		server: "服务器 *",
		port: "端口 *",
		usernameOptional: "用户名",
		passwordOptional: "密码",
		socks5Uri: "或解析 socks5:// 链接",
		cancel: "取消",
		confirm: "确认添加",
		addPortForwardTitle: "添加端口转发服务",
		portForwardPlaceholder: "server:port",
		confirmButton: "确认",
		addButton: "添加",
		emptyPortForward: "暂无条目",
		socksFormValidationFailed: "名称、服务器和端口为必填项",
		socksParseFailed: "SOCKS5 URI 格式不正确",
		portForwardValidationFailed: "格式非法或重复",
		searchPlaceholder: "输入关键字搜索...",
		emptyChainTarget: "策略组为空，不允许作为中转策略组",
		relayConflictHint: "不可多个落地节点选择同一个端口转发服务",
		noMatch: "无匹配项",
		emoji: "保留 Emoji",
		udp: "开启 UDP",
		modeOptions: {
			none: "直接连接 (none)",
			chain: "链式代理 (chain)",
			port_forward: "端口转发 (port_forward)",
		},
	},
	en: {
		localErrorAriaHint: "Validation error at this position. Please check the stage feedback strip.",
		headerEyebrow: "Chain Subconverter for Mihomo",
		headerTitle: "Chain Subconverter (Scheme B)",
		quickActions: "Quick Actions",
		languageToggle: "Toggle language",
		languageZh: "中",
		languageEn: "EN",
		themeToDark: "Toggle Dark Mode",
		themeToLight: "Toggle Light Mode",
		githubRepo: "GitHub Repository",
		blockingTitle: "Unresolved issues",
		blockingSource: "Source: {stageLabel}",
		blockingExpand: "Expand issue details",
		currentStage: "Current Stage",
		logToggle: "Log",
		messageLog: "Workflow Log",
		noLogs: "No logs",
		noBadge: "None",
		backendNoMessages: "No messages in this session.",
		logLevelInfo: "INFO",
		logLevelWarning: "WARN",
		logLevelSuccess: "SUCCESS",
		logLevelError: "ERROR",
		stage1Title: "1. Subscription Input",
		stage1Desc: "Fill landing & transit, convert for config baseline",
		landingInfo: "Landing Info",
		transitInfo: "Transit Info",
		addSocks5: "+ Add SOCKS5",
		addPortForward: "+ Add Port Forward",
		landingPlaceholder: "One node URI or subscription URL per line",
		transitPlaceholder: "One node URI or subscription URL per line",
		portForwardTags: "Port Forward Tags",
		removeTag: "Remove {tag}",
		advancedOptions: "Advanced Options",
		templateUrl: "Subconverter Template",
		templateUrlHint: "Custom subscription conversion template containing region groups. Default is used if left blank.",
		templateUrlHintAria: "Subscription conversion template explanation",
		templatePlaceholder: "Enter template URL with region groups",
		templateResetDefault: "Reset Default",
		includeTags: "Include (include)",
		excludeTags: "Exclude (exclude)",
		tagPlaceholder: "Enter tag pattern",
		skipCertVerify: "Skip Cert Verify",
		enablePortForward: "Enable Port Forward",
		converting: "Converting...",
		convertAndFill: "Convert & Auto-Fill",
		stageChangedNotice: "Changed: please re-convert before generating link.",
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
		stage2Title: "2. Node Configuration",
		stage2Desc: "Adjust routing modes and targets for each landing node",
		conflictReadonly: "The restored snapshot targets are invalid. Restored state is readonly. Please re-convert from Stage 1.",
		colLanding: "Landing Node",
		colType: "Type",
		colMode: "Mode",
		colTarget: "Target",
		stage2Empty: "Please enter information above and click 'Convert & Auto-Fill' first",
		rowRestrictions: "This row has mode restrictions. See select dropdown for details.",
		proxyNameLabel: "Node Name",
		proxyNameEditableHint: "Editable",
		rowSourceLabel: "Source: {name}",
		cloneRow: "Copy",
		deleteRow: "Delete",
		keepOneDerivedRow: "Keep at least one row",
		sourceRowLocked: "Source row cannot be deleted",
		commonGroups: "Region Groups",
		fixedNodes: "Fixed Nodes",
		noCommonChoices: "No common targets",
		selectTarget: "Select Transit Target",
		selectPortForward: "Select Port Forward Service",
		generating: "Generating...",
		generateLink: "Generate Link",
		stage3Title: "3. Get Subscription",
		stage3Desc: "Output links or restore from URL",
		currentLink: "Current Link",
		currentLinkPlaceholder: "Generated results will be shown here, or enter existing URL to restore",
		shortLink: "Short Link",
		openPreview: "Open Preview",
		copy: "Copy Link",
		downloadYaml: "Download Config",
		restoring: "Restoring...",
		restore: "Restore State",
		copyDone: "Copied",
		copyFailed: "Copy Failed",
		addOrConvertSocks5: "Add SOCKS5 Node",
		name: "Name *",
		server: "Server *",
		port: "Port *",
		usernameOptional: "Username",
		passwordOptional: "Password",
		socks5Uri: "Or parse socks5:// link",
		cancel: "Cancel",
		confirm: "Confirm",
		addPortForwardTitle: "Add Port Forward Relay",
		portForwardPlaceholder: "server:port",
		confirmButton: "Confirm",
		addButton: "Add",
		emptyPortForward: "No items",
		socksFormValidationFailed: "Name, server and port are required",
		socksParseFailed: "Invalid SOCKS5 URI format",
		portForwardValidationFailed: "Invalid format or duplicate",
		searchPlaceholder: "Search...",
		emptyChainTarget: "Policy group is empty, not allowed as target",
		relayConflictHint: "Cannot select the same port forward relay for multiple nodes",
		noMatch: "No match",
		emoji: "Keep Emoji",
		udp: "Enable UDP",
		modeOptions: {
			none: "Direct Connection (none)",
			chain: "Chain Proxy (chain)",
			port_forward: "Port Forward (port_forward)",
		},
	}
};

export function translate(template: string, values: Record<string, string> = {}) {
	let result = template;
	for (const [key, val] of Object.entries(values)) {
		result = result.replace(`{${key}}`, val);
	}
	return result;
}

type WorkflowStatusLocaleKey = Extract<
	keyof LocaleDict,
	| "statusAwaitingInput"
	| "statusChanged"
	| "statusConverted"
	| "statusEditing"
	| "statusConflict"
	| "statusExpired"
	| "statusStage2Stale"
	| "statusAwaitingInit"
	| "statusReady"
	| "statusAwaitingGenerate"
	| "statusShortUrlReady"
	| "statusLongUrlReady"
>;

const WORKFLOW_STATUS_LABEL_KEYS: Record<string, WorkflowStatusLocaleKey> = {
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

export function getWorkflowStatusLabel(label: string, locale: Locale): string {
	const copyKey = WORKFLOW_STATUS_LABEL_KEYS[label];
	return copyKey ? LOCALES[locale][copyKey] : label;
}
