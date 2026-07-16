import { expect, test } from "@playwright/test";

import type { GenerateRequest, Stage1ConvertRequest } from "../src/types/api";
import {
	addForwardRelays,
	addManualSocks5FromURI,
	applyDefaultUiPreferences,
	assertWireSnapshotHasNoClientIds,
	cloneStage2Row,
	ensureChecked,
	ensureStage2AdvancedOpen,
	expectAggregationFallbackOrder,
	expectHTTPResponseOK,
	locateStage2Row,
	normalizeStage2SnapshotForGoldenCompare,
	selectStage2MenuOption,
	type ResolveURLWireResponse,
} from "./helpers";
import {
	hasPreviewStage1EnvOverride,
	loadDualLandingGoldenArtifacts,
	loadPreviewManualStage1Inputs,
} from "./previewInputs";

/**
 * 真实部署 Full：一比一还原 docs/testing/preview-inputs.md 手工路径与金样。
 * 不接受 CHAIN_SUBCONVERTER_E2E_{LANDING,TRANSIT}_INPUT* 覆盖（那些仅给 real-smoke）。
 */
const previewStage1 = loadPreviewManualStage1Inputs();
const golden = loadDualLandingGoldenArtifacts();

const ROW = {
	alphaSS: "🇸🇬 Alpha-SS-SG",
	alphaSS2: "🇸🇬 Alpha-SS-SG 2",
	alphaReality: "🇸🇬 Alpha-Reality-SG",
	alphaReality2: "🇸🇬 Alpha-Reality-SG 2",
	alphaReality3: "🇸🇬 Alpha-Reality-SG 3",
	betaSS: "🇯🇵 Beta-SS-JP",
	betaReality: "🇯🇵 Beta-Reality-JP",
	socks: "🇭🇰 Manual-SOCKS5-HK-Fallback",
} as const;

