import { expect, test } from "@playwright/test";

import { loadCanonicalStage1Inputs } from "./canonicalStage1";
import {
	addTagInField,
	applyDefaultUiPreferences,
	expectHTTPResponseOK,
	locateStage2Row,
	selectStage2MenuOption,
} from "./helpers";

import type { GenerateRequest, ResolveURLResponse, Stage1ConvertRequest, Stage1ConvertResponse } from "../src/types/api";

const canonicalStage1Inputs = loadCanonicalStage1Inputs("dual-landing-chain-port-forward");

test("real dual-landing full flow preserves stage2 orchestration across replay", async ({ page, baseURL }) => {
	test.setTimeout(180_000);

	const origin = baseURL?.trim();
	if (!origin) {
		throw new Error("real dual-landing full flow requires Playwright baseURL / CHAIN_SUBCONVERTER_E2E_BASE_URL");
	}

	const [relayA, relayB] = canonicalStage1Inputs.forwardRelayItems;
	if (!relayA || !relayB) {
		throw new Error("dual-landing canonical scenario must provide two forward relay items");
	}

	await applyDefaultUiPreferences(page);

	await Promise.all([
		page.waitForResponse((resp) => resp.url().includes("/api/runtime-config") && resp.ok()),
		page.goto("/"),
	]);

	await expect(page.getByRole("heading", { name: "链式代理 · 订阅转换" })).toBeVisible({
		timeout: 15_000,
	});

	await page.getByLabel("落地信息").fill(canonicalStage1Inputs.landingInput);
	await page.getByLabel("中转信息").fill(canonicalStage1Inputs.transitInput);

	const addRelayButton = page.getByRole("button", { name: "+ 添加 端口转发" });
	await addRelayButton.click();
	const relayDialog = page.getByRole("dialog", { name: "添加端口转发服务" });
	const relayInput = relayDialog.getByPlaceholder("输入 server:port ，按 Enter 添加多个");
	await relayInput.fill(relayA);
	await relayInput.press("Enter");
	await relayInput.fill(relayB);
	await relayInput.press("Enter");
	await relayDialog.getByRole("button", { name: "确认" }).click();

	await page.getByRole("button", { name: "高级选项" }).click();
	await addTagInField(page, "包含节点", "HK");
	await addTagInField(page, "排除节点", "JP");

	const stage1ConvertResponsePromise = page.waitForResponse((resp) => resp.url().includes("/api/stage1/convert"));
	await page.getByRole("button", { name: "转换并自动填充" }).click();
	const stage1ConvertResponse = await stage1ConvertResponsePromise;
	await expectHTTPResponseOK(stage1ConvertResponse, "stage1 convert");

	const stage1ConvertRequest = stage1ConvertResponse.request().postDataJSON() as Stage1ConvertRequest;
	expect(stage1ConvertRequest.stage1Input.forwardRelayItems).toEqual([relayA, relayB]);
	expect(stage1ConvertRequest.stage1Input.advancedOptions.include).toEqual(["HK"]);
	expect(stage1ConvertRequest.stage1Input.advancedOptions.exclude).toEqual(["JP"]);

	const stage1ConvertPayload = (await stage1ConvertResponse.json()) as Stage1ConvertResponse;
	const firstRowName = stage1ConvertPayload.stage2Init.rows[0]?.landingNodeName;
	const secondRowName = stage1ConvertPayload.stage2Init.rows[1]?.landingNodeName;
	if (!firstRowName || !secondRowName) {
		throw new Error("dual-landing full flow requires at least two stage2 rows");
	}
	const preferredChainTarget = stage1ConvertPayload.stage2Init.chainTargets.find((target) => !target.isEmpty)?.name;
	if (!preferredChainTarget) {
		throw new Error("dual-landing full flow requires a non-empty chain target");
	}

	const firstRow = locateStage2Row(page, firstRowName);
	const secondRow = locateStage2Row(page, secondRowName);
	await selectStage2MenuOption(page, firstRow, 0, "链式代理");
	await selectStage2MenuOption(page, firstRow, 1, preferredChainTarget);
	await selectStage2MenuOption(page, secondRow, 0, "端口转发");
	await selectStage2MenuOption(page, secondRow, 1, relayB);

	const generateButton = page.getByRole("button", { name: "生成链接" });
	await expect(generateButton).toBeEnabled({ timeout: 90_000 });
	const generateResponsePromise = page.waitForResponse((resp) => resp.url().includes("/api/generate"));
	await generateButton.click();
	const generateResponse = await generateResponsePromise;
	await expectHTTPResponseOK(generateResponse, "generate");

	const generateRequest = generateResponse.request().postDataJSON() as GenerateRequest;
	expect(generateRequest.stage2Snapshot.rows).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				landingNodeName: firstRowName,
				mode: "chain",
				targetName: preferredChainTarget,
			}),
			expect.objectContaining({
				landingNodeName: secondRowName,
				mode: "port_forward",
				targetName: relayB,
			}),
		]),
	);

	const currentLink = page.getByLabel("当前链接");
	await expect(currentLink).not.toHaveValue("", { timeout: 30_000 });
	const longURL = await currentLink.inputValue();
	expect(new URL(longURL).searchParams.has("data")).toBeTruthy();

	await page.locator("label").filter({ hasText: /^短链接$/ }).click();
	await expect(currentLink).not.toHaveValue(longURL, { timeout: 30_000 });
	const shortURL = await currentLink.inputValue();

	const resolveResponse = await page.request.post(new URL("/api/resolve-url", origin).toString(), {
		data: { url: shortURL },
	});
	expect(resolveResponse.ok()).toBeTruthy();
	const resolvePayload = (await resolveResponse.json()) as ResolveURLResponse;
	expect(resolvePayload.restoreStatus).toBe("replayable");
	expect(resolvePayload.stage1Input.advancedOptions.include).toEqual(["HK"]);
	expect(resolvePayload.stage1Input.advancedOptions.exclude).toEqual(["JP"]);
	expect(resolvePayload.stage2Snapshot.rows).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				landingNodeName: firstRowName,
				mode: "chain",
				targetName: preferredChainTarget,
			}),
			expect.objectContaining({
				landingNodeName: secondRowName,
				mode: "port_forward",
				targetName: relayB,
			}),
		]),
	);

	await page.getByRole("button", { name: "反向解析" }).click();
	await expect(firstRow.locator(".a-target-menu__trigger").nth(0)).toContainText("链式代理");
	await expect(firstRow.locator(".a-target-menu__trigger").nth(1)).toContainText(preferredChainTarget);
	await expect(secondRow.locator(".a-target-menu__trigger").nth(0)).toContainText("端口转发");
	await expect(secondRow.locator(".a-target-menu__trigger").nth(1)).toContainText(relayB);
});
