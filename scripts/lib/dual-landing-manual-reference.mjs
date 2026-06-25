import fs from "node:fs";
import path from "node:path";

import { buildLandingURILines } from "./subscription-artifacts.mjs";

export const WORKER_FIXTURES_BASE =
	"https://chain-subconverter-test-fixtures.slackworker.workers.dev";
const WORKER_DOWNLOAD_PREFIX = `${WORKER_FIXTURES_BASE}/dual-landing/download`;

const PREVIEW_URL = "https://fantastic-loise-slackers-134ea8cc.koyeb.app/";

const AUTO_GENERATED_BANNER = [
	"<!--",
	"AUTO-GENERATED from:",
	"- testdata/canonical-scenarios/dual-landing-chain-port-forward.stage1.json",
	"- internal/review/testdata/dual-landing-chain-port-forward/stage1/output/stage1-convert.response.json",
	"- internal/review/testdata/dual-landing-chain-port-forward/stage2/",
	"Do not edit by hand. Refresh:",
	"cd deploy/test-fixtures-worker && npm run sync",
	"-->",
].join("\n");

const MODE_LABELS = {
	chain: "链式",
	port_forward: "端口转发",
	none: "无",
};

function normalizeNewlines(value) {
	return value.replace(/\r\n/g, "\n");
}

function readJSON(filePath) {
	return JSON.parse(normalizeNewlines(fs.readFileSync(filePath, "utf8")));
}

function codeBlockLines(lines) {
	return ["```", ...lines, "```"].join("\n");
}

function formatTarget(targetName) {
	if (targetName === null || targetName === undefined || targetName === "") {
		return "—";
	}
	return targetName;
}

/** Worker 中转订阅 URL（金样路径只用这两条，填入「中转信息」） */
export function buildTransitSubscriptionURLs() {
	return [
		`${WORKER_DOWNLOAD_PREFIX}/Airport-Subscription-1`,
		`${WORKER_DOWNLOAD_PREFIX}/Airport-Subscription-2?target=ClashMeta`,
	];
}

/** @deprecated 仅保留给旧测试引用；发布页不再展示落地订阅拉取 URL */
export function buildWorkerSubscriptionURLs() {
	return [
		`${WORKER_DOWNLOAD_PREFIX}/Landing-Subscription`,
		`${WORKER_DOWNLOAD_PREFIX}/Landing-Subscription?target=URI`,
		...buildTransitSubscriptionURLs(),
	];
}

export function extractShortID(shortUrl) {
	if (typeof shortUrl !== "string" || shortUrl.trim() === "") {
		throw new Error("short-links.response.json is missing shortUrl");
	}
	const parsed = new URL(shortUrl);
	const segments = parsed.pathname.split("/").filter((segment) => segment !== "");
	const shortID = segments.at(-1)?.trim();
	if (!shortID) {
		throw new Error(`failed to extract short ID from shortUrl: ${shortUrl}`);
	}
	return shortID;
}

/** Host-agnostic golden path for manual long URL / payload verification. */
export function extractLongURLGoldenPath(longUrl) {
	if (typeof longUrl !== "string" || longUrl.trim() === "") {
		throw new Error("short-links.response.json is missing longUrl");
	}
	const parsed = new URL(longUrl);
	const data = parsed.searchParams.get("data")?.trim();
	if (!data) {
		throw new Error(`longUrl is missing data query parameter: ${longUrl}`);
	}
	return `/sub?data=${data}`;
}

