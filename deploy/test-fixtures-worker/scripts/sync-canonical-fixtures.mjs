#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
	buildLandingURILinesWithManualSocks,
	buildSubscriptionFiles,
} from "../../../scripts/lib/subscription-artifacts.mjs";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..", "..");
const canonicalScenarioRoot = path.join(repoRoot, "testdata", "canonical-scenarios");
const dualLandingScenarioPath = path.join(
	canonicalScenarioRoot,
	"dual-landing-chain-port-forward.stage1.json",
);
const workerPublicRoot = path.join(repoRoot, "deploy", "test-fixtures-worker", "public");
const workerDownloadRoots = [
	path.join(workerPublicRoot, "dual-landing", "download"),
	path.join(workerPublicRoot, "7xK9pLm2Qr4vB6yN8sT3", "download"),
];

const checkMode = process.argv.includes("--check");

function normalizeNewlines(value) {
	return value.replace(/\r\n/g, "\n");
}

function normalizeBase64(value) {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4;
	if (padding === 0) {
		return normalized;
	}
	return normalized.padEnd(normalized.length + (4 - padding), "=");
}

function readText(filePath) {
	return normalizeNewlines(fs.readFileSync(filePath, "utf8"));
}

function trimTrailingNewline(value) {
	return value.replace(/[\n]+$/, "");
}

function nonEmptyLines(value) {
	return trimTrailingNewline(value)
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

function ensureParentDirectory(filePath) {
	fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function writeOrCheckFile(filePath, expectedContent) {
	const normalizedExpected = normalizeNewlines(expectedContent);
	if (checkMode) {
		const actual = normalizeNewlines(fs.readFileSync(filePath, "utf8"));
		if (actual !== normalizedExpected) {
			throw new Error(`worker fixture drift: ${path.relative(repoRoot, filePath)}`);
		}
		return;
	}
	ensureParentDirectory(filePath);
	fs.writeFileSync(filePath, normalizedExpected);
}

function readJSON(filePath) {
	return JSON.parse(readText(filePath));
}

const dualLandingScenario = readJSON(dualLandingScenarioPath);
if (!Array.isArray(dualLandingScenario.transitFixtures) || dualLandingScenario.transitFixtures.length < 2) {
	throw new Error(`dual-landing canonical scenario is missing transit fixtures: ${dualLandingScenarioPath}`);
}

const landingURILines = buildLandingURILinesWithManualSocks(
	dualLandingScenario.stage1Input,
	"dual-landing stage1Input.manualSocks5Items",
);
if (landingURILines.length === 0) {
	throw new Error(`dual-landing canonical scenario is missing landing fixtures: ${dualLandingScenarioPath}`);
}

const transitFixtureGroups = dualLandingScenario.transitFixtures.map((fixture, index) => {
	if (typeof fixture.uriContentFile !== "string" || fixture.uriContentFile.trim() === "") {
		throw new Error(`dual-landing transit fixture is missing uriContentFile at index ${index}`);
	}
	const uriContent = readText(path.join(canonicalScenarioRoot, fixture.uriContentFile));
	const uriLines = nonEmptyLines(uriContent);
	if (uriLines.length === 0) {
		throw new Error(`dual-landing transit fixture is empty: ${fixture.uriContentFile}`);
	}
	return {
		baseName: `Airport-Subscription-${index + 1}`,
		uriLines,
	};
});

const aggregatedTransitURILines = transitFixtureGroups.flatMap((group) => group.uriLines);

const generatedFiles = [
	...buildSubscriptionFiles("Landing-Subscription", landingURILines),
	...transitFixtureGroups.flatMap((group) => buildSubscriptionFiles(group.baseName, group.uriLines)),
	...buildSubscriptionFiles("Airport-Subscription", aggregatedTransitURILines),
];

for (const file of generatedFiles) {
	for (const workerDownloadRoot of workerDownloadRoots) {
		writeOrCheckFile(path.join(workerDownloadRoot, file.name), file.content);
	}
}

if (!checkMode) {
	process.stdout.write(
		`synced ${generatedFiles.length} worker fixtures to ${workerDownloadRoots.length} paths from dual-landing canonical data\n`,
	);
}