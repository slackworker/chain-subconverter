import { expect, type Locator, type Page, type Response } from "@playwright/test";

import type { GenerateRequest, Message } from "../src/types/api";

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
	messages?: Message[];
}

export async function mockReplayableResolveRoute({
	page,
	generateRequests,
	resolveRequests,
	longURL,
	shortURL,
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
				stage2Snapshot: latestGenerateRequest.stage2Snapshot,
				messages,
				blockingErrors: [],
			},
		});
	});
}
