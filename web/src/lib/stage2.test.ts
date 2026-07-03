import { describe, expect, it } from "vitest";

import {
	findStage2RowByKey,
	getForwardRelayChoices,
	getStage2DerivedProxyNameBase,
	getStage2RowEditableName,
	getStage2RowDisplayName,
	getStage2RowKey,
	getStage2RowStrictKey,
	getStage2RowSourceLandingName,
	getStage2DisplayModeOptions,
	getStage2TargetDisplayLabel,
	isStage2SourceRow,
	matchesStage2RowKey,
	pickNextDerivedProxyName,
	pickNextTarget,
	buildManagedServerAggregationGroupDisplayNames,
	collectTemplateProxyGroupNames,
	deriveManagedServerAggregationGroupBaseName,
	getServerAggregationGroupDisplayName,
	nextManagedServerAggregationGroupName,
} from "./stage2";

import type { Stage2Init, Stage2Row, Stage2Snapshot } from "../types/api";

const minimalStage2Init: Stage2Init = {
	availableModes: ["none", "chain", "port_forward"],
	chainTargets: [],
	forwardRelays: [
		{ name: "relay-a.example.com:7443" },
		{ name: "relay-b.example.com:8443" },
	],
	rows: [
		{
			rowId: "landing-a",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a",
			landingNodeType: "ss",
			server: "a.example.com",
			mode: "none",
			targetName: null,
		},
		{
			rowId: "landing-b",
			sourceLandingNodeName: "landing-b",
			proxyName: "landing-b",
			landingNodeType: "vless",
			server: "b.example.com",
			mode: "none",
			targetName: null,
		},
	],
};

