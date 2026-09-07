import { describe, expect, it } from "vitest";

import type { BlockingError, Stage2Row } from "../types/api";
import {
	clearStage1FieldErrors,
	clearDuplicateProxyNameErrors,
	clearStage2RowErrors,
	clearStage3ActionErrors,
	dedupeBlockingErrorsForDisplay,
	getGlobalPrimaryBlockingErrors,
	getPrimaryBlockingErrorsForStage,
	getRowErrors,
	mergeDuplicateProxyNameErrors,
	shouldPromoteStage2StaleNotice,
} from "./notices";

const globalError: BlockingError = {
	code: "GLOBAL_FAILURE",
	message: "global failure",
	scope: "global",
};

const stage1FieldError: BlockingError = {
	code: "INVALID_STAGE1_FIELD",
	message: "invalid stage1 field",
	scope: "stage1_field",
	context: { field: "landingRawText" },
};

const stage2RowError: BlockingError = {
	code: "INVALID_STAGE2_ROW",
	message: "invalid stage2 row",
	scope: "stage2_instance",
	context: { sourceId: "landing", proxyName: "HK Landing" },
};

const stage3ActionError: BlockingError = {
	code: "SHORT_LINK_FAILED",
	message: "short link failed",
	scope: "stage3_action",
};

const targetNotFoundError: BlockingError = {
	code: "TARGET_NOT_FOUND",
	message: "target not found",
	scope: "stage2_instance",
	context: { sourceId: "HK 01", proxyName: "HK 01 2", field: "targetName" },
};

function stage2Row(overrides: Partial<Stage2Row> & Pick<Stage2Row, "instanceId" | "proxyName" | "sourceId">): Stage2Row {
	return {
		instanceIndex: 0,
		serverKey: "edge",
		mode: "chain",
		targetName: "missing-group",
		...overrides,
	};
}

const duplicateProxyNameError: BlockingError = {
	code: "DUPLICATE_PROXY_NAME",
	message: "duplicate proxy name",
	scope: "stage2_instance",
	context: { sourceId: "landing", proxyName: "HK Landing", field: "proxyName" },
};

describe("notice helpers", () => {
	it("shows stage-local blocking errors only when the response stage matches", () => {
		expect(getPrimaryBlockingErrorsForStage([stage1FieldError], "stage1", "stage1")).toEqual([stage1FieldError]);
		expect(getPrimaryBlockingErrorsForStage([stage1FieldError], "stage2", "stage1")).toEqual([]);
		expect(getPrimaryBlockingErrorsForStage([globalError], "stage1", "stage1")).toEqual([]);
	});

	it("suppresses duplicated stage-local errors from the global placement", () => {
		const errors = [globalError, stage1FieldError];

		expect(getGlobalPrimaryBlockingErrors(errors, "stage1", "global")).toEqual(errors);
		expect(getGlobalPrimaryBlockingErrors(errors, "stage1", "stage-local")).toEqual([]);
		expect(getGlobalPrimaryBlockingErrors([globalError], "stage1", "stage-local")).toEqual([globalError]);
	});

	it("clears stage-scoped errors without touching unrelated ones", () => {
		const errors = [globalError, stage1FieldError, stage2RowError, stage3ActionError];

		expect(clearStage1FieldErrors(errors, "landingRawText")).toEqual([globalError, stage2RowError, stage3ActionError]);
		expect(clearStage2RowErrors(errors, { instanceId: "landing::i1", proxyName: "HK Landing", sourceId: "landing", instanceIndex: 0, serverKey: "edge", mode: "none", targetName: null })).toEqual([globalError, stage1FieldError, stage3ActionError]);
		expect(clearStage3ActionErrors(errors)).toEqual([globalError, stage1FieldError, stage2RowError]);
	});

	it("promotes the stale notice only for editable stale rows without blocking errors", () => {
		expect(shouldPromoteStage2StaleNotice({
			stage2Stale: true,
			hasStage2Rows: true,
			hasBlockingErrors: false,
			isRequestInFlight: false,
			isConflictReadonly: false,
		})).toBe(true);

		expect(shouldPromoteStage2StaleNotice({
			stage2Stale: true,
			hasStage2Rows: true,
			hasBlockingErrors: true,
			isRequestInFlight: false,
			isConflictReadonly: false,
		})).toBe(false);
	});

	it("replaces duplicate proxy name errors while preserving other stage2 errors", () => {
		const merged = mergeDuplicateProxyNameErrors(
			[stage2RowError, duplicateProxyNameError],
			[duplicateProxyNameError],
		);

		expect(merged).toEqual([stage2RowError, duplicateProxyNameError]);
		expect(clearDuplicateProxyNameErrors(merged)).toEqual([stage2RowError]);
	});

	it("dedupes identical primary feedback messages while keeping distinct errors", () => {
		const duplicateSecondRow: BlockingError = {
			...duplicateProxyNameError,
			context: { sourceId: "landing", proxyName: "HK Landing", field: "proxyName" },
		};
		const errors = [duplicateProxyNameError, duplicateSecondRow, stage2RowError];

		expect(dedupeBlockingErrorsForDisplay(errors)).toEqual([duplicateProxyNameError, stage2RowError]);
		expect(getPrimaryBlockingErrorsForStage(errors, "stage2", "stage2")).toEqual([
			duplicateProxyNameError,
			stage2RowError,
		]);
	});

	it("localizes TARGET_NOT_FOUND to the matching instance, not every clone of the same source", () => {
		const defaultInstance = stage2Row({
			instanceId: "HK 01::i1",
			sourceId: "HK 01",
			proxyName: "HK 01",
			instanceIndex: 0,
		});
		const clonedInstance = stage2Row({
			instanceId: "HK 01::i2",
			sourceId: "HK 01",
			proxyName: "HK 01 2",
			instanceIndex: 1,
		});
		const otherSource = stage2Row({
			instanceId: "HK 02::i1",
			sourceId: "HK 02",
			proxyName: "HK 02",
		});

		expect(getRowErrors([targetNotFoundError], clonedInstance)).toEqual([targetNotFoundError]);
		expect(getRowErrors([targetNotFoundError], defaultInstance)).toEqual([]);
		expect(getRowErrors([targetNotFoundError], otherSource)).toEqual([]);
		expect(getRowErrors([targetNotFoundError], clonedInstance.instanceId)).toEqual([]);
		expect(clearStage2RowErrors([globalError, targetNotFoundError], defaultInstance)).toEqual([
			globalError,
			targetNotFoundError,
		]);
		expect(clearStage2RowErrors([globalError, targetNotFoundError], clonedInstance)).toEqual([globalError]);
	});
});
