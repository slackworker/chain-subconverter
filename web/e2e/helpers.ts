import { expect, type Locator, type Page, type Response } from "@playwright/test";

import type {
	GenerateRequest,
	Message,
	ResolveURLResponse,
	Stage2Catalog,
	Stage2Bundle,
	Stage2FlatInstance,
	Stage2Mode,
	Stage2Snapshot,
	Stage2SnapshotWire,
} from "../src/types/api";
import { defaultSnapshotFromCatalog, flattenInstances } from "../src/lib/stage2";

export function buildDefaultStage2Bundle(catalog: Stage2Catalog): Stage2Bundle {
	return {
		catalog,
		snapshot: defaultSnapshotFromCatalog(catalog),
	};
}

export function flattenStage2Instances(snapshot: Stage2Snapshot): Stage2FlatInstance[] {
	return flattenInstances(snapshot);
}

export function locateStage2Row(page: Page, proxyName: string) {
	return page.locator(".a-table tbody tr", {
		has: page.locator(`.a-stage2-row-name-input[value="${proxyName}"]`),
	});
}

export async function selectStage2MenuOption(
	page: Page,
	row: Locator,
	triggerIndex: number,
	optionText: string,
) {
	const trigger = row.locator(".a-target-menu__trigger").nth(triggerIndex);
	await trigger.click();
	await expect(trigger).toHaveAttribute("aria-expanded", "true");
	const panel = page.locator(".a-target-menu__panel--anchored").last();
	const option = panel.locator(".a-target-menu__item").filter({ hasText: optionText });
	await expect(option).toHaveCount(1);
	await option.evaluate((element) => {
		(element as HTMLButtonElement).click();
	});
}

export async function expectHTTPResponseOK(response: Response, label: string) {
	if (response.ok()) {
		return;
	}
	throw new Error(`${label} failed with HTTP ${response.status()}: ${await response.text()}`);
}

export async function applyDefaultUiPreferences(page: Page) {
	await page.addInitScript(() => {
		window.localStorage.setItem("chain-subconverter-ui.locale", "zh");
		window.localStorage.setItem("chain-subconverter-ui.theme", "light");
	});
}

export async function mockRuntimeConfig(page: Page) {
	await page.route("**/api/runtime-config", async (route) => {
		await route.fulfill({
			json: {
				defaultTemplateURL: "https://example.com/default-template.ini",
				maxPublicLongURLLength: 8192,
			},
		});
	});
}

export async function addTagInField(page: Page, fieldLabel: string, tag: string) {
	const field = page.locator(".a-field").filter({ has: page.getByText(fieldLabel, { exact: true }) });
	const input = field.locator(".a-tag-field__input");
	await input.fill(tag);
	await input.press("Enter");
	await expect(field.locator(".a-tag-chip__text", { hasText: tag })).toBeVisible();
}

interface ReplayableResolveRouteOptions {
	page: Page;
	generateRequests: GenerateRequest[];
	resolveRequests: string[];
	longURL: string;
	shortURL: string;
	stage2Catalog: Stage2Catalog;
	messages?: Message[];
}

/** Raw resolve-url JSON 使用 Wire snapshot（无 client instanceId）。 */
export type ResolveURLWireResponse = Omit<ResolveURLResponse, "stage2"> & {
	stage2: {
		catalog: Stage2Catalog;
		snapshot: Stage2SnapshotWire;
	};
};

export interface WireSnapshotInstance {
	proxyName: string;
	mode: Stage2Mode;
	targetName: string | null;
	sourceId: string;
	serverKey: string;
}

export function flattenWireSnapshotInstances(snapshot: Stage2SnapshotWire): WireSnapshotInstance[] {
	return snapshot.servers.flatMap((server) =>
		server.sources.flatMap((source) =>
			source.instances.map((instance) => ({
				proxyName: instance.proxyName,
				mode: instance.mode,
				targetName: instance.targetName,
				sourceId: source.sourceId,
				serverKey: server.serverKey,
			})),
		),
	);
}

export function semanticWireSnapshotKey(snapshot: Stage2SnapshotWire) {
	const instances = flattenWireSnapshotInstances(snapshot);
	return JSON.stringify({
		instances: instances.map((instance) => ({
			proxyName: instance.proxyName,
			sourceId: instance.sourceId,
			serverKey: instance.serverKey,
			mode: instance.mode,
			targetName: instance.targetName,
		})),
		groups: snapshot.servers.map((server) => ({
			serverKey: server.serverKey,
			enabled: server.aggregation.enabled,
			strategy: server.aggregation.strategy,
			memberProxyNames: server.aggregation.enabled
				? server.aggregation.memberProxyNames ?? []
				: [],
		})),
		chainProxyTargetGroupSwitchOptimizationEnabled: snapshot.chainProxyTargetGroupSwitchOptimizationEnabled,
	});
}

