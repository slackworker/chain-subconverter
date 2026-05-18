import { expect, test } from "@playwright/test";

import type { GenerateRequest, Stage1ConvertRequest, Stage1ConvertResponse } from "../src/types/api";

test("default UI minimal happy path via fixed-port runtime", async ({ page }) => {
	const landingInput = "ss://landing-happy-path";
	const transitInput = "https://example.com/transit-happy-path.txt";
	const longURL = "http://127.0.0.1:11200/sub?target=clash&url=https%3A%2F%2Fexample.com%2Ftransit-happy-path.txt";
	const shortURL = "http://127.0.0.1:11200/s/happy-path";
	const stage2Init: Stage1ConvertResponse["stage2Init"] = {
		availableModes: ["none", "chain", "port_forward"],
		chainTargets: [],
		forwardRelays: [],
		rows: [
			{
				landingNodeName: "landing-happy",
				landingNodeType: "ss",
				mode: "none",
				targetName: null,
			},
		],
	};

	const stage1Requests: Stage1ConvertRequest[] = [];
	const generateRequests: GenerateRequest[] = [];
	const shortLinkRequests: string[] = [];
	const resolveRequests: string[] = [];

	await page.addInitScript(() => {
		window.localStorage.setItem("chain-subconverter-ui.locale", "zh");
		window.localStorage.setItem("chain-subconverter-ui.theme", "light");
	});

	await page.route("**/api/runtime-config", async (route) => {
		await route.fulfill({
			json: {
				defaultTemplateURL: "https://example.com/default-template.ini",
				maxPublicLongURLLength: 8192,
			},
		});
	});

	await page.route("**/api/stage1/convert", async (route) => {
		const request = route.request().postDataJSON() as Stage1ConvertRequest;
		stage1Requests.push(request);
		await route.fulfill({
			json: {
				stage2Init,
				messages: [],
				blockingErrors: [],
			},
		});
	});

	await page.route("**/api/generate", async (route) => {
		const request = route.request().postDataJSON() as GenerateRequest;
		generateRequests.push(request);
		await route.fulfill({
			json: {
				longUrl: longURL,
				messages: [],
				blockingErrors: [],
			},
		});
	});

	await page.route("**/api/short-links", async (route) => {
		const request = route.request().postDataJSON() as { longUrl: string };
		shortLinkRequests.push(request.longUrl);
		await route.fulfill({
			json: {
				longUrl: request.longUrl,
				shortUrl: shortURL,
				messages: [],
				blockingErrors: [],
			},
		});
	});

	await page.route("**/api/resolve-url", async (route) => {
		const request = route.request().postDataJSON() as { url: string };
		const latestGenerateRequest = generateRequests.at(-1);
		if (latestGenerateRequest === undefined) {
			throw new Error("generate request was not captured before resolve-url");
		}
		resolveRequests.push(request.url);
		await route.fulfill({
			json: {
				longUrl: longURL,
				shortUrl: shortURL,
				restoreStatus: "replayable",
				stage1Input: latestGenerateRequest.stage1Input,
				stage2Snapshot: latestGenerateRequest.stage2Snapshot,
				messages: [],
				blockingErrors: [],
			},
		});
	});

	await page.goto("/");

	await expect(page.getByRole("heading", { name: "链式代理 · 订阅转换" })).toBeVisible();

	await page.getByLabel("落地信息").fill(landingInput);
	await page.getByLabel("中转信息").fill(transitInput);
	await page.getByRole("button", { name: "转换并自动填充" }).click();

	await expect(page.locator(".a-table").getByText("landing-happy", { exact: true })).toBeVisible();

	await page.getByRole("button", { name: "生成链接" }).click();

	const currentLink = page.getByLabel("当前链接");
	await expect(currentLink).toHaveValue(longURL);

	await page.locator("label").filter({ hasText: /^短链接$/ }).click();
	await expect(currentLink).toHaveValue(shortURL);

	await page.getByRole("button", { name: "反向解析" }).click();
	await expect(page.getByLabel("落地信息")).toHaveValue(landingInput);
	await expect(page.getByLabel("中转信息")).toHaveValue(transitInput);
	await expect(currentLink).toHaveValue(shortURL);

	const logToggle = page.getByRole("button", { name: /^日志/ });
	await logToggle.click();

	const logPanel = page.locator("#a-workflow-log-panel");
	await expect(logPanel.getByText("已生成长链接。", { exact: true })).toBeVisible();
	await expect(logPanel.getByText("已生成短链接。", { exact: true })).toBeVisible();
	await expect(logPanel.getByText("已恢复页面状态，可继续编辑和生成。", { exact: true })).toBeVisible();

	expect(stage1Requests).toHaveLength(2);
	expect(generateRequests).toHaveLength(1);
	expect(shortLinkRequests).toEqual([longURL]);
	expect(resolveRequests).toEqual([shortURL]);
	expect(stage1Requests[0]?.stage1Input.landingRawText).toBe(landingInput);
	expect(stage1Requests[0]?.stage1Input.transitRawText).toBe(transitInput);
	expect(generateRequests[0]?.stage2Snapshot.rows).toEqual([
		{
			landingNodeName: "landing-happy",
			mode: "none",
			targetName: null,
		},
	]);
});