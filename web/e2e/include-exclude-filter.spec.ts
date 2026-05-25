import { expect, test, type Page, type Response } from "@playwright/test";

import { loadCanonicalStage1Inputs } from "./canonicalStage1";

import type { GenerateRequest, ResolveURLResponse, Stage1ConvertRequest } from "../src/types/api";

const canonicalStage1Inputs = loadCanonicalStage1Inputs("dual-landing-chain-port-forward");

async function expectOKResponse(response: Response, label: string) {
	if (response.ok()) {
		return;
	}
	throw new Error(`${label} failed with HTTP ${response.status()}: ${await response.text()}`);
}

async function addTag(page: Page, fieldLabel: string, tag: string) {
	const field = page.locator(".a-field").filter({ has: page.getByText(fieldLabel, { exact: true }) });
	const input = field.locator(".a-tag-field__input");
	await input.fill(tag);
	await input.press("Enter");
	await expect(field.locator(".a-tag-chip__text", { hasText: tag })).toBeVisible();
}

test.describe.configure({ mode: "serial" });

test("include hk + exclude JP flow through convert, generate, and resolve", async ({ page, baseURL }) => {
	test.setTimeout(180_000);

	const origin = baseURL?.trim();
	if (!origin) {
		throw new Error("include/exclude filter e2e requires Playwright baseURL");
	}

	await page.addInitScript(() => {
		window.localStorage.setItem("chain-subconverter-ui.locale", "zh");
		window.localStorage.setItem("chain-subconverter-ui.theme", "light");
	});

	await Promise.all([
		page.waitForResponse((resp) => resp.url().includes("/api/runtime-config") && resp.ok()),
		page.goto("/"),
	]);

	await expect(page.getByRole("heading", { name: "链式代理 · 订阅转换" })).toBeVisible({
		timeout: 15_000,
	});

	await page.getByLabel("落地信息").fill(canonicalStage1Inputs.landingInput);
	await page.getByLabel("中转信息").fill(canonicalStage1Inputs.transitInput);

	await page.getByRole("button", { name: "高级选项" }).click();
	await addTag(page, "include 标签", "hk");
	await addTag(page, "exclude 标签", "JP");

	const stage1ConvertResponsePromise = page.waitForResponse(
		(resp) => resp.url().includes("/api/stage1/convert"),
	);
	await page.getByRole("button", { name: "转换并自动填充" }).click();
	const stage1ConvertResponse = await stage1ConvertResponsePromise;
	await expectOKResponse(stage1ConvertResponse, "stage1 convert");

	const stage1ConvertRequest = stage1ConvertResponse.request().postDataJSON() as Stage1ConvertRequest;
	expect(stage1ConvertRequest.stage1Input.advancedOptions.include).toEqual(["hk"]);
	expect(stage1ConvertRequest.stage1Input.advancedOptions.exclude).toEqual(["JP"]);
	await expect(page.locator(".a-table tbody tr").first()).toBeVisible({ timeout: 30_000 });

	const generateButton = page.getByRole("button", { name: "生成链接" });
	await expect(generateButton).toBeEnabled({ timeout: 90_000 });

	const generateResponsePromise = page.waitForResponse((resp) => resp.url().includes("/api/generate"));
	await generateButton.click();
	const generateResponse = await generateResponsePromise;
	await expectOKResponse(generateResponse, "generate");

	const generateRequest = generateResponse.request().postDataJSON() as GenerateRequest;
	expect(generateRequest.stage1Input.advancedOptions.include).toEqual(["hk"]);
	expect(generateRequest.stage1Input.advancedOptions.exclude).toEqual(["JP"]);

	const currentLink = page.getByLabel("当前链接");
	await expect(currentLink).not.toHaveValue("", { timeout: 30_000 });
	const generatedURL = new URL(await currentLink.inputValue());
	expect(generatedURL.searchParams.has("data")).toBeTruthy();

	const generatedSubResponse = await page.request.get(generatedURL.toString());
	expect(generatedSubResponse.ok()).toBeTruthy();
	expect(await generatedSubResponse.text()).toContain("proxies:");

	const generatedResolveResponse = await page.request.post(new URL("/api/resolve-url", origin).toString(), {
		data: { url: generatedURL.toString() },
	});
	expect(generatedResolveResponse.ok()).toBeTruthy();
	const generatedResolvePayload = (await generatedResolveResponse.json()) as ResolveURLResponse;
	expect(generatedResolvePayload.restoreStatus).toBe("replayable");
	expect(generatedResolvePayload.stage1Input.advancedOptions.include).toEqual(["hk"]);
	expect(generatedResolvePayload.stage1Input.advancedOptions.exclude).toEqual(["JP"]);

	await page.getByRole("button", { name: "反向解析" }).click();
	await expect(page.locator(".a-field").filter({ has: page.getByText("include 标签", { exact: true }) }).getByText("hk", { exact: true })).toBeVisible();
	await expect(page.locator(".a-field").filter({ has: page.getByText("exclude 标签", { exact: true }) }).getByText("JP", { exact: true })).toBeVisible();
});
