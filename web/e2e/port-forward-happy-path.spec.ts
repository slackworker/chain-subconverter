import { expect, test, type Page } from "@playwright/test";

import { loadCanonicalStage1Inputs } from "./canonicalStage1";

import type { GenerateRequest, Stage1ConvertRequest, Stage1ConvertResponse, Stage2Row } from "../src/types/api";

const canonicalStage1Inputs = loadCanonicalStage1Inputs("dual-landing-chain-port-forward");

function getStage2Row(page: Page, landingNodeName: string) {
	return page.locator(".a-table tbody tr").filter({ hasText: landingNodeName });
}

test("default UI port-forward mocked happy path keeps relay choices exclusive and replayable", async ({ page }) => {
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
				landingNodeName: "Alpha-Reality-HK-PortForward",
				landingNodeType: "vless",
				mode: "none",
				targetName: null,
			},
			{
				landingNodeName: "Beta-Reality-JP-PortForward",
				landingNodeType: "vless",
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
	await page.getByLabel("落地信息").fill(canonicalStage1Inputs.landingInput);
	await page.getByLabel("中转信息").fill(canonicalStage1Inputs.transitInput);

	await page.getByRole("button", { name: "高级选项" }).click();
	await page.getByRole("checkbox", { name: "启用端口转发" }).setChecked(true, { force: true });

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

	const rowA = getStage2Row(page, "Alpha-Reality-HK-PortForward");
	const rowB = getStage2Row(page, "Beta-Reality-JP-PortForward");

	await rowA.locator("select").first().selectOption("port_forward");
	const rowATargetSelect = rowA.locator("select").nth(1);
	await expect(rowATargetSelect).toHaveValue("");
	await rowATargetSelect.selectOption(relayA);

	await rowB.locator("select").first().selectOption("port_forward");
	const rowBTargetSelect = rowB.locator("select").nth(1);
	await expect(rowBTargetSelect.locator(`option[value="${relayA}"]`)).toHaveJSProperty("disabled", true);
	await expect(rowBTargetSelect.locator(`option[value="${relayB}"]`)).toHaveJSProperty("disabled", false);
	await rowBTargetSelect.selectOption(relayB);

	await page.getByRole("button", { name: "生成链接" }).click();

	const currentLink = page.getByLabel("当前链接");
	await expect(currentLink).toHaveValue(longURL);
	await page.locator("label").filter({ hasText: /^短链接$/ }).click();
	await expect(currentLink).toHaveValue(shortURL);

	await page.getByRole("button", { name: "反向解析" }).click();
	await expect(page.getByRole("checkbox", { name: "启用端口转发" })).toBeChecked();
	await expect(relayTagList.getByText(relayA, { exact: true })).toBeVisible();
	await expect(relayTagList.getByText(relayB, { exact: true })).toBeVisible();
	await expect(rowA.locator("select").first()).toHaveValue("port_forward");
	await expect(rowA.locator("select").nth(1)).toHaveValue(relayA);
	await expect(rowB.locator("select").first()).toHaveValue("port_forward");
	await expect(rowB.locator("select").nth(1)).toHaveValue(relayB);
	await expect(currentLink).toHaveValue(shortURL);

	const expectedRows: Stage2Row[] = [
		{
			landingNodeName: "Alpha-Reality-HK-PortForward",
			mode: "port_forward",
			targetName: relayA,
		},
		{
			landingNodeName: "Beta-Reality-JP-PortForward",
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