describe("stage2 target helpers", () => {
	it("disables relays selected by other rows but keeps the current row target selectable", () => {
		const stage2Rows: Stage2Row[] = [
			{
				rowId: "landing-a",
				sourceLandingNodeName: "landing-a",
				proxyName: "landing-a",
				mode: "port_forward",
				targetName: "relay-a.example.com:7443",
			},
			{
				rowId: "landing-b",
				sourceLandingNodeName: "landing-b",
				proxyName: "landing-b",
				mode: "port_forward",
				targetName: "relay-b.example.com:8443",
			},
		];

		expect(getForwardRelayChoices(minimalStage2Init, stage2Rows, "rowId:landing-a")).toEqual([
			{
				value: "relay-a.example.com:7443",
				label: "relay-a.example.com:7443",
				disabled: false,
			},
			{
				value: "relay-b.example.com:8443",
				label: "relay-b.example.com:8443",
				disabled: true,
			},
		]);
	});

	it("does not auto-pick the only relay when switching into port_forward mode", () => {
		const stage2Init: Stage2Init = {
			...minimalStage2Init,
			forwardRelays: [{ name: "relay-only.example.com:7443" }],
		};
		const stage2Rows: Stage2Row[] = [
			{
				rowId: "landing-a",
				sourceLandingNodeName: "landing-a",
				proxyName: "landing-a",
				mode: "chain",
				targetName: "HK Auto",
			},
		];

		expect(pickNextTarget(stage2Init, stage2Rows, "rowId:landing-a", "port_forward", null)).toBeNull();
	});

	it("preserves the current relay when it remains valid for the same row", () => {
		const stage2Rows: Stage2Row[] = [
			{
				rowId: "landing-a",
				sourceLandingNodeName: "landing-a",
				proxyName: "landing-a",
				mode: "port_forward",
				targetName: "relay-a.example.com:7443",
			},
			{
				rowId: "landing-b",
				sourceLandingNodeName: "landing-b",
				proxyName: "landing-b",
				mode: "none",
				targetName: null,
			},
		];

		expect(
			pickNextTarget(
				minimalStage2Init,
				stage2Rows,
				"rowId:landing-a",
				"port_forward",
				"relay-a.example.com:7443",
			),
		).toBe("relay-a.example.com:7443");
	});

	it("clears the target when switching to none", () => {
		expect(
			pickNextTarget(minimalStage2Init, [], "rowId:landing-a", "none", "relay-a.example.com:7443"),
		).toBeNull();
	});

	it("falls back to the restored mode when live mode options are unavailable", () => {
		expect(getStage2DisplayModeOptions(null, "chain")).toEqual(["chain"]);
	});

	it("falls back to the restored target name when live target metadata is unavailable", () => {
		const restoredRow: Stage2Row = {
			rowId: "landing-hk",
			sourceLandingNodeName: "landing-hk",
			proxyName: "landing-hk",
			mode: "chain",
			targetName: "HK Relay Group",
		};

		expect(getStage2TargetDisplayLabel(null, [restoredRow], restoredRow)).toBe("HK Relay Group");
	});

	it("prefers proxyName and sourceLandingNodeName when present", () => {
		const row: Stage2Row = {
			rowId: "row-a",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a 2",
			mode: "none",
			targetName: null,
		};

		expect(getStage2RowDisplayName(row)).toBe("landing-a 2");
		expect(getStage2RowSourceLandingName(row)).toBe("landing-a");
	});

	it("keeps trailing whitespace in the editable row name", () => {
		const row: Stage2Row = {
			rowId: "row-a",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a ",
			mode: "none",
			targetName: null,
		};

		expect(getStage2RowEditableName(row)).toBe("landing-a ");
		expect(getStage2RowDisplayName(row)).toBe("landing-a");
	});

	it("picks the next derived proxy name from the source landing base name", () => {
		const rows: Stage2Row[] = [
			{
				rowId: "row-a",
				sourceLandingNodeName: "landing-a",
				proxyName: "landing-a",
				mode: "none",
				targetName: null,
			},
			{
				rowId: "row-b",
				sourceLandingNodeName: "landing-a",
				proxyName: "landing-a 2",
				mode: "none",
				targetName: null,
			},
		];

		expect(pickNextDerivedProxyName(rows, "landing-a")).toBe("landing-a 3");
	});

	it("picks the next derived proxy name from emoji display names", () => {
		const rows: Stage2Row[] = [
			{
				rowId: "Alpha-SS-SG",
				sourceLandingNodeName: "Alpha-SS-SG",
				proxyName: "🇸🇬 Alpha-SS-SG",
				mode: "none",
				targetName: null,
			},
		];

		expect(getStage2DerivedProxyNameBase(rows, "Alpha-SS-SG")).toBe("🇸🇬 Alpha-SS-SG");
		expect(pickNextDerivedProxyName(rows, "🇸🇬 Alpha-SS-SG")).toBe("🇸🇬 Alpha-SS-SG 2");
	});

	it("returns only rowId from getStage2RowKey and does not fall back to proxyName", () => {
		const row: Stage2Row = {
			rowId: "",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a",
			mode: "none",
			targetName: null,
		};

		expect(getStage2RowKey(row)).toBe("");
		expect(getStage2RowStrictKey(row)).toBe("");
		expect(findStage2RowByKey([row], "landing-a")).toBeNull();
		expect(findStage2RowByKey([row], "rowId:landing-a")).toBeNull();
	});

	it("uses strict row keys to distinguish source and derived rows that share the same source landing name", () => {
		const sourceRow: Stage2Row = {
			rowId: "landing-a",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a",
			mode: "chain",
			targetName: "HK Relay Group",
		};
		const derivedRow: Stage2Row = {
			rowId: "landing-a-copy",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a 2",
			mode: "chain",
			targetName: "HK Relay Group",
		};

		expect(getStage2RowStrictKey(sourceRow)).toBe("rowId:landing-a");
		expect(matchesStage2RowKey(sourceRow, "rowId:landing-a")).toBe(true);
		expect(matchesStage2RowKey(derivedRow, "rowId:landing-a")).toBe(false);
		expect(matchesStage2RowKey(derivedRow, "rowId:landing-a-copy")).toBe(true);
	});

	it("detects original source rows separately from derived rows", () => {
		const sourceRow: Stage2Row = {
			rowId: "landing-a",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a",
			mode: "none",
			targetName: null,
		};
		const derivedRow: Stage2Row = {
			rowId: "landing-a-copy",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a 2",
			mode: "none",
			targetName: null,
		};

		expect(isStage2SourceRow(sourceRow)).toBe(true);
		expect(isStage2SourceRow(derivedRow)).toBe(false);
	});
});

