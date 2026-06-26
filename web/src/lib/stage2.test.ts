import { describe, expect, it } from "vitest";

import {
	getForwardRelayChoices,
	getStage2RowEditableName,
	getStage2RowDisplayName,
	getStage2RowStrictKey,
	getStage2RowSourceLandingName,
	getStage2DisplayModeOptions,
	getStage2TargetDisplayLabel,
	isStage2SourceRow,
	matchesStage2RowKey,
	pickNextDerivedProxyName,
	pickNextTarget,
} from "./stage2";

import type { Stage2Init, Stage2Row } from "../types/api";

const minimalStage2Init: Stage2Init = {
	availableModes: ["none", "chain", "port_forward"],
	chainTargets: [],
	forwardRelays: [
		{ name: "relay-a.example.com:7443" },
		{ name: "relay-b.example.com:8443" },
	],
	rows: [
		{
			landingNodeName: "landing-a",
			landingNodeType: "ss",
			server: "a.example.com",
			mode: "none",
			targetName: null,
		},
		{
			landingNodeName: "landing-b",
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
				landingNodeName: "landing-a",
				mode: "port_forward",
				targetName: "relay-a.example.com:7443",
			},
			{
				landingNodeName: "landing-b",
				mode: "port_forward",
				targetName: "relay-b.example.com:8443",
			},
		];

		expect(getForwardRelayChoices(minimalStage2Init, stage2Rows, "landing-a")).toEqual([
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
				landingNodeName: "landing-a",
				mode: "chain",
				targetName: "HK Auto",
			},
		];

		expect(pickNextTarget(stage2Init, stage2Rows, "landing-a", "port_forward", null)).toBeNull();
	});

	it("preserves the current relay when it remains valid for the same row", () => {
		const stage2Rows: Stage2Row[] = [
			{
				landingNodeName: "landing-a",
				mode: "port_forward",
				targetName: "relay-a.example.com:7443",
			},
			{
				landingNodeName: "landing-b",
				mode: "none",
				targetName: null,
			},
		];

		expect(
			pickNextTarget(
				minimalStage2Init,
				stage2Rows,
				"landing-a",
				"port_forward",
				"relay-a.example.com:7443",
			),
		).toBe("relay-a.example.com:7443");
	});

	it("clears the target when switching to none", () => {
		expect(
			pickNextTarget(minimalStage2Init, [], "landing-a", "none", "relay-a.example.com:7443"),
		).toBeNull();
	});

	it("falls back to the restored mode when live mode options are unavailable", () => {
		expect(getStage2DisplayModeOptions(null, "chain")).toEqual(["chain"]);
	});

	it("falls back to the restored target name when live target metadata is unavailable", () => {
		const restoredRow: Stage2Row = {
			landingNodeName: "landing-a",
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
			landingNodeName: "legacy-a",
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
			landingNodeName: "landing-a ",
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
				landingNodeName: "landing-a",
				mode: "none",
				targetName: null,
			},
			{
				rowId: "row-b",
				sourceLandingNodeName: "landing-a",
				proxyName: "landing-a 2",
				landingNodeName: "landing-a 2",
				mode: "none",
				targetName: null,
			},
		];

		expect(pickNextDerivedProxyName(rows, "landing-a")).toBe("landing-a 3");
	});

	it("uses strict row keys to distinguish source and derived rows that share the same source landing name", () => {
		const sourceRow: Stage2Row = {
			rowId: "landing-a",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a",
			landingNodeName: "landing-a",
			mode: "chain",
			targetName: "HK Relay Group",
		};
		const derivedRow: Stage2Row = {
			rowId: "landing-a-copy",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a 2",
			landingNodeName: "landing-a 2",
			mode: "chain",
			targetName: "HK Relay Group",
		};

		expect(getStage2RowStrictKey(sourceRow)).toBe("rowId:landing-a");
		expect(matchesStage2RowKey(sourceRow, "rowId:landing-a")).toBe(true);
		expect(matchesStage2RowKey(derivedRow, "rowId:landing-a")).toBe(false);
		expect(matchesStage2RowKey(derivedRow, "landing-a")).toBe(true);
	});

	it("detects original source rows separately from derived rows", () => {
		const sourceRow: Stage2Row = {
			rowId: "landing-a",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a",
			landingNodeName: "landing-a",
			mode: "none",
			targetName: null,
		};
		const derivedRow: Stage2Row = {
			rowId: "landing-a-copy",
			sourceLandingNodeName: "landing-a",
			proxyName: "landing-a 2",
			landingNodeName: "landing-a 2",
			mode: "none",
			targetName: null,
		};

		expect(isStage2SourceRow(sourceRow)).toBe(true);
		expect(isStage2SourceRow(derivedRow)).toBe(false);
	});
});