import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import type { Stage2SnapshotWire } from "../src/types/api";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

const SCENARIO_ID = "dual-landing-chain-port-forward";

type ManualSocks5Item = {
	name?: string;
	server?: string;
	port?: number;
	username?: string;
	password?: string;
	generatedURI?: string;
};

type PreviewScenario = {
	stage1Input?: {
		landingItems?: string[];
		transitItems?: string[];
		forwardRelayItems?: string[];
		manualSocks5Items?: ManualSocks5Item[];
	};
};

function normalizeItems(items: string[] | undefined) {
	return (items ?? []).map((item) => item.trim()).filter((item) => item !== "");
}

function readJSON<T>(relativePath: string): T {
	const absolutePath = path.join(repoRoot, relativePath);
	return JSON.parse(fs.readFileSync(absolutePath, "utf8")) as T;
}

function buildSocks5URI(item: ManualSocks5Item) {
	const name = item.name?.trim() ?? "";
	const server = item.server?.trim() ?? "";
	const port = item.port;
	const username = item.username?.trim() ?? "";
	const password = item.password?.trim() ?? "";
	if (!name || !server || !port) {
		throw new Error("preview-inputs SOCKS5 sample is incomplete");
	}
	const userInfo = username !== "" || password !== ""
		? `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`
		: "";
	return `socks5://${userInfo}${server}:${port}#${encodeURIComponent(name)}`;
}

export interface PreviewManualStage1Inputs {
	landingInput: string;
	socks5URI: string;
	expectedSocksGeneratedURI: string;
	transitInput: string;
	forwardRelayItems: string[];
}

/** Stage1 输入与 docs/testing/preview-inputs.md 手工路径一致（Worker 中转 URL + SOCKS5）。 */
export function loadPreviewManualStage1Inputs(): PreviewManualStage1Inputs {
	const scenario = readJSON<PreviewScenario>(
		path.join("testdata", "canonical-scenarios", `${SCENARIO_ID}.stage1.json`),
	);
	const landingItems = normalizeItems(scenario.stage1Input?.landingItems);
	const transitItems = normalizeItems(scenario.stage1Input?.transitItems);
	const forwardRelayItems = normalizeItems(scenario.stage1Input?.forwardRelayItems);
	const socksItem = scenario.stage1Input?.manualSocks5Items?.[0];
	if (landingItems.length === 0 || transitItems.length === 0 || !socksItem) {
		throw new Error("preview manual stage1 inputs are incomplete in canonical scenario");
	}
	const expectedSocksGeneratedURI = socksItem.generatedURI?.trim() ?? "";
	if (!expectedSocksGeneratedURI) {
		throw new Error("preview manual SOCKS5 generatedURI is missing");
	}
	return {
		landingInput: landingItems.join("\n"),
		socks5URI: buildSocks5URI(socksItem),
		expectedSocksGeneratedURI,
		transitInput: transitItems.join("\n"),
		forwardRelayItems,
	};
}

export interface DualLandingGoldenArtifacts {
	stage2Snapshot: Stage2SnapshotWire;
	shortID: string;
	longURLGoldenPath: string;
}

/** 与 preview-inputs.md 验收金样同源（review fixture short-links + stage2-snapshot）。 */
export function loadDualLandingGoldenArtifacts(): DualLandingGoldenArtifacts {
	const snapshotWrapper = readJSON<{ stage2Snapshot: Stage2SnapshotWire }>(
		path.join(
			"internal",
			"review",
			"testdata",
			SCENARIO_ID,
			"stage2",
			"input",
			"stage2-snapshot.json",
		),
	);
	const shortLinks = readJSON<{ longUrl: string; shortUrl: string }>(
		path.join(
			"internal",
			"review",
			"testdata",
			SCENARIO_ID,
			"stage2",
			"output",
			"short-links.response.json",
		),
	);
	const shortURL = new URL(shortLinks.shortUrl);
	const shortID = shortURL.pathname.split("/").filter(Boolean).at(-1)?.trim() ?? "";
	if (!shortID) {
		throw new Error(`failed to extract short ID from ${shortLinks.shortUrl}`);
	}
	const longURL = new URL(shortLinks.longUrl);
	const data = longURL.searchParams.get("data")?.trim() ?? "";
	if (!data) {
		throw new Error(`longUrl is missing data query parameter: ${shortLinks.longUrl}`);
	}
	return {
		stage2Snapshot: snapshotWrapper.stage2Snapshot,
		shortID,
		longURLGoldenPath: `/sub?data=${data}`,
	};
}

export function hasEnvInputOverride(name: string) {
	if (process.env[name]?.trim()) {
		return true;
	}
	const suffixPattern = new RegExp(`^${name}_(\\d+)$`);
	for (const [key, rawValue] of Object.entries(process.env)) {
		if (!suffixPattern.test(key)) {
			continue;
		}
		if (rawValue?.trim()) {
			return true;
		}
	}
	return false;
}

/** real-full 金样路径禁止 Stage1 覆盖；real-smoke 仍可用 inputFromEnv。 */
export function hasPreviewStage1EnvOverride() {
	return hasEnvInputOverride("CHAIN_SUBCONVERTER_E2E_LANDING_INPUT")
		|| hasEnvInputOverride("CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT");
}

export function inputFromEnv(name: string, fallback: string) {
	const values: Array<{ index: number; value: string }> = [];
	const primary = process.env[name]?.trim();
	if (primary) {
		values.push({ index: 1, value: primary });
	}
	const suffixPattern = new RegExp(`^${name}_(\\d+)$`);
	for (const [key, rawValue] of Object.entries(process.env)) {
		const match = key.match(suffixPattern);
		if (!match) {
			continue;
		}
		const index = Number(match[1]);
		if (!Number.isInteger(index) || index < 2) {
			continue;
		}
		const value = rawValue?.trim();
		if (!value) {
			continue;
		}
		values.push({ index, value });
	}
	if (values.length === 0) {
		return fallback;
	}
	values.sort((left, right) => left.index - right.index);
	return values.map((entry) => entry.value).join("\n");
}