describe("server aggregation group naming", () => {
	it("derives emoji+server default names and conflict suffixes like backend YAML rules", () => {
		const rows: Stage2Row[] = [
			{
				rowId: "🇭🇰 HK Landing",
				sourceLandingNodeName: "🇭🇰 HK Landing",
				proxyName: "🇭🇰 HK Landing",
				mode: "none",
				targetName: null,
			},
			{
				rowId: "hk-2",
				sourceLandingNodeName: "🇭🇰 HK Landing",
				proxyName: "🇭🇰 HK Landing Copy",
				mode: "none",
				targetName: null,
			},
		];
		const snapshot = {
			rows,
			serverAggregationGroups: [
				{
					server: "landing.example.com",
					enabled: true,
					strategy: "fallback" as const,
					memberRowIds: ["🇭🇰 HK Landing", "hk-2"],
				},
			],
		};

		expect(
			getServerAggregationGroupDisplayName(snapshot, "landing.example.com", {
				existingProxyGroupNames: ["🇭🇰 landing.example.com"],
			}),
		).toBe("🇭🇰 landing.example.com 2");
	});

	it("uses source:* server keys instead of display placeholders", () => {
		const rows: Stage2Row[] = [
			{
				rowId: "solo",
				sourceLandingNodeName: "solo",
				proxyName: "solo",
				mode: "none",
				targetName: null,
			},
		];

		expect(
			deriveManagedServerAggregationGroupBaseName("source:solo", undefined, rows),
		).toBe("source:solo");
	});

	it("assigns managed names in serverAggregationGroups order", () => {
		const rows: Stage2Row[] = [
			{
				rowId: "a-1",
				sourceLandingNodeName: "a-1",
				proxyName: "a-1",
				mode: "none",
				targetName: null,
			},
			{
				rowId: "b-1",
				sourceLandingNodeName: "b-1",
				proxyName: "b-1",
				mode: "none",
				targetName: null,
			},
		];
		const snapshot = {
			rows,
			serverAggregationGroups: [
				{
					server: "shared.example.com",
					enabled: true,
					strategy: "fallback" as const,
					memberRowIds: ["a-1"],
				},
				{
					server: "other.example.com",
					enabled: true,
					strategy: "fallback" as const,
					memberRowIds: ["b-1"],
				},
			],
		};

		expect(
			buildManagedServerAggregationGroupDisplayNames(snapshot, ["shared.example.com"]),
		).toEqual(
			new Map([
				["shared.example.com", "shared.example.com 2"],
				["other.example.com", "other.example.com"],
			]),
		);
	});

	it("collects template proxy group names for conflict resolution", () => {
		expect(
			collectTemplateProxyGroupNames([
				{ name: "HK Relay Group", kind: "proxy-groups" },
				{ name: "relay.example.com:7443", kind: "proxies" },
			]),
		).toEqual(new Set(["HK Relay Group"]));
	});

	it("increments conflict suffixes from 2 upward", () => {
		const usedNames = new Set(["HK Group", "HK Group 2"]);
		expect(nextManagedServerAggregationGroupName("HK Group", usedNames)).toBe("HK Group 3");
	});

	it("prefers explicit groupName over emoji+server defaults", () => {
		const rows: Stage2Row[] = [
			{
				rowId: "🇭🇰 HK Landing",
				sourceLandingNodeName: "🇭🇰 HK Landing",
				proxyName: "🇭🇰 HK Landing",
				mode: "none",
				targetName: null,
			},
		];
		expect(deriveManagedServerAggregationGroupBaseName("landing.example.com", "HK 手动分组", rows)).toBe(
			"HK 手动分组",
		);
	});

	it("falls back to server when server key is empty", () => {
		expect(deriveManagedServerAggregationGroupBaseName("", undefined, [])).toBe("server");
	});
});