test("real dual-landing full flow matches preview-inputs golden path", async ({ page, baseURL }) => {
	test.setTimeout(240_000);
	test.skip(
		hasPreviewStage1EnvOverride(),
		"real-full 必须一比一还原 preview-inputs；请 unset CHAIN_SUBCONVERTER_E2E_{LANDING,TRANSIT}_INPUT*",
	);

	const origin = baseURL?.trim();
	if (!origin) {
		throw new Error("real dual-landing full flow requires Playwright baseURL / CHAIN_SUBCONVERTER_E2E_BASE_URL");
	}

	const [relayA, relayB] = previewStage1.forwardRelayItems;
	if (!relayA || !relayB) {
		throw new Error("dual-landing canonical scenario must provide two forward relay items");
	}

	const { landingInput, transitInput } = previewStage1;

	await applyDefaultUiPreferences(page);

	await Promise.all([
		page.waitForResponse((resp) => resp.url().includes("/api/runtime-config") && resp.ok()),
		page.goto("/"),
	]);

	await expect(page.getByRole("heading", { name: "链式代理 · 订阅转换" })).toBeVisible({
		timeout: 15_000,
	});

	await page.getByLabel("落地信息").fill(landingInput);
	await addManualSocks5FromURI(page, previewStage1.socks5URI);
	await expect(page.getByLabel("落地信息")).toContainText(previewStage1.expectedSocksGeneratedURI);
	await page.getByLabel("中转信息").fill(transitInput);
	await addForwardRelays(page, [relayA, relayB]);

	const stage1ConvertResponsePromise = page.waitForResponse((resp) => resp.url().includes("/api/stage1/convert"));
	await page.getByRole("button", { name: "转换并自动填充" }).click();
	const stage1ConvertResponse = await stage1ConvertResponsePromise;
	await expectHTTPResponseOK(stage1ConvertResponse, "stage1 convert");

	const stage1ConvertRequest = stage1ConvertResponse.request().postDataJSON() as Stage1ConvertRequest;
	expect(stage1ConvertRequest.stage1Input.forwardRelayItems).toEqual([relayA, relayB]);
	expect(stage1ConvertRequest.stage1Input.transitRawText).toBe(transitInput);

	await expect(locateStage2Row(page, ROW.alphaSS)).toBeVisible({ timeout: 30_000 });
	await expect(locateStage2Row(page, ROW.socks)).toBeVisible();

	await cloneStage2Row(page, ROW.alphaSS);
	await expect(locateStage2Row(page, ROW.alphaSS2)).toBeVisible();
	await cloneStage2Row(page, ROW.alphaReality);
	await expect(locateStage2Row(page, ROW.alphaReality2)).toBeVisible();
	await cloneStage2Row(page, ROW.alphaReality);
	await expect(locateStage2Row(page, ROW.alphaReality3)).toBeVisible();

	const alphaSS = locateStage2Row(page, ROW.alphaSS);
	const alphaSS2 = locateStage2Row(page, ROW.alphaSS2);
	const alphaReality = locateStage2Row(page, ROW.alphaReality);
	const alphaReality2 = locateStage2Row(page, ROW.alphaReality2);
	const alphaReality3 = locateStage2Row(page, ROW.alphaReality3);
	const betaReality = locateStage2Row(page, ROW.betaReality);

	await selectStage2MenuOption(page, alphaSS, 0, "链式代理");
	await selectStage2MenuOption(page, alphaSS, 1, "🇭🇰 香港节点");
	await selectStage2MenuOption(page, alphaSS2, 0, "链式代理");
	await selectStage2MenuOption(page, alphaSS2, 1, "🇸🇬 新加坡节点");
	await selectStage2MenuOption(page, alphaReality, 0, "无/直连");
	await selectStage2MenuOption(page, alphaReality2, 0, "端口转发");
	await selectStage2MenuOption(page, alphaReality2, 1, relayA);
	await selectStage2MenuOption(page, alphaReality3, 0, "端口转发");
	await selectStage2MenuOption(page, alphaReality3, 1, relayB);
	await selectStage2MenuOption(page, betaReality, 0, "无/直连");

	const aggregationModeToggle = page.getByRole("checkbox", { name: "线路聚合模式" });
	await ensureChecked(aggregationModeToggle, true);

	const serverRow = page.getByRole("row", { name: /198\.51\.100\.10/ });
	const serverAggEnable = serverRow.getByRole("checkbox", { name: "聚合" });
	await ensureChecked(serverAggEnable, true);
	await expect(serverRow.getByRole("button", { name: "顺序管理" })).toBeEnabled({ timeout: 10_000 });

	// 先清空自动入组，再按金样 fallback 顺序勾选，避免脆弱拖拽重排
	for (const proxyName of [ROW.alphaSS, ROW.alphaSS2, ROW.alphaReality, ROW.alphaReality2, ROW.alphaReality3]) {
		await ensureChecked(locateStage2Row(page, proxyName).getByRole("checkbox", { name: "入组" }), false);
	}
	for (const proxyName of [ROW.alphaReality2, ROW.alphaReality3, ROW.alphaSS, ROW.alphaSS2]) {
		await ensureChecked(locateStage2Row(page, proxyName).getByRole("checkbox", { name: "入组" }), true);
	}

	await expectAggregationFallbackOrder(page, [
		ROW.alphaReality2,
		ROW.alphaReality3,
		ROW.alphaSS,
		ROW.alphaSS2,
	]);

	const stage2 = await ensureStage2AdvancedOpen(page);
	await ensureChecked(
		stage2.getByRole("checkbox", { name: /目标策略组节点切换优化/ }),
		true,
	);

	const generateButton = page.getByRole("button", { name: "生成链接" });
	await expect(generateButton).toBeEnabled({ timeout: 90_000 });
	const generateResponsePromise = page.waitForResponse((resp) => resp.url().includes("/api/generate"));
	await generateButton.click();
	const generateResponse = await generateResponsePromise;
	await expectHTTPResponseOK(generateResponse, "generate");

	const generateRequest = generateResponse.request().postDataJSON() as GenerateRequest;
	assertWireSnapshotHasNoClientIds(generateRequest);
	expect(normalizeStage2SnapshotForGoldenCompare(generateRequest.stage2.snapshot))
		.toEqual(normalizeStage2SnapshotForGoldenCompare(golden.stage2Snapshot));

	const currentLink = page.getByLabel("当前链接");
	await expect(currentLink).not.toHaveValue("", { timeout: 30_000 });
	const longURL = await currentLink.inputValue();
	const longURLParsed = new URL(longURL);
	expect(longURLParsed.searchParams.has("data")).toBeTruthy();
	expect(`${longURLParsed.pathname}?data=${longURLParsed.searchParams.get("data")}`)
		.toBe(golden.longURLGoldenPath);

	await page.locator("label").filter({ hasText: /^短链接$/ }).click();
	await expect(currentLink).not.toHaveValue(longURL, { timeout: 30_000 });
	const shortURL = await currentLink.inputValue();
	const shortID = new URL(shortURL).pathname.split("/").filter(Boolean).at(-1);
	expect(shortID).toBe(golden.shortID);

	const resolveResponse = await page.request.post(new URL("/api/resolve-url", origin).toString(), {
		data: { url: shortURL },
	});
	expect(resolveResponse.ok()).toBeTruthy();
	const resolvePayload = (await resolveResponse.json()) as ResolveURLWireResponse;
	expect(resolvePayload.restoreStatus).toBe("replayable");
	expect(normalizeStage2SnapshotForGoldenCompare(resolvePayload.stage2.snapshot))
		.toEqual(normalizeStage2SnapshotForGoldenCompare(golden.stage2Snapshot));

	await page.getByRole("button", { name: "反向解析" }).click();
	await expect(locateStage2Row(page, ROW.alphaSS).locator(".a-target-menu__trigger").nth(0)).toContainText("链式代理");
	await expect(locateStage2Row(page, ROW.alphaSS).locator(".a-target-menu__trigger").nth(1)).toContainText("🇭🇰 香港节点");
	await expect(locateStage2Row(page, ROW.alphaSS2).locator(".a-target-menu__trigger").nth(1)).toContainText("🇸🇬 新加坡节点");
	await expect(locateStage2Row(page, ROW.alphaReality).locator(".a-target-menu__trigger").nth(0)).toContainText("无/直连");
	await expect(locateStage2Row(page, ROW.alphaReality2).locator(".a-target-menu__trigger").nth(0)).toContainText("端口转发");
	await expect(locateStage2Row(page, ROW.alphaReality2).locator(".a-target-menu__trigger").nth(1)).toContainText(relayA);
	await expect(locateStage2Row(page, ROW.alphaReality3).locator(".a-target-menu__trigger").nth(1)).toContainText(relayB);
	await expect(locateStage2Row(page, ROW.betaSS).locator(".a-target-menu__trigger").nth(1)).toContainText("🇯🇵 日本节点");
	await expect(locateStage2Row(page, ROW.betaReality).locator(".a-target-menu__trigger").nth(0)).toContainText("无/直连");
	await expect(locateStage2Row(page, ROW.socks).locator(".a-target-menu__trigger").nth(1)).toContainText("🇭🇰 香港节点");
});