function renderAdvancedOptions(advancedOptions) {
	const lines = [];
	if (typeof advancedOptions?.config === "string" && advancedOptions.config.trim() !== "") {
		lines.push(`- 模板 URL：\`${advancedOptions.config.trim()}\``);
	}
	const include = (advancedOptions?.include ?? [])
		.map((item) => item.trim())
		.filter((item) => item !== "");
	if (include.length > 0) {
		lines.push(`- include：${include.map((item) => `\`${item}\``).join("、")}`);
	}
	const exclude = (advancedOptions?.exclude ?? [])
		.map((item) => item.trim())
		.filter((item) => item !== "");
	if (exclude.length > 0) {
		lines.push(`- exclude：${exclude.map((item) => `\`${item}\``).join("、")}`);
	}
	if (advancedOptions?.emoji === true) {
		lines.push("- emoji：开启");
	}
	if (advancedOptions?.udp === true) {
		lines.push("- UDP：开启");
	}
	if (advancedOptions?.skipCertVerify === true) {
		lines.push("- 跳过证书校验：开启");
	}
	return lines.length > 0 ? lines.join("\n") : "- （无）";
}

function renderStage2Bullets(rows) {
	if (!Array.isArray(rows) || rows.length === 0) {
		throw new Error("stage2 rows are missing or empty");
	}
	return rows
		.map((row) => {
			const mode = MODE_LABELS[row.mode] ?? row.mode;
			const target = formatTarget(row.targetName);
			return `- ${row.landingNodeName} · ${mode} · ${target}`;
		})
		.join("\n");
}

function renderManualSocksTable(manualSocksItems) {
	const item = manualSocksItems?.[0];
	if (!item) {
		throw new Error("canonical scenario is missing manualSocks5Items[0]");
	}
	return [
		"| 字段 | 值 |",
		"|------|-----|",
		`| 名称 | \`${item.name}\` |`,
		`| 服务器 | \`${item.server}\` |`,
		`| 端口 | \`${item.port}\` |`,
		`| 用户名 | \`${item.username}\` |`,
		`| 密码 | \`${item.password}\` |`,
	].join("\n");
}

function renderManualSocksURI(manualSocksItems) {
	const item = manualSocksItems?.[0];
	if (!item) {
		throw new Error("canonical scenario is missing manualSocks5Items[0]");
	}
	const auth =
		typeof item.username === "string" &&
		item.username.trim() !== "" &&
		typeof item.password === "string" &&
		item.password.trim() !== ""
			? `${encodeURIComponent(item.username)}:${encodeURIComponent(item.password)}@`
			: "";
	const fragment =
		typeof item.name === "string" && item.name.trim() !== ""
			? `#${encodeURIComponent(item.name)}`
			: "";
	return `socks5://${auth}${item.server}:${item.port}${fragment}`;
}

function renderManualSocksGeneratedTGURI(manualSocksItems) {
	const item = manualSocksItems?.[0];
	if (!item) {
		throw new Error("canonical scenario is missing manualSocks5Items[0]");
	}
	if (typeof item.generatedURI !== "string" || item.generatedURI.trim() === "") {
		throw new Error("canonical scenario is missing manualSocks5Items[0].generatedURI");
	}
	return item.generatedURI.trim();
}

function renderStage2OperationChecklist() {
	return [
		"- 为 `🇸🇬 Alpha-SS-SG` 新建 `1` 个副本：源行设为 `链式 -> 🇭🇰 香港节点`，副本设为 `链式 -> 🇸🇬 新加坡节点`。",
		"- 为 `🇸🇬 Alpha-Reality-SG` 新建 `2` 个副本：源行设为 `无`，两个副本分别设为 `端口转发 -> relay-a.example.com:7443`、`端口转发 -> relay-b.example.com:8443`。",
		"- `🇯🇵 Beta-SS-JP` 保持 `链式 -> 🇯🇵 日本节点`；`🇯🇵 Beta-Reality-JP` 改为 `无`。",
		"- 开启“线路聚合模式”，并在 `198.51.100.10` 组中仅勾选：`🇸🇬 Alpha-SS-SG`、`🇸🇬 Alpha-SS-SG 2`、`🇸🇬 Alpha-Reality-SG 2`、`🇸🇬 Alpha-Reality-SG 3`（不要勾选 `🇸🇬 Alpha-Reality-SG`）。",
		"- `198.51.100.11` 相关节点不入组聚合；同时开启“目标策略组节点切换优化”。",
	].join("\n");
}

