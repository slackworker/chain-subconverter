import { expect, test } from "@playwright/test";

import { loadCanonicalStage1Inputs } from "./canonicalStage1";
import {
	applyDefaultUiPreferences,
	assertWireSnapshotHasNoClientIds,
	buildDefaultStage2Bundle,
	flattenWireSnapshotInstances,
	locateStage2Row,
	mockRuntimeConfig,
	semanticWireSnapshotKey,
	selectStage2MenuOption,
} from "./helpers";

import type { GenerateRequest, Stage1ConvertRequest } from "../src/types/api";

const canonicalStage1Inputs = loadCanonicalStage1Inputs("dual-landing-chain-port-forward");

test("delete and recopy replica row preserves semantic generate payload", async ({ page }) => {
	const [relayA, relayB] = canonicalStage1Inputs.forwardRelayItems;
	if (!relayA || !relayB) {
		throw new Error("dual-landing canonical scenario must provide two forward relay items");
	}

	const stage2 = buildDefaultStage2Bundle({
		availableModes: ["none", "chain", "port_forward"],
		chainTargets: [{ name: "HK Relay Group", kind: "proxy-groups" }],
		forwardRelays: [{ name: relayA }, { name: relayB }],
		servers: [
			{
				serverKey: "hk.example.com",
				sources: [{
					sourceId: "Alpha-Reality-HK-PortForward",
					landingNodeType: "vless",
					defaultProxyName: "Alpha-Reality-HK-PortForward",
					defaultMode: "none",
					defaultTargetName: null,
				}],
			},
			{
				serverKey: "jp.example.com",
				sources: [{
					sourceId: "Beta-Reality-JP-PortForward",
					landingNodeType: "vless",
					defaultProxyName: "Beta-Reality-JP-PortForward",
					defaultMode: "none",
					defaultTargetName: null,
				}],
			},
		],
	});

	const stage1Requests: Stage1ConvertRequest[] = [];
	const generateRequests: GenerateRequest[] = [];

	await applyDefaultUiPreferences(page);
	await mockRuntimeConfig(page);

	await page.route("**/api/stage1/convert", async (route) => {
		const request = route.request().postDataJSON() as Stage1ConvertRequest;
		stage1Requests.push(request);
		await route.fulfill({
			json: {
				stage2,
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
				longUrl: `http://127.0.0.1:11200/sub?data=delete-recopy-${generateRequests.length}`,
				messages: [],
				blockingErrors: [],
			},
		});
	});

	await page.goto("/");
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
	await page.getByRole("button", { name: "转换并自动填充" }).click();

	const sourceRow = locateStage2Row(page, "Alpha-Reality-HK-PortForward");
	await sourceRow.getByRole("button", { name: "复制" }).click();
	const replicaLandingNodeName = "Alpha-Reality-HK-PortForward 2";
	const replicaRow = locateStage2Row(page, replicaLandingNodeName);
	await expect(replicaRow).toBeVisible();

	const rowA = locateStage2Row(page, "Alpha-Reality-HK-PortForward");
	const rowB = locateStage2Row(page, "Beta-Reality-JP-PortForward");
	const rowReplica = locateStage2Row(page, replicaLandingNodeName);
	await selectStage2MenuOption(page, rowA, 0, "链式代理");
	await selectStage2MenuOption(page, rowA, 1, "HK Relay Group");
	await selectStage2MenuOption(page, rowB, 0, "端口转发");
	await selectStage2MenuOption(page, rowB, 1, relayB);
	await selectStage2MenuOption(page, rowReplica, 0, "端口转发");
	await selectStage2MenuOption(page, rowReplica, 1, relayA);

	await page.getByRole("button", { name: "生成链接", exact: true }).click();
	expect(generateRequests).toHaveLength(1);
	assertWireSnapshotHasNoClientIds(generateRequests[0]);
	const firstSemanticKey = semanticWireSnapshotKey(generateRequests[0]!.stage2.snapshot);

	await replicaRow.getByRole("button", { name: "删除" }).click();
	await expect(locateStage2Row(page, replicaLandingNodeName)).toHaveCount(0);

	await sourceRow.getByRole("button", { name: "复制" }).click();
	const recreatedReplicaRow = locateStage2Row(page, replicaLandingNodeName);
	await expect(recreatedReplicaRow).toBeVisible();
	await selectStage2MenuOption(page, recreatedReplicaRow, 0, "端口转发");
	await selectStage2MenuOption(page, recreatedReplicaRow, 1, relayA);

	await page.getByRole("button", { name: "生成链接", exact: true }).click();
	expect(generateRequests).toHaveLength(2);
	assertWireSnapshotHasNoClientIds(generateRequests[1]);
	const secondSemanticKey = semanticWireSnapshotKey(generateRequests[1]!.stage2.snapshot);

	expect(secondSemanticKey).toBe(firstSemanticKey);
	const replicaWireInstance = flattenWireSnapshotInstances(generateRequests[1]!.stage2.snapshot)
		.find((instance) => instance.proxyName === replicaLandingNodeName);
	expect(replicaWireInstance).toMatchObject({
		proxyName: replicaLandingNodeName,
		sourceId: "Alpha-Reality-HK-PortForward",
		mode: "port_forward",
		targetName: relayA,
	});
});
