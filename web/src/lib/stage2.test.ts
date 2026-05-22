import { describe, expect, it } from "vitest";

import { getForwardRelayChoices, pickNextTarget } from "./stage2";

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
			mode: "none",
			targetName: null,
		},
		{
			landingNodeName: "landing-b",
			landingNodeType: "vless",
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
});