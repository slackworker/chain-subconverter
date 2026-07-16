import { existsSync, readFileSync } from "node:fs";

import { expect, test } from "@playwright/test";

import {
	addForwardRelays,
	addManualSocks5FromURI,
	applyDefaultUiPreferences,
	assertWireSnapshotHasNoClientIds,
	expectHTTPResponseOK,
	flattenWireSnapshotInstances,
	type ResolveURLWireResponse,
} from "./helpers";
import { inputFromEnv, loadPreviewManualStage1Inputs } from "./previewInputs";

import type { ShortLinkResponse } from "../src/types/api";

/**
 * 对已部署实例做真实 API/UI 冒烟（不 mock），覆盖 healthz、UI convert/generate、
 * short-link 与 resolve round-trip。默认 Stage1 输入与 docs/testing/preview-inputs.md 一致。
 *
 *   CHAIN_SUBCONVERTER_E2E_BASE_URL=https://chain-subconverter.example.com \
 *   CHAIN_SUBCONVERTER_E2E_SKIP_WEB_SERVER=1 \
 *   npm run test:e2e:real:smoke
 *
 * 可选覆盖（仅本 smoke；real-full 禁止覆盖）：
 *   CHAIN_SUBCONVERTER_E2E_LANDING_INPUT[,_2,_3...]  （设置后跳过默认 SOCKS5 添加）
 *   CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT[,_2,_3...]
 */
const previewStage1 = loadPreviewManualStage1Inputs();
const devUpRuntimeFile = new URL("../../.tmp/dev-up/runtime.env", import.meta.url);

function isLoopbackHostname(hostname: string) {
	return hostname === "localhost" || hostname === "127.0.0.1";
}

function isEquivalentLocalOrigin(left: string, right: string) {
	const leftURL = new URL(left);
	const rightURL = new URL(right);
	return leftURL.protocol === rightURL.protocol
		&& leftURL.port === rightURL.port
		&& (
			leftURL.hostname === rightURL.hostname
			|| (isLoopbackHostname(leftURL.hostname) && isLoopbackHostname(rightURL.hostname))
		);
}

function backendOriginFromDevUpRuntime(uiOrigin: string) {
	if (!existsSync(devUpRuntimeFile)) {
		return null;
	}
	const values = new Map<string, string>();
	for (const line of readFileSync(devUpRuntimeFile, "utf8").split(/\r?\n/)) {
		const separatorIndex = line.indexOf("=");
		if (separatorIndex <= 0) {
			continue;
		}
		values.set(line.slice(0, separatorIndex), line.slice(separatorIndex + 1));
	}
	const frontendURL = values.get("FRONTEND_URL")?.trim();
	const backendURL = values.get("BACKEND_URL")?.trim();
	if (!frontendURL || !backendURL) {
		return null;
	}
	if (!isEquivalentLocalOrigin(frontendURL, uiOrigin)) {
		return null;
	}
	return new URL(backendURL).origin;
}

function resolveBackendOrigin(baseURL: string) {
	const explicitBackendBaseURL = process.env.CHAIN_SUBCONVERTER_E2E_BACKEND_BASE_URL?.trim();
	if (explicitBackendBaseURL) {
		return new URL(explicitBackendBaseURL).origin;
	}
	const uiOrigin = new URL(baseURL).origin;
	return backendOriginFromDevUpRuntime(uiOrigin) ?? uiOrigin;
}

test.describe.configure({ mode: "serial" });