export function assertWireSnapshotHasNoClientIds(payload: unknown) {
	expect(JSON.stringify(payload)).not.toMatch(/instanceId|memberInstanceIds|memberLocalInstanceIds/);
}

export async function mockReplayableResolveRoute({
	page,
	generateRequests,
	resolveRequests,
	longURL,
	shortURL,
	stage2Catalog,
	messages = [],
}: ReplayableResolveRouteOptions) {
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
				stage2: {
					catalog: stage2Catalog,
					snapshot: latestGenerateRequest.stage2.snapshot,
				},
				messages,
				blockingErrors: [],
			},
		});
	});
}

export async function addManualSocks5FromURI(page: Page, socks5URI: string) {
	await page.getByRole("button", { name: "+ 添加 SOCKS5" }).click();
	const dialog = page.getByRole("dialog", { name: "添加 / 转换 SOCKS5 节点" });
	const uriInput = dialog.locator(".a-field--socks-uri-divider input");
	await uriInput.fill(socks5URI);
	await uriInput.blur();
	await expect(dialog.getByLabel("名称", { exact: true })).not.toHaveValue("", { timeout: 5_000 });
	await dialog.getByRole("button", { name: "添加", exact: true }).click();
	await expect(dialog).toHaveCount(0);
}

export async function addForwardRelays(page: Page, relays: string[]) {
	await page.getByRole("button", { name: "+ 添加 端口转发" }).click();
	const dialog = page.getByRole("dialog", { name: "添加端口转发服务" });
	const relayInput = dialog.getByPlaceholder("输入 server:port ，按 Enter 添加多个");
	for (const relay of relays) {
		await relayInput.fill(relay);
		await relayInput.press("Enter");
	}
	await dialog.getByRole("button", { name: "确认" }).click();
	await expect(dialog).toHaveCount(0);
}

export async function cloneStage2Row(page: Page, proxyName: string) {
	const row = locateStage2Row(page, proxyName);
	await row.getByRole("button", { name: "复制" }).click();
}

export async function ensureChecked(locator: Locator, checked: boolean) {
	if ((await locator.isChecked()) === checked) {
		return;
	}
	// 点 label，确保 React controlled checkbox 走到 onChange（勿用 force setChecked 只改 DOM）
	const label = locator.locator("xpath=ancestor::label[1]");
	await label.click();
	await expect(locator).toBeChecked({ checked });
}

/** 规范化 wire/golden snapshot，便于对照 preview-inputs / stage2-snapshot 金样。 */
export function normalizeStage2SnapshotForGoldenCompare(snapshot: Stage2SnapshotWire) {
	return {
		chainProxyTargetGroupSwitchOptimizationEnabled: snapshot.chainProxyTargetGroupSwitchOptimizationEnabled === true,
		servers: snapshot.servers.map((server) => ({
			serverKey: server.serverKey,
			aggregation: server.aggregation.enabled
				? {
					enabled: true as const,
					strategy: server.aggregation.strategy ?? "fallback",
					memberProxyNames: [...(server.aggregation.memberProxyNames ?? [])],
				}
				: { enabled: false as const },
			sources: server.sources.map((source) => ({
				sourceId: source.sourceId,
				instances: source.instances.map((instance) => ({
					proxyName: instance.proxyName,
					mode: instance.mode,
					targetName: instance.targetName ?? null,
				})),
			})),
		})),
	};
}

export async function expectAggregationFallbackOrder(page: Page, desiredDisplayNames: string[]) {
	const orderButton = page.getByRole("row", { name: /198\.51\.100\.10/ }).getByRole("button", { name: "顺序管理" });
	await expect(orderButton).toBeEnabled({ timeout: 15_000 });
	await orderButton.click();
	const panel = page.locator(".a-target-menu__panel--member-order").last();
	await expect(panel).toBeVisible();
	const names = (await panel.locator(".a-member-order__name").allTextContents()).map((name) => name.trim());
	expect(names).toEqual(desiredDisplayNames);
	await orderButton.click();
}
