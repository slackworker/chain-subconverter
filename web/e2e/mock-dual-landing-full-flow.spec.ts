import { expect, test } from "@playwright/test";

import { loadCanonicalStage1Inputs } from "./canonicalStage1";
import {
	addTagInField,
	applyDefaultUiPreferences,
	locateStage2Row,
	mockReplayableResolveRoute,
	mockRuntimeConfig,
	selectStage2MenuOption,
} from "./helpers";

import type { GenerateRequest, Stage1ConvertRequest, Stage1ConvertResponse } from "../src/types/api";

const canonicalStage1Inputs = loadCanonicalStage1Inputs("dual-landing-chain-port-forward");

test("mock dual-landing full flow covers stage1 stage2 orchestration and stage3 replay", async ({ page }) => {
	const [relayA, relayB] = canonicalStage1Inputs.forwardRelayItems;
	if (!relayA || !relayB) {
		throw new Error("dual-landing canonical scenario must provide two forward relay items");
	}

	const longURL = "http://127.0.0.1:11200/sub?data=dual-landing-full-flow";
	const shortURL = "http://127.0.0.1:11200/sub/dual-landing-full-flow";
	const stage2Init: Stage1ConvertResponse["stage2Init"] = {
		availableModes: ["none", "chain", "port_forward"],
		chainTargets: [{ name: "HK Relay Group", kind: "proxy-groups" }],
		forwardRelays: [{ name: relayA }, { name: relayB }],
		rows: [
			{
				rowId: "Alpha-Reality-HK-PortForward",
				sourceLandingNodeName: "Alpha-Reality-HK-PortForward",
				server: "hk.example.com",
				landingNodeName: "Alpha-Reality-HK-PortForward",
				landingNodeType: "vless",
				mode: "none",
				targetName: null,
			},
			{
				rowId: "Beta-Reality-JP-PortForward",
				sourceLandingNodeName: "Beta-Reality-JP-PortForward",
				server: "jp.example.com",
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

	await applyDefaultUiPreferences(page);
	await mockRuntimeConfig(page);

	await page.route("**/api/stage1/convert", async (route) => {
		const request = route.request().postDataJSON() as Stage1ConvertRequest;
		stage1Requests.push(request);
		await route.fulfill({
			json: {
				stage2Init,
				messages: [{ level: "info", code: "STAGE1_READY", message: "已准备双落地编排。" }],
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
				messages: [{ level: "info", code: "GENERATE_METADATA_READY", message: "已生成完整长链接。" }],
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
				messages: [{ level: "info", code: "SHORT_LINK_CREATED", message: "已准备好短链接。" }],
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
		messages: [{ level: "info", code: "RESTORE_METADATA_READY", message: "已读取恢复快照。" }],
	});

	await page.goto("/");
	await expect(page.getByRole("heading", { name: "链式代理 · 订阅转换" })).toBeVisible();

	await page.getByLabel("落地信息").fill(canonicalStage1Inputs.landingInput);
	await page.getByLabel("中转信息").fill(canonicalStage1Inputs.transitInput);

	const addRelayButton = page.getByRole("button", { name: "+ 添加 端口转发" });
	await addRelayButton.click();
	const dialog = page.getByRole("dialog", { name: "添加端口转发服务" });
	const relayInput = dialog.getByPlaceholder("输入 server:port ，按 Enter 添加多个");
	await relayInput.fill(relayA);
	await relayInput.press("Enter");
	await relayInput.fill(relayB);
	await relayInput.press("Enter");
	await dialog.getByRole("button", { name: "确认" }).click();

	await page.getByRole("button", { name: "高级选项" }).click();
	await addTagInField(page, "包含节点", "HK");
	await addTagInField(page, "排除节点", "JP");

	await page.getByRole("button", { name: "转换并自动填充" }).click();

	const sourceRow = locateStage2Row(page, "Alpha-Reality-HK-PortForward");
	await sourceRow.getByRole("button", { name: "复制" }).click();
	const replicaLandingNodeName = "Alpha-Reality-HK-PortForward 2";
	const replicaRow = locateStage2Row(page, replicaLandingNodeName);
	await expect(replicaRow).toBeVisible();
	const aggregationModeToggle = page.getByRole("checkbox", { name: "线路聚合模式" });
	if (!(await aggregationModeToggle.isChecked())) {
		await aggregationModeToggle.evaluate((checkbox) => {
			(checkbox as HTMLInputElement).click();
		});
	}
	const aggregationEnableToggles = page.getByRole("checkbox", { name: "聚合" });
	if ((await aggregationEnableToggles.count()) > 0) {
		await aggregationEnableToggles.first().evaluate((checkbox) => {
			(checkbox as HTMLInputElement).click();
		});
	}

	const rowA = locateStage2Row(page, "Alpha-Reality-HK-PortForward");
	const rowB = locateStage2Row(page, "Beta-Reality-JP-PortForward");
	const rowReplica = locateStage2Row(page, replicaLandingNodeName);
	await selectStage2MenuOption(page, rowA, 0, "链式代理");
	await selectStage2MenuOption(page, rowA, 1, "HK Relay Group");
	await selectStage2MenuOption(page, rowB, 0, "端口转发");
	await selectStage2MenuOption(page, rowB, 1, relayB);
	await selectStage2MenuOption(page, rowReplica, 0, "端口转发");
	await selectStage2MenuOption(page, rowReplica, 1, relayA);

	await page.getByRole("button", { name: "生成链接" }).click();
	const currentLink = page.getByLabel("当前链接");
	await expect(currentLink).toHaveValue(longURL);
	await page.locator("label").filter({ hasText: /^短链接$/ }).click();
	await expect(currentLink).toHaveValue(shortURL);

	await page.getByRole("button", { name: "反向解析" }).click();
	await expect(rowA.locator(".a-target-menu__trigger").nth(0)).toContainText("链式代理");
	await expect(rowA.locator(".a-target-menu__trigger").nth(1)).toContainText("HK Relay Group");
	await expect(rowB.locator(".a-target-menu__trigger").nth(0)).toContainText("端口转发");
	await expect(rowB.locator(".a-target-menu__trigger").nth(1)).toContainText(relayB);
	await expect(currentLink).toHaveValue(shortURL);

	const firstStage1Request = stage1Requests.at(0);
	if (firstStage1Request === undefined) {
		throw new Error("stage1 convert request was not captured");
	}
	expect(firstStage1Request.stage1Input.forwardRelayItems).toEqual([relayA, relayB]);
	expect(firstStage1Request.stage1Input.advancedOptions.include).toEqual(["HK"]);
	expect(firstStage1Request.stage1Input.advancedOptions.exclude).toEqual(["JP"]);
	expect(generateRequests).toHaveLength(1);
	const firstGenerateRequest = generateRequests[0];
	if (firstGenerateRequest === undefined) {
		throw new Error("generate request was not captured");
	}
	expect(firstGenerateRequest.stage2Snapshot.rows).toEqual(
		expect.arrayContaining([
			expect.objectContaining({
				landingNodeName: "Alpha-Reality-HK-PortForward",
				mode: "chain",
				targetName: "HK Relay Group",
			}),
			expect.objectContaining({
				landingNodeName: replicaLandingNodeName,
				mode: "port_forward",
				targetName: relayA,
			}),
			expect.objectContaining({
				landingNodeName: "Beta-Reality-JP-PortForward",
				mode: "port_forward",
				targetName: relayB,
			}),
		]),
	);
	const sourceSnapshotRow = firstGenerateRequest.stage2Snapshot.rows.find((row) => row.landingNodeName === "Alpha-Reality-HK-PortForward");
	const replicaSnapshotRow = firstGenerateRequest.stage2Snapshot.rows.find((row) => row.landingNodeName === replicaLandingNodeName);
	if (sourceSnapshotRow?.rowId === undefined || replicaSnapshotRow?.rowId === undefined) {
		throw new Error("source/replica row IDs are required for aggregation assertions");
	}
	expect(firstGenerateRequest.stage2Snapshot.serverAggregationGroups).toBeInstanceOf(Array);
	expect(sourceSnapshotRow.rowId).not.toBe(replicaSnapshotRow.rowId);
	expect(firstGenerateRequest.stage2Snapshot.rows.map((row) => row.landingNodeName)).toEqual([
		"Alpha-Reality-HK-PortForward",
		replicaLandingNodeName,
		"Beta-Reality-JP-PortForward",
	]);
	expect(replicaSnapshotRow.sourceLandingNodeName).toBe("Alpha-Reality-HK-PortForward");
	expect(shortLinkRequests).toEqual([longURL]);
	expect(resolveRequests).toEqual([shortURL]);
});