test("real deployed core flow validates healthz and stage3 round-trip", async ({ page, baseURL }) => {
	test.setTimeout(120_000);

	const origin = baseURL?.trim();
	if (!origin) {
		throw new Error("deployed smoke requires Playwright baseURL / CHAIN_SUBCONVERTER_E2E_BASE_URL");
	}
	const expectedOrigin = resolveBackendOrigin(origin);
	const landingOverride = process.env.CHAIN_SUBCONVERTER_E2E_LANDING_INPUT?.trim();
	const landingInput = inputFromEnv("CHAIN_SUBCONVERTER_E2E_LANDING_INPUT", previewStage1.landingInput);
	const transitInput = inputFromEnv("CHAIN_SUBCONVERTER_E2E_TRANSIT_INPUT", previewStage1.transitInput);
	const [relayA, relayB] = previewStage1.forwardRelayItems;
	if (!relayA || !relayB) {
		throw new Error("preview manual path requires two forward relay items");
	}

	const health = await page.request.get(`${expectedOrigin}/healthz`);
	expect(health.ok()).toBeTruthy();
	expect((await health.text()).trim()).toBe("ok");

	await applyDefaultUiPreferences(page);

	await Promise.all([
		page.waitForResponse(
			(resp) => resp.url().includes("/api/runtime-config") && resp.ok(),
		),
		page.goto("/"),
	]);

	await expect(page.getByRole("heading", { name: "链式代理 · 订阅转换" })).toBeVisible({
		timeout: 15_000,
	});

	await page.getByLabel("落地信息").fill(landingInput);
	if (!landingOverride) {
		await addManualSocks5FromURI(page, previewStage1.socks5URI);
		await expect(page.getByLabel("落地信息")).toContainText(previewStage1.expectedSocksGeneratedURI);
	}
	await page.getByLabel("中转信息").fill(transitInput);
	await addForwardRelays(page, [relayA, relayB]);

	const stage1ConvertResponsePromise = page.waitForResponse(
		(resp) => resp.url().includes("/api/stage1/convert"),
	);
	await page.getByRole("button", { name: "转换并自动填充" }).click();
	await expectHTTPResponseOK(await stage1ConvertResponsePromise, "stage1 convert");

	const generateButton = page.getByRole("button", { name: "生成链接" });
	await expect(generateButton).toBeEnabled({ timeout: 60_000 });
	const generateResponsePromise = page.waitForResponse(
		(resp) => resp.url().includes("/api/generate"),
	);
	await generateButton.click();
	const generateResponse = await generateResponsePromise;
	await expectHTTPResponseOK(generateResponse, "generate");
	assertWireSnapshotHasNoClientIds(generateResponse.request().postDataJSON());

	const currentLink = page.getByLabel("当前链接");
	await expect(currentLink).not.toHaveValue("", { timeout: 30_000 });
	const generatedURL = new URL(await currentLink.inputValue());
	expect(generatedURL.origin).toBe(expectedOrigin);
	expect(generatedURL.pathname === "/sub" || generatedURL.pathname.startsWith("/sub/")).toBeTruthy();

	const generatedSubResponse = await page.request.get(generatedURL.toString());
	expect(generatedSubResponse.ok()).toBeTruthy();
	const generatedBody = await generatedSubResponse.text();
	expect(generatedBody).toContain("proxies:");

	const expectedLandingRawText = landingOverride
		? landingInput
		: `${previewStage1.landingInput}\n${previewStage1.expectedSocksGeneratedURI}`;

	const generatedResolveResponse = await page.request.post(new URL("/api/resolve-url", origin).toString(), {
		data: { url: generatedURL.toString() },
	});
	expect(generatedResolveResponse.ok()).toBeTruthy();
	const generatedResolvePayload = (await generatedResolveResponse.json()) as ResolveURLWireResponse;
	expect(generatedResolvePayload.restoreStatus).toBe("replayable");
	expect(generatedResolvePayload.stage1Input.landingRawText).toBe(expectedLandingRawText);
	expect(generatedResolvePayload.stage1Input.transitRawText).toBe(transitInput);
	expect(flattenWireSnapshotInstances(generatedResolvePayload.stage2.snapshot).length).toBeGreaterThan(0);
	if (generatedURL.pathname.startsWith("/sub/")) {
		expect(generatedResolvePayload.shortUrl).toBe(generatedURL.toString());
	} else {
		expect(generatedResolvePayload.shortUrl).toBeUndefined();
	}

	const canonicalLongURL = new URL(generatedResolvePayload.longUrl);
	expect(canonicalLongURL.origin).toBe(expectedOrigin);
	expect(canonicalLongURL.pathname).toBe("/sub");
	expect(canonicalLongURL.searchParams.has("data")).toBeTruthy();

	const shortLinkResponse = await page.request.post(new URL("/api/short-links", origin).toString(), {
		data: { longUrl: canonicalLongURL.toString() },
	});
	expect(shortLinkResponse.ok()).toBeTruthy();
	const shortLinkPayload = (await shortLinkResponse.json()) as ShortLinkResponse;
	expect(shortLinkPayload.longUrl).toBe(canonicalLongURL.toString());
	const shortURL = new URL(shortLinkPayload.shortUrl);
	expect(shortURL.origin).toBe(expectedOrigin);
	expect(/^\/sub\/[0-9A-Za-z]+$/.test(shortURL.pathname)).toBeTruthy();
	expect(shortURL.search).toBe("");
	if (generatedResolvePayload.shortUrl) {
		expect(shortLinkPayload.shortUrl).toBe(generatedResolvePayload.shortUrl);
	}

	const shortSubResponse = await page.request.get(shortLinkPayload.shortUrl);
	expect(shortSubResponse.ok()).toBeTruthy();
	const shortBody = await shortSubResponse.text();
	expect(shortBody).toContain("proxies:");

	const shortResolveResponse = await page.request.post(new URL("/api/resolve-url", origin).toString(), {
		data: { url: shortLinkPayload.shortUrl },
	});
	expect(shortResolveResponse.ok()).toBeTruthy();
	const shortResolvePayload = (await shortResolveResponse.json()) as ResolveURLWireResponse;
	expect(shortResolvePayload.longUrl).toBe(canonicalLongURL.toString());
	expect(shortResolvePayload.shortUrl).toBe(shortLinkPayload.shortUrl);
	expect(shortResolvePayload.restoreStatus).toBe("replayable");
	expect(shortResolvePayload.stage1Input.landingRawText).toBe(expectedLandingRawText);
	expect(shortResolvePayload.stage1Input.transitRawText).toBe(transitInput);
	expect(flattenWireSnapshotInstances(shortResolvePayload.stage2.snapshot).length).toBeGreaterThan(0);
});
