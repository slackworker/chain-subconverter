import assert from "node:assert/strict";
import test from "node:test";
import { fileURLToPath } from "node:url";
import path from "node:path";

import {
	buildDualLandingManualReferenceMarkdown,
	buildTransitSubscriptionURLs,
	extractShortID,
	loadDualLandingManualReferenceInputs,
} from "../../../scripts/lib/dual-landing-manual-reference.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");

test("builds transit subscription URLs for manual golden path", () => {
	const urls = buildTransitSubscriptionURLs();
	assert.equal(urls.length, 2);
	for (const url of urls) {
		assert.match(url, /^https:\/\//);
		assert.doesNotMatch(url, /\]\(/);
	}
	assert.match(urls[0], /Airport-Subscription-1$/);
	assert.match(urls[1], /Airport-Subscription-2\?target=ClashMeta$/);
});

test("extracts short ID without exposing longUrl payload", () => {
	assert.equal(
		extractShortID("http://localhost:11200/sub/8H2n2nLX1YQ"),
		"8H2n2nLX1YQ",
	);
});

test("manual reference maps fields in landing-then-transit order", () => {
	const markdown = buildDualLandingManualReferenceMarkdown(repoRoot);
	assert.match(markdown, /AUTO-GENERATED/);
	assert.doesNotMatch(markdown, /generate\.request\.json/);
	assert.doesNotMatch(markdown, /stage1\/convert/);
	assert.doesNotMatch(markdown, /download\/Landing-Subscription/);
	assert.doesNotMatch(markdown, /\[.*\]\(https:\/\/chain-subconverter-test-fixtures/);
	assert.match(markdown, /落地 → SOCKS5 → 中转/);
	assert.match(markdown, /### 中转信息/);
	assert.equal((markdown.match(/Airport-Subscription-1/g) ?? []).length, 1);
	const transitURLs = buildTransitSubscriptionURLs();
	for (const url of transitURLs) {
		assert.ok(markdown.includes(url), `missing transit URL: ${url}`);
	}
	const { stage1Input } = loadDualLandingManualReferenceInputs(repoRoot).scenario;
	for (const uri of stage1Input.landingItems) {
		assert.ok(markdown.includes(uri), `missing landing URI: ${uri}`);
	}
	assert.match(markdown, /\*\*转换后默认\*\*/);
	assert.match(markdown, /\*\*生成前金样\*\*/);
	assert.match(markdown, /### Stage2 操作要点/);
	assert.match(markdown, /线路聚合模式/);
	assert.match(markdown, /目标策略组节点切换优化/);
	const { shortLinkResponse } = loadDualLandingManualReferenceInputs(repoRoot);
	const shortID = extractShortID(shortLinkResponse.shortUrl);
	assert.match(markdown, new RegExp(`short ID 金样：\`${shortID}\``));
	assert.doesNotMatch(markdown, /data=H4sI/);
});