export function renderDualLandingManualReference({
	scenario,
	stage1ConvertResponse,
	stage2Snapshot,
	shortLinkResponse,
	previewUrl = PREVIEW_URL,
}) {
	const stage1Input = scenario?.stage1Input;
	if (!stage1Input) {
		throw new Error("dual-landing canonical scenario is missing stage1Input");
	}

	const landingURILines = buildLandingURILines(stage1Input);
	if (landingURILines.length === 0) {
		throw new Error("expected landing URIs, got 0");
	}

	const relayLines = (stage1Input.forwardRelayItems ?? [])
		.map((item) => item.trim())
		.filter((item) => item !== "");
	if (relayLines.length !== 2) {
		throw new Error(`expected 2 forward relay lines, got ${relayLines.length}`);
	}

	const stage2InitRows = stage1ConvertResponse?.stage2Init?.rows;
	if (!Array.isArray(stage2InitRows) || stage2InitRows.length === 0) {
		throw new Error("stage1-convert.response.json is missing stage2Init.rows");
	}

	const shortID = extractShortID(shortLinkResponse.shortUrl);
	const longURLGoldenPath = extractLongURLGoldenPath(shortLinkResponse.longUrl);
	const transitURLs = buildTransitSubscriptionURLs();

	const sections = [
		AUTO_GENERATED_BANNER,
		"",
		"# dual-landing 手工测试数据",
		"",
		`[在线预览 Demo](${previewUrl}) · [fixture 说明](dual-landing-chain-port-forward.md) · [README](../../README.md)`,
		"",
		"顺序：**落地 → SOCKS5 → 中转 → 高级（含端口转发）→ 转换**。落地区只贴 URI，勿用 Worker 落地订阅链接。",
		"",
		"## Stage1",
		"",
		`### 落地节点（${landingURILines.length} 行）`,
		"",
		codeBlockLines(landingURILines),
		"",
		"### + 添加 SOCKS5",
		"",
		renderManualSocksTable(stage1Input.manualSocks5Items),
		"",
		"SOCKS5 URI 输入（与上表字段二选一）：",
		"",
		codeBlockLines([renderManualSocksURI(stage1Input.manualSocks5Items)]),
		"",
		"添加后应生成并追加同一条 TG URI（用于核对）：",
		"",
		codeBlockLines([renderManualSocksGeneratedTGURI(stage1Input.manualSocks5Items)]),
		"",
		"### 中转信息（2 行）",
		"",
		codeBlockLines(transitURLs),
		"",
		"### 端口转发（直接 + 端口转发）",
		"",
		codeBlockLines(relayLines),
		"",
		"### 高级选项",
		"",
		renderAdvancedOptions(stage1Input.advancedOptions),
		"",
		"## Stage2（转换后 → 按金样改 → 生成）",
		"",
		"**转换后默认**",
		"",
		renderStage2Bullets(stage2InitRows),
		"",
		"### Stage2 操作要点（先操作，再对照金样）",
		"",
		renderStage2OperationChecklist(),
		"",
		"**生成前金样**",
		"",
		renderStage2Bullets(stage2Snapshot.rows),
		"",
		"## 验收",
		"",
		`- short ID 金样：\`${shortID}\`（Stage3 反向解析；同一份可见配置应得到一致 short ID）`,
		"",
		"- long URL payload 金样（`/sub?data=…`；scheme/host 随部署变化，同一份可见配置应得到一致 payload）：",
		"",
		codeBlockLines([longURLGoldenPath]),
		"",
	].join("\n");

	return `${sections.replace(/\n+$/, "")}\n`;
}

export function loadDualLandingManualReferenceInputs(repoRoot) {
	const scenarioPath = path.join(
		repoRoot,
		"testdata",
		"canonical-scenarios",
		"dual-landing-chain-port-forward.stage1.json",
	);
	const stage1ConvertResponsePath = path.join(
		repoRoot,
		"internal",
		"review",
		"testdata",
		"dual-landing-chain-port-forward",
		"stage1",
		"output",
		"stage1-convert.response.json",
	);
	const stage2SnapshotPath = path.join(
		repoRoot,
		"internal",
		"review",
		"testdata",
		"dual-landing-chain-port-forward",
		"stage2",
		"input",
		"stage2-snapshot.json",
	);
	const shortLinksResponsePath = path.join(
		repoRoot,
		"internal",
		"review",
		"testdata",
		"dual-landing-chain-port-forward",
		"stage2",
		"output",
		"short-links.response.json",
	);

	return {
		scenario: readJSON(scenarioPath),
		stage1ConvertResponse: readJSON(stage1ConvertResponsePath),
		stage2Snapshot: readJSON(stage2SnapshotPath).stage2Snapshot,
		shortLinkResponse: readJSON(shortLinksResponsePath),
	};
}

export function buildDualLandingManualReferenceMarkdown(repoRoot, options = {}) {
	const inputs = loadDualLandingManualReferenceInputs(repoRoot);
	return renderDualLandingManualReference({ ...inputs, ...options });
}

export const DUAL_LANDING_MANUAL_REFERENCE_PATH = path.join(
	"docs",
	"testing",
	"dual-landing-manual-reference.md",
);
