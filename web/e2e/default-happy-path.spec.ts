import { expect, test, type Page } from "@playwright/test";

import type { GenerateRequest, Stage1ConvertRequest, Stage1ConvertResponse } from "../src/types/api";

function getStage2Row(page: Page, landingNodeName: string) {
	return page.locator(".a-table tbody tr", {
		has: page.locator(`.a-stage2-row-name-input[value="${landingNodeName}"]`),
	});
}

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
				messages: [
					{ level: "info", code: "GENERATE_METADATA_READY", message: "已生成完整长链接。" },
				],
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
				messages: [
					{ level: "info", code: "SHORT_LINK_CREATED", message: "已准备好短链接。" },
				],
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
				messages: [
					{ level: "info", code: "RESTORE_METADATA_READY", message: "已读取恢复快照。" },
				],
				blockingErrors: [],
			},
		});
	});

	await page.goto("/");

	await expect(page.getByRole("heading", { name: "链式代理 · 订阅转换" })).toBeVisible();

	await page.getByLabel("落地信息").fill(landingInput);
	await page.getByLabel("中转信息").fill(transitInput);
	await page.getByRole("button", { name: "转换并自动填充" }).click();

	// 节点名现在主要渲染为 textbox 的 value（而不是纯文本节点）
	await expect(page.getByRole("textbox", { name: "节点名" }).first()).toHaveValue("landing-happy");

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
	await expect(logPanel.getByText("已生成完整长链接。", { exact: true })).toBeVisible();
	await expect(logPanel.getByText("已准备好短链接。", { exact: true })).toBeVisible();
	await expect(logPanel.getByText("已读取恢复快照。", { exact: true })).toBeVisible();

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

test("default UI conflicted Short ID restore keeps Stage 2 snapshot visible but readonly", async ({ page }) => {
	const shortId = "Ib2t8wwr3OZ";
	const shortURL = "http://127.0.0.1:11200/sub/conflicted-short";
	const longURL = "http://127.0.0.1:11200/sub?data=conflicted-short";
	const landingInput = "ss://restored-landing";
	const transitInput = "https://example.com/restored-transit.txt";
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

	await page.route("**/api/resolve-url", async (route) => {
		const request = route.request().postDataJSON() as { url: string };
		resolveRequests.push(request.url);
		await route.fulfill({
			json: {
				longUrl: longURL,
				shortUrl: shortURL,
				restoreStatus: "conflicted",
				stage1Input: {
					landingRawText: landingInput,
					transitRawText: transitInput,
					forwardRelayItems: [],
					advancedOptions: {
						emoji: true,
						udp: true,
						skipCertVerify: null,
						config: null,
						include: null,
						exclude: null,
					},
				},
				stage2Snapshot: {
					rows: [
						{
							landingNodeName: "HK 01",
							mode: "chain",
							targetName: "HK Relay Group",
						},
					],
				},
				messages: [
					{ level: "warning", code: "RESTORE_CONFLICT", message: "restore conflict: target not found" },
				],
				blockingErrors: [],
			},
		});
	});

	await page.goto("/");

	const currentLink = page.getByLabel("当前链接");
	await currentLink.fill(shortId);
	await page.getByRole("button", { name: "反向解析" }).click();

	await expect(page.getByText("当前恢复快照引用的目标已失效，恢复结果仅供查看。请回到阶段 1 重新执行「转换并自动填充」后再继续。", { exact: true })).toBeVisible();
	await expect(page.getByLabel("落地信息")).toHaveValue(landingInput);
	await expect(page.getByLabel("中转信息")).toHaveValue(transitInput);
	await expect(currentLink).toHaveValue(shortURL);

	const row = getStage2Row(page, "HK 01");
	await expect(row.locator("select").first()).toHaveValue("chain");
	await expect(row.locator(".a-target-menu__trigger")).toContainText("HK Relay Group");
	await expect(page.getByRole("button", { name: "生成链接" })).toBeDisabled();

	expect(resolveRequests).toEqual([shortId]);
});