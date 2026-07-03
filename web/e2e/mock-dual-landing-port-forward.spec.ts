import { expect, test } from "@playwright/test";

import {
	applyDefaultUiPreferences,
	locateStage2Row,
	mockReplayableResolveRoute,
	mockRuntimeConfig,
	selectStage2MenuOption,
} from "./helpers";

import { loadCanonicalStage1Inputs } from "./canonicalStage1";

import type { GenerateRequest, Stage1ConvertRequest, Stage1ConvertResponse, Stage2Row } from "../src/types/api";

const canonicalStage1Inputs = loadCanonicalStage1Inputs("dual-landing-chain-port-forward");

test("mock dual-landing port-forward keeps relay choices exclusive and replayable", async ({ page }) => {
	const [relayA, relayB] = canonicalStage1Inputs.forwardRelayItems;
	if (!relayA || !relayB) {
		throw new Error("dual-landing canonical scenario must provide two forward relay items");
	}

	const longURL = "http://127.0.0.1:11200/sub?data=port-forward-happy";
	const shortURL = "http://127.0.0.1:11200/sub/port-forward-happy";
	const stage2Init: Stage1ConvertResponse["stage2Init"] = {
		availableModes: ["none", "chain", "port_forward"],
		chainTargets: [],
		forwardRelays: [{ name: relayA }, { name: relayB }],
		rows: [
			{
				rowId: "Alpha-Reality-HK-PortForward",
				sourceLandingNodeName: "Alpha-Reality-HK-PortForward",
				proxyName: "Alpha-Reality-HK-PortForward",
				landingNodeType: "vless",
				server: "hk.example.com",
				mode: "none",
				targetName: null,
			},
			{
				rowId: "Beta-Reality-JP-PortForward",
				sourceLandingNodeName: "Beta-Reality-JP-PortForward",
				proxyName: "Beta-Reality-JP-PortForward",
				landingNodeType: "vless",
				server: "jp.example.com",
				mode: "none",
				targetName: null,
			},
		],
	};

	const stage1Requests: Stage1ConvertRequest[] = [];
	const generateRequests: GenerateRequest[] = [];
	const shortLinkRequests: string[] = [];
	const resolveRequests: string[] = [];

	await applyDefaultUiPreferences(page);
	await mockRuntimeConfig(page);

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

	await mockReplayableResolveRoute({
		page,
		generateRequests,
		resolveRequests,
		longURL,
		shortURL,
	});

	await page.goto("/");

	await expect(page.getByRole("heading", { name: "链式代理 · 订阅转换" })).toBeVisible();
	await page.getByLabel("落地信息").fill(canonicalStage1Inputs.landingInput);
	await page.getByLabel("中转信息").fill(canonicalStage1Inputs.transitInput);

	const addRelayButton = page.getByRole("button", { name: "+ 添加 端口转发" });
	await expect(addRelayButton).toBeVisible();
	await addRelayButton.click();

	const dialog = page.getByRole("dialog", { name: "添加端口转发服务" });
	const forwardInput = dialog.getByPlaceholder("输入 server:port ，按 Enter 添加多个");
	await forwardInput.fill(relayA);
	await forwardInput.press("Enter");
	await forwardInput.fill(relayB);
	await forwardInput.press("Enter");
	await dialog.getByRole("button", { name: "确认" }).click();

	const relayTagList = page.locator('ul[aria-label="端口转发标签"]');
	await expect(relayTagList.getByText(relayA, { exact: true })).toBeVisible();
	await expect(relayTagList.getByText(relayB, { exact: true })).toBeVisible();

	await page.getByRole("button", { name: "转换并自动填充" }).click();

	const rowA = locateStage2Row(page, "Alpha-Reality-HK-PortForward");
	const rowB = locateStage2Row(page, "Beta-Reality-JP-PortForward");

	await selectStage2MenuOption(page, rowA, 0, "端口转发");
	const rowAModeTrigger = rowA.locator(".a-target-menu__trigger").nth(0);
	const rowATargetTrigger = rowA.locator(".a-target-menu__trigger").nth(1);
	await expect(rowATargetTrigger).toContainText("请选择");
	await selectStage2MenuOption(page, rowA, 1, relayA);

	await selectStage2MenuOption(page, rowB, 0, "端口转发");
	const rowBTargetTrigger = rowB.locator(".a-target-menu__trigger").nth(1);
	await rowBTargetTrigger.click();
	await expect(rowBTargetTrigger).toHaveAttribute("aria-expanded", "true");
	const rowBTargetPanel = page.locator(".a-target-menu__panel--anchored").last();
	await expect(rowBTargetPanel.locator(".a-target-menu__item", { hasText: relayA })).toBeDisabled();
	await expect(rowBTargetPanel.locator(".a-target-menu__item", { hasText: relayB })).toBeEnabled();
	await rowBTargetPanel.locator(".a-target-menu__item", { hasText: relayB }).evaluate((element) => {
		(element as HTMLButtonElement).click();
	});

	await page.getByRole("button", { name: "生成链接" }).click();

	const currentLink = page.getByLabel("当前链接");
	await expect(currentLink).toHaveValue(longURL);
	await page.locator("label").filter({ hasText: /^短链接$/ }).click();
	await expect(currentLink).toHaveValue(shortURL);

	await page.getByRole("button", { name: "反向解析" }).click();
	await expect(relayTagList.getByText(relayA, { exact: true })).toBeVisible();
	await expect(relayTagList.getByText(relayB, { exact: true })).toBeVisible();
	await expect(rowAModeTrigger).toContainText("端口转发");
	await expect(rowATargetTrigger).toContainText(relayA);
	await expect(rowB.locator(".a-target-menu__trigger").nth(0)).toContainText("端口转发");
	await expect(rowBTargetTrigger).toContainText(relayB);
	await expect(currentLink).toHaveValue(shortURL);

	const expectedRows: Stage2Row[] = [
		{
			rowId: "Alpha-Reality-HK-PortForward",
			sourceLandingNodeName: "Alpha-Reality-HK-PortForward",
			proxyName: "Alpha-Reality-HK-PortForward",
			mode: "port_forward",
			targetName: relayA,
		},
		{
			rowId: "Beta-Reality-JP-PortForward",
			sourceLandingNodeName: "Beta-Reality-JP-PortForward",
			proxyName: "Beta-Reality-JP-PortForward",
			mode: "port_forward",
			targetName: relayB,
		},
	];

	const firstStage1Request = stage1Requests.at(0);
	if (firstStage1Request === undefined) {
		throw new Error("stage1 convert request was not captured");
	}

	expect(firstStage1Request.stage1Input.forwardRelayItems).toEqual([relayA, relayB]);
	expect(firstStage1Request.stage1Input.advancedOptions).not.toHaveProperty("enablePortForward");
	expect(generateRequests).toHaveLength(1);
	expect(shortLinkRequests).toEqual([longURL]);
	expect(generateRequests[0]?.stage2Snapshot.rows).toEqual(expectedRows);
	expect(resolveRequests).toEqual([shortURL]);
});

