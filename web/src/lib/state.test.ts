import { describe, expect, it } from "vitest";

import { hydrateStage1Input, initialAppState, initialStage1Input, toStage1InputPayload } from "./state";

describe("state helpers", () => {
	it("builds the API payload from stage1 input", () => {
		expect(
			toStage1InputPayload({
				...initialStage1Input,
				landingRawText: "landing://demo",
				transitRawText: "transit://demo",
				forwardRelayItems: ["relay.example.com:7443"],
				advancedOptions: {
					...initialStage1Input.advancedOptions,
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

	it("normalizes trailing line breaks in stage1 raw texts when building payload", () => {
		expect(
			toStage1InputPayload({
				...initialStage1Input,
				landingRawText: "ss://landing-a\r\nss://landing-b\r\n\r\n",
				transitRawText: "https://example.com/transit.txt\n\n",
			}),
		).toMatchObject({
			landingRawText: "ss://landing-a\nss://landing-b",
			transitRawText: "https://example.com/transit.txt",
		});
	});

	it("roundtrips stage1 input through payload hydration", () => {
		const payload = toStage1InputPayload({
			...initialStage1Input,
			landingRawText: "landing://demo",
			transitRawText: "transit://demo",
			forwardRelayItems: ["relay.example.com:7443"],
			advancedOptions: {
				...initialStage1Input.advancedOptions,
				exclude: ["US"],
			},
		});

		expect(hydrateStage1Input(payload)).toEqual(payload);
	});

	it("keeps the initial app state aligned with the Stage 1 defaults", () => {
		expect(initialAppState.stage1Input).toEqual(initialStage1Input);
		expect(initialAppState.stage2Snapshot.servers).toEqual([]);
		expect(initialAppState.aggregationDraftsByServerKey).toEqual({});
		expect(initialAppState.generatedUrls).toBeNull();
	});
});
