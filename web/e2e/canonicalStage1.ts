import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

type CanonicalStage1Scenario = {
	stage1Input?: {
		landingItems?: string[];
		transitItems?: string[];
		forwardRelayItems?: string[];
	};
	transitFixtures?: Array<{
		uriContentFile?: string;
	}>;
};

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..", "..");

function normalizeStage1Items(items: string[] | undefined) {
	return (items ?? []).map((item) => item.trim()).filter((item) => item !== "");
}

export interface CanonicalStage1Inputs {
	landingInput: string;
	transitInput: string;
	forwardRelayItems: string[];
}

function loadTransitFixtureContent(scenario: CanonicalStage1Scenario) {
	const files = (scenario.transitFixtures ?? [])
		.map((fixture) => fixture.uriContentFile?.trim())
		.filter((file): file is string => Boolean(file));
	if (files.length === 0) {
		return null;
	}
	const chunks = files.map((file) => {
		const fixturePath = path.join(repoRoot, "testdata", "canonical-scenarios", file);
		return fs.readFileSync(fixturePath, "utf8").trim();
	});
	return chunks.filter((chunk) => chunk !== "").join("\n");
}

export function loadCanonicalStage1Inputs(scenarioID: string): CanonicalStage1Inputs {
	const scenarioPath = path.join(
		repoRoot,
		"testdata",
		"canonical-scenarios",
		`${scenarioID}.stage1.json`,
	);
	const raw = fs.readFileSync(scenarioPath, "utf8");
	const scenario = JSON.parse(raw) as CanonicalStage1Scenario;
	const landingItems = normalizeStage1Items(scenario.stage1Input?.landingItems);
	const transitItems = normalizeStage1Items(scenario.stage1Input?.transitItems);
	const transitFixtureContent = loadTransitFixtureContent(scenario);
	const forwardRelayItems = normalizeStage1Items(scenario.stage1Input?.forwardRelayItems);
	if (landingItems.length === 0 || (transitItems.length === 0 && !transitFixtureContent)) {
		throw new Error(`canonical scenario is missing default stage1 inputs: ${scenarioPath}`);
	}
	return {
		landingInput: landingItems.join("\n"),
		transitInput: transitFixtureContent ?? transitItems.join("\n"),
		forwardRelayItems,
	};
}