test("mock dual-landing port-forward modal keeps draft relay tags", async ({ page }) => {
	const [relayA] = canonicalStage1Inputs.forwardRelayItems;
	if (!relayA) {
		throw new Error("dual-landing canonical scenario must provide at least one forward relay item");
	}

	await applyDefaultUiPreferences(page);
	await mockRuntimeConfig(page);

	await page.goto("/");

	const addRelayButton = page.getByRole("button", { name: "+ 添加 端口转发" });
	await addRelayButton.click();

	const dialog = page.getByRole("dialog", { name: "添加端口转发服务" });
	const forwardInput = dialog.getByPlaceholder("输入 server:port ，按 Enter 添加多个");
	await expect(forwardInput).toBeFocused();
	await forwardInput.fill(relayA);
	await forwardInput.press("Enter");

	await page.locator(".a-modal-backdrop").click({ position: { x: 4, y: 4 } });
	await expect(dialog).toBeHidden();

	await addRelayButton.click();
	const reopenedDialog = page.getByRole("dialog", { name: "添加端口转发服务" });
	const reopenedForwardInput = reopenedDialog.getByPlaceholder("输入 server:port ，按 Enter 添加多个");
	await expect(reopenedForwardInput).toBeFocused();
	await expect(reopenedDialog.getByText(relayA, { exact: true })).toBeVisible();

	await reopenedDialog.getByRole("button", { name: "确认" }).click();
	const relayTagList = page.locator('ul[aria-label="端口转发标签"]');
	await expect(relayTagList.getByText(relayA, { exact: true })).toBeVisible();
});