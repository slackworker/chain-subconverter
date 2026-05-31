import { describe, expect, it } from "vitest";

import { initialAppState, initialStage1Input, type AppState } from "../lib/state";
import type { Stage2Init } from "../types/api";
import {
	applyGenerateLongURLSuccessState,
	applyGenerateShortURLFailureState,
	applyGenerateShortURLSuccessState,
	applyRestoreConflictState,
	applyRestoreReinitializedState,
	applyRestoreReinitFailedState,
	applyShortURLCreationFailureState,
	applyShortURLCreationSuccessState,
	applyShortURLPreferenceToggleState,
	applyStage1ConvertSuccessState,
	completeWorkflowRequestState,
	startShortURLCreationState,
	startWorkflowRequestState,
} from "./useAppWorkflow.state";

describe("useAppWorkflow.state", () => {
	it("starts a workflow request by clearing messages and blocking errors", () => {
		const current: AppState = {
			...initialAppState,
			stage3Expired: true,
			messages: [{ level: "info", code: "OLD_MESSAGE", message: "stale" }],
			blockingErrors: [{ code: "OLD_ERROR", message: "stale", scope: "global" as const }],
			workflowLog: [{
				id: "existing-entry",
				createdAt: "2026-05-31T00:00:00.000Z",
				level: "info" as const,
				code: "OLD_EVENT",
				message: "existing",
				source: "frontend" as const,
				originStage: null,
			}],
		};

		const next = startWorkflowRequestState(current, "stage2", {
			id: "action-entry",
			createdAt: "2026-05-31T00:00:01.000Z",
			level: "info",
			code: "ACTION_GENERATE",
			message: "generate",
			source: "frontend",
			originStage: "stage2",
			kind: "separator",
		}, { resetStage3Expired: true });

		expect(next.responseOriginStage).toBe("stage2");
		expect(next.messages).toEqual([]);
		expect(next.blockingErrors).toEqual([]);
		expect(next.stage3Expired).toBe(false);
		expect(next.workflowLog.map((entry) => entry.code)).toEqual(["OLD_EVENT", "ACTION_GENERATE"]);
	});

	it("applies Stage 1 convert success as a single state transition", () => {
		const current = {
			...initialAppState,
			stage1Input: {
				...initialStage1Input,
				landingRawText: "ss://landing-node",
				transitRawText: "https://example.com/transit.txt",
			},
			stage2Stale: true,
			workflowLog: [{
				id: "action-entry",
				createdAt: "2026-05-31T00:00:01.000Z",
				level: "info" as const,
				code: "ACTION_STAGE1_CONVERT",
				message: "convert",
				source: "frontend" as const,
				originStage: "stage1" as const,
				kind: "separator" as const,
			}],
		};
		const stage2Init: Stage2Init = {
			availableModes: ["none", "chain", "port_forward"],
			chainTargets: [],
			forwardRelays: [],
			rows: [{
				landingNodeName: "landing-hk",
				landingNodeType: "ss",
				mode: "none" as const,
				targetName: null,
			}],
		};

		const next = applyStage1ConvertSuccessState(
			current,
			stage2Init,
			[{ level: "info", code: "AUTO_CHAIN_TARGET_SELECTED", message: "selected" }],
			[],
			[{
				id: "message-entry",
				createdAt: "2026-05-31T00:00:02.000Z",
				level: "info",
				code: "AUTO_CHAIN_TARGET_SELECTED",
				message: "selected",
				source: "backend",
				originStage: "stage1",
			}],
		);

		expect(next.stage2Init).toEqual(stage2Init);
		expect(next.stage2Snapshot.rows).toEqual([{ landingNodeName: "landing-hk", mode: "none", targetName: null }]);
		expect(next.stage2Stale).toBe(false);
		expect(next.restoreStatus).toBe("idle");
		expect(next.responseOriginStage).toBe("stage1");
		expect(next.messages.map((message) => message.code)).toEqual(["AUTO_CHAIN_TARGET_SELECTED"]);
		expect(next.workflowLog.map((entry) => entry.code)).toEqual(["ACTION_STAGE1_CONVERT", "AUTO_CHAIN_TARGET_SELECTED"]);
	});

	it("completes a workflow request with patch data and logs", () => {
		const current = {
			...initialAppState,
			currentLinkInput: "old-link",
			workflowLog: [],
		};

		const next = completeWorkflowRequestState(
			current,
			"stage2",
			[{ level: "info", code: "GENERATE_METADATA_READY", message: "ready" }],
			[],
			[{
				id: "generate-entry",
				createdAt: "2026-05-31T00:00:03.000Z",
				level: "info",
				code: "GENERATE_METADATA_READY",
				message: "ready",
				source: "backend",
				originStage: "stage2",
			}],
			{ patch: { currentLinkInput: "new-link", stage3Expired: false } },
		);

		expect(next.responseOriginStage).toBe("stage2");
		expect(next.currentLinkInput).toBe("new-link");
		expect(next.stage3Expired).toBe(false);
		expect(next.messages.map((message) => message.code)).toEqual(["GENERATE_METADATA_READY"]);
		expect(next.workflowLog.map((entry) => entry.code)).toEqual(["GENERATE_METADATA_READY"]);
	});

	it("applies restore conflict state as readonly output recovery", () => {
		const restoredStage1Input = {
			...initialStage1Input,
			landingRawText: "ss://restored-landing",
			transitRawText: "https://example.com/restored-transit.txt",
		};

		const next = applyRestoreConflictState(initialAppState, {
			blockingErrors: [
				{ code: "ROW_ERROR", message: "row", scope: "stage2_row" },
				{ code: "GLOBAL_ERROR", message: "global", scope: "global" },
			],
			logEntries: [{
				id: "restore-entry",
				createdAt: "2026-05-31T00:00:04.000Z",
				level: "warning",
				code: "RESTORE_CONFLICT",
				message: "conflict",
				source: "backend",
				originStage: "stage3",
			}],
			messages: [{ level: "warning", code: "RESTORE_CONFLICT", message: "conflict" }],
			restoredStage1Input,
			restoreStatus: "conflicted",
			resolvedLongUrl: "https://public.example.com/sub?data=restore-conflicted",
			resolvedShortUrl: "https://public.example.com/s/conflicted-short",
			stage2Snapshot: { rows: [{ landingNodeName: "HK 01", mode: "chain", targetName: "HK Relay Group" }] },
		});

		expect(next.restoreStatus).toBe("conflicted");
		expect(next.stage2Init).toBeNull();
		expect(next.stage2Stale).toBe(false);
		expect(next.currentLinkInput).toBe("https://public.example.com/s/conflicted-short");
		expect(next.preferShortUrl).toBe(true);
		expect(next.blockingErrors.map((error) => error.code)).toEqual(["GLOBAL_ERROR"]);
	});

	it("applies restore reinitialized state with refreshed stage2 init", () => {
		const restoredStage1Input = {
			...initialStage1Input,
			landingRawText: "ss://restored-landing",
			transitRawText: "https://example.com/restored-transit.txt",
		};
		const stage2Init: Stage2Init = {
			availableModes: ["none", "chain", "port_forward"],
			chainTargets: [],
			forwardRelays: [],
			rows: [{
				landingNodeName: "landing-hk",
				landingNodeType: "ss",
				mode: "chain" as const,
				targetName: "HK Relay Group",
			}],
		};

		const next = applyRestoreReinitializedState(initialAppState, stage2Init, {
			blockingErrors: [],
			logEntries: [],
			messages: [{ level: "info", code: "RESTORE_METADATA_READY", message: "ready" }],
			restoredStage1Input,
			restoreStatus: "replayable",
			resolvedLongUrl: "https://public.example.com/sub?data=restored-long",
			resolvedShortUrl: "https://public.example.com/s/restored-short",
			stage2Snapshot: { rows: [{ landingNodeName: "landing-hk", mode: "chain", targetName: "HK Relay Group" }] },
		});

		expect(next.restoreStatus).toBe("replayable");
		expect(next.stage2Init).toEqual(stage2Init);
		expect(next.stage2Stale).toBe(false);
		expect(next.generatedUrls).toEqual({
			longUrl: "https://public.example.com/sub?data=restored-long",
			shortUrl: "https://public.example.com/s/restored-short",
		});
	});

	it("applies restore reinit failure state while keeping restored output", () => {
		const restoredStage1Input = {
			...initialStage1Input,
			landingRawText: "ss://restored-landing",
			transitRawText: "https://example.com/restored-transit.txt",
		};

		const next = applyRestoreReinitFailedState(initialAppState, {
			blockingErrors: [{ code: "SUBCONVERTER_UNAVAILABLE", message: "retry", scope: "global", retryable: true }],
			logEntries: [],
			messages: [{ level: "info", code: "RESTORE_METADATA_READY", message: "ready" }],
			restoredStage1Input,
			restoreStatus: "replayable",
			resolvedLongUrl: "https://public.example.com/sub?data=restore-only",
			stage2Snapshot: { rows: [{ landingNodeName: "landing-hk", mode: "chain", targetName: "HK Relay Group" }] },
		});

		expect(next.stage2Init).toBeNull();
		expect(next.stage2Stale).toBe(true);
		expect(next.generatedUrls).toEqual({
			longUrl: "https://public.example.com/sub?data=restore-only",
			shortUrl: null,
		});
	});

	it("keeps short URL preference locked when long URL exceeds the public budget", () => {
		const next = applyShortURLPreferenceToggleState({
			...initialAppState,
			preferShortUrl: true,
			currentLinkInput: "https://public.example.com/s/generated-short",
			generatedUrls: {
				longUrl: "https://public.example.com/sub?data=this-long-url-exceeds-the-public-budget",
				shortUrl: "https://public.example.com/s/generated-short",
			},
		}, false, {
			requireShortURL: true,
			requiredLogEntry: {
				id: "short-required-entry",
				createdAt: "2026-05-31T00:00:05.000Z",
				level: "warning",
				code: "SHORT_URL_REQUIRED",
				message: "required",
				source: "frontend",
				originStage: "stage3",
			},
		});

		expect(next.preferShortUrl).toBe(true);
		expect(next.currentLinkInput).toBe("https://public.example.com/s/generated-short");
		expect(next.workflowLog.map((entry) => entry.code)).toEqual(["SHORT_URL_REQUIRED"]);
	});

	it("starts on-demand short URL creation as a dedicated state transition", () => {
		const next = startShortURLCreationState({
			...initialAppState,
			preferShortUrl: false,
			messages: [{ level: "info", code: "OLD_MESSAGE", message: "stale" }],
			blockingErrors: [{ code: "OLD_ERROR", message: "stale", scope: "global" }],
		}, {
			id: "short-action-entry",
			createdAt: "2026-05-31T00:00:05.500Z",
			level: "info",
			code: "ACTION_SHORT_URL",
			message: "shorten",
			source: "frontend",
			originStage: "stage3",
			kind: "separator",
		});

		expect(next.preferShortUrl).toBe(true);
		expect(next.responseOriginStage).toBe("stage3");
		expect(next.messages).toEqual([]);
		expect(next.blockingErrors).toEqual([]);
		expect(next.workflowLog.map((entry) => entry.code)).toEqual(["ACTION_SHORT_URL"]);
	});

	it("applies generate long URL success without forcing short URL state", () => {
		const next = applyGenerateLongURLSuccessState(initialAppState, {
			blockingErrors: [],
			logEntries: [{
				id: "generate-long-entry",
				createdAt: "2026-05-31T00:00:05.750Z",
				level: "info",
				code: "GENERATE_METADATA_READY",
				message: "ready",
				source: "backend",
				originStage: "stage2",
			}],
			messages: [{ level: "info", code: "GENERATE_METADATA_READY", message: "ready" }],
			resolvedLongURL: "https://public.example.com/sub?data=generated-long-url",
		});

		expect(next.responseOriginStage).toBe("stage2");
		expect(next.generatedUrls).toEqual({
			longUrl: "https://public.example.com/sub?data=generated-long-url",
			shortUrl: null,
		});
		expect(next.currentLinkInput).toBe("https://public.example.com/sub?data=generated-long-url");
	});

	it("applies generate short URL success and preserves short URL preference", () => {
		const next = applyGenerateShortURLSuccessState({
			...initialAppState,
			preferShortUrl: false,
		}, {
			blockingErrors: [],
			logEntries: [{
				id: "generate-short-entry",
				createdAt: "2026-05-31T00:00:05.875Z",
				level: "warning",
				code: "SHORT_URL_REQUIRED",
				message: "required",
				source: "frontend",
				originStage: "stage2",
			}],
			messages: [{ level: "info", code: "SHORT_LINK_CREATED", message: "created" }],
			preferShortURL: true,
			resolvedLongURL: "https://public.example.com/sub?data=generated-long-url",
			resolvedShortURL: "https://public.example.com/s/generated-short",
		});

		expect(next.responseOriginStage).toBe("stage2");
		expect(next.preferShortUrl).toBe(true);
		expect(next.generatedUrls).toEqual({
			longUrl: "https://public.example.com/sub?data=generated-long-url",
			shortUrl: "https://public.example.com/s/generated-short",
		});
		expect(next.currentLinkInput).toBe("https://public.example.com/s/generated-short");
	});

	it("keeps existing stage3 input when forced short URL creation fails after generate", () => {
		const next = applyGenerateShortURLFailureState({
			...initialAppState,
			preferShortUrl: true,
			currentLinkInput: "https://public.example.com/s/previous-short",
			stage3Expired: true,
		}, {
			blockingErrors: [{ code: "RATE_LIMITED", message: "retry", scope: "stage3_action", retryable: true }],
			logEntries: [{
				id: "generate-short-failed-entry",
				createdAt: "2026-05-31T00:00:05.950Z",
				level: "warning",
				code: "SHORT_URL_REQUIRED_FAILED",
				message: "failed",
				source: "frontend",
				originStage: "stage3",
			}],
			messages: [{ level: "warning", code: "SHORT_LINK_RETRYABLE", message: "retry" }],
			requireShortURL: true,
			resolvedLongURL: "https://public.example.com/sub?data=generated-long-url",
		});

		expect(next.preferShortUrl).toBe(true);
		expect(next.generatedUrls).toBeNull();
		expect(next.currentLinkInput).toBe("https://public.example.com/s/previous-short");
		expect(next.stage3Expired).toBe(true);
	});

	it("applies on-demand short URL success state", () => {
		const next = applyShortURLCreationSuccessState({
			...initialAppState,
			preferShortUrl: true,
			generatedUrls: {
				longUrl: "https://public.example.com/sub?data=generated-long-url",
				shortUrl: null,
			},
		}, {
			blockingErrors: [],
			logEntries: [{
				id: "short-created-entry",
				createdAt: "2026-05-31T00:00:06.000Z",
				level: "info",
				code: "SHORT_LINK_CREATED",
				message: "created",
				source: "backend",
				originStage: "stage3",
			}],
			messages: [{ level: "info", code: "SHORT_LINK_CREATED", message: "created" }],
			resolvedLongURL: "https://public.example.com/sub?data=generated-long-url",
			resolvedShortURL: "https://public.example.com/s/manual-short",
		});

		expect(next.generatedUrls).toEqual({
			longUrl: "https://public.example.com/sub?data=generated-long-url",
			shortUrl: "https://public.example.com/s/manual-short",
		});
		expect(next.currentLinkInput).toBe("https://public.example.com/s/manual-short");
		expect(next.responseOriginStage).toBe("stage3");
	});

	it("restores long URL preference when on-demand short URL creation fails", () => {
		const next = applyShortURLCreationFailureState({
			...initialAppState,
			preferShortUrl: true,
			currentLinkInput: "https://public.example.com/sub?data=generated-long-url",
			generatedUrls: {
				longUrl: "https://public.example.com/sub?data=generated-long-url",
				shortUrl: null,
			},
		}, {
			blockingErrors: [{ code: "RATE_LIMITED", message: "retry", scope: "stage3_action", retryable: true }],
			logEntries: [{
				id: "short-failed-entry",
				createdAt: "2026-05-31T00:00:07.000Z",
				level: "warning",
				code: "SHORT_URL_FAILED",
				message: "failed",
				source: "frontend",
				originStage: "stage3",
			}],
			messages: [{ level: "warning", code: "SHORT_LINK_RETRYABLE", message: "retry" }],
			resolvedLongURL: "https://public.example.com/sub?data=generated-long-url",
		});

		expect(next.preferShortUrl).toBe(false);
		expect(next.blockingErrors.map((error) => error.code)).toEqual(["RATE_LIMITED"]);
		expect(next.messages.map((message) => message.code)).toEqual(["SHORT_LINK_RETRYABLE"]);
	});
});