import { expect, type Locator, type Page, type Response } from "@playwright/test";

import type {
	GenerateRequest,
	Message,
	Stage2Catalog,
	Stage2Bundle,
	Stage2FlatInstance,
	Stage2Snapshot,
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

export interface WireSnapshotInstance {
	proxyName: string;
	mode: Stage2FlatInstance["mode"];
	targetName: string | null;
	sourceId: string;
	serverKey: string;
}

export function flattenWireSnapshotInstances(snapshot: Stage2Snapshot): WireSnapshotInstance[] {
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

export function semanticWireSnapshotKey(snapshot: Stage2Snapshot) {
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
