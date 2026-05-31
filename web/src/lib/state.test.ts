import { describe, expect, it } from "vitest";

import { hydrateStage1Input, initialAppState, initialStage1Input, toStage1InputPayload } from "./state";

describe("state helpers", () => {
	it("strips enablePortForward when building the API payload", () => {
		expect(
			toStage1InputPayload({
				...initialStage1Input,
				landingRawText: "landing://demo",
				transitRawText: "transit://demo",
				forwardRelayItems: ["relay.example.com:7443"],
				advancedOptions: {
					...initialStage1Input.advancedOptions,
					enablePortForward: true,
					config: "https://templates.example.com/default.ini",
					include: ["HK", "JP"],
				},
			}),
		).toEqual({
			landingRawText: "landing://demo",
			transitRawText: "transit://demo",
			forwardRelayItems: ["relay.example.com:7443"],
			advancedOptions: {
				emoji: true,
				udp: true,
				skipCertVerify: null,
				config: "https://templates.example.com/default.ini",
				include: ["HK", "JP"],
				exclude: null,
			},
		});
	});

	it("restores enablePortForward from persisted relay items after a payload roundtrip", () => {
		expect(
			hydrateStage1Input(
				toStage1InputPayload({
					...initialStage1Input,
					landingRawText: "landing://demo",
					transitRawText: "transit://demo",
					forwardRelayItems: ["relay.example.com:7443"],
					advancedOptions: {
						...initialStage1Input.advancedOptions,
						enablePortForward: true,
						exclude: ["US"],
					},
				}),
			),
		).toEqual({
			...initialStage1Input,
			landingRawText: "landing://demo",
			transitRawText: "transit://demo",
			forwardRelayItems: ["relay.example.com:7443"],
			advancedOptions: {
				...initialStage1Input.advancedOptions,
				enablePortForward: true,
				exclude: ["US"],
			},
		});
	});

	it("derives enablePortForward from forwardRelayItems during hydration", () => {
		expect(
			hydrateStage1Input({
				landingRawText: "landing://demo",
				transitRawText: "transit://demo",
				forwardRelayItems: ["relay.example.com:7443"],
				advancedOptions: {
					emoji: true,
					udp: false,
					skipCertVerify: null,
					config: null,
					include: null,
					exclude: ["US"],
				},
			}),
		).toEqual({
			landingRawText: "landing://demo",
			transitRawText: "transit://demo",
			forwardRelayItems: ["relay.example.com:7443"],
			advancedOptions: {
				emoji: true,
				udp: false,
				skipCertVerify: null,
				config: null,
				include: null,
				exclude: ["US"],
				enablePortForward: true,
			},
		});
	});

	it("keeps enablePortForward enabled when hydration restores no relay items", () => {
		expect(
			hydrateStage1Input({
				landingRawText: "landing://demo",
				transitRawText: "transit://demo",
				forwardRelayItems: [],
				advancedOptions: {
					emoji: false,
					udp: true,
					skipCertVerify: true,
					config: null,
					include: ["HK"],
					exclude: null,
				},
			}).advancedOptions.enablePortForward,
		).toBe(true);
	});

	it("keeps the initial app state aligned with the Stage 1 defaults", () => {
		expect(initialAppState.stage1Input).toEqual(initialStage1Input);
		expect(initialAppState.stage2Snapshot.rows).toEqual([]);
		expect(initialAppState.generatedUrls).toBeNull();
	});
});