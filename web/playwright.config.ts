import path from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig } from "@playwright/test";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const baseURL = process.env.CHAIN_SUBCONVERTER_E2E_BASE_URL ?? "http://127.0.0.1:5173";
const skipManagedWebServer = process.env.CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER === "1";

export default defineConfig({
	testDir: "./e2e",
	fullyParallel: false,
	workers: 1,
	reporter: "list",
	timeout: 45_000,
	expect: {
		timeout: 5_000,
	},
	use: {
		baseURL,
		headless: true,
		trace: "on-first-retry",
	},
	webServer: skipManagedWebServer
		? undefined
		: {
			command: "./scripts/dev-up.sh default",
			cwd: repoRoot,
			reuseExistingServer: !process.env.CI,
			url: baseURL,
			timeout: 120_000,
		},
});