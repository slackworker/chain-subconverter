import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
	buildLandingURILines,
	buildLandingURILinesWithManualSocks,
	deriveSubscriptionArtifacts,
	parseProxyList,
} from "../../../scripts/lib/subscription-artifacts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const scenarioPath = path.join(
	repoRoot,
	"testdata",
	"canonical-scenarios",
	"dual-landing-chain-port-forward.stage1.json",
);
const scenario = JSON.parse(fs.readFileSync(scenarioPath, "utf8"));
const stage1Input = scenario.stage1Input;

test("keeps manual SOCKS5 opt-in at the stage1 landing layer", () => {
	const landingOnly = buildLandingURILines(stage1Input);
	const landingWithManualSocks = buildLandingURILinesWithManualSocks(stage1Input);

	assert.equal(landingOnly.length, 4);
	assert.equal(landingWithManualSocks.length, 5);
	assert.equal(
		landingWithManualSocks.at(-1),
		stage1Input.manualSocks5Items[0].generatedURI,
	);
});

test("derives URI, base64, and mihomo outputs from the same landing baseline", () => {
	const landingWithManualSocks = buildLandingURILinesWithManualSocks(stage1Input);
	const artifacts = deriveSubscriptionArtifacts(landingWithManualSocks);
	const alphaSS = artifacts.mihomoProxies.find((proxy) => proxy.name === "Alpha-SS-SG");
	const manualSocks = artifacts.mihomoProxies.find(
		(proxy) => proxy.name === "Manual-SOCKS5-HK-Fallback",
	);

	assert.equal(artifacts.outputs.General, artifacts.outputs.URI);
	assert.equal(artifacts.uriLines.length, 5);
	assert.equal(
		Buffer.from(artifacts.outputs.base64, "base64").toString("utf8"),
		artifacts.outputs.URI,
	);
	assert.deepEqual(alphaSS, {
		name: "Alpha-SS-SG",
		type: "ss",
		server: "198.51.100.10",
		port: 443,
		cipher: "2022-blake3-aes-256-gcm",
		password: "alpha-ss-sg-secret",
	});
	assert.deepEqual(manualSocks, {
		name: "Manual-SOCKS5-HK-Fallback",
		type: "socks5",
		server: "manual-socks-hk.example.test",
		port: 1080,
		username: "demo-user",
		password: "demo-pass",
	});
	assert.match(artifacts.outputs.mihomo, /^proxies:\n  - \{/m);
	assert.match(artifacts.outputs.mihomo, /"password":"alpha-ss-sg-secret"/);
	assert.deepEqual(parseProxyList(artifacts.outputs.mihomo)[0], alphaSS);
});