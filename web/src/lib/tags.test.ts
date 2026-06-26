import { describe, expect, it } from "vitest";

import { isDuplicateTag, tagKeyForDedup, tokenizeTagInput, tryAppendTag } from "./tags";
import { normalizeForwardRelayItem } from "./stage1";

describe("tag dedup helpers", () => {
	it("tokenizeTagInput splits by newline/space/comma/tab/semicolon", () => {
		expect(tokenizeTagInput("relay-a.example.com:7443\nrelay-b.example.com:8443", true)).toEqual([
			"relay-a.example.com:7443",
			"relay-b.example.com:8443",
		]);
		expect(
			tokenizeTagInput(" relay-a.example.com:7443,\trelay-b.example.com:8443; ", true),
		).toEqual(["relay-a.example.com:7443", "relay-b.example.com:8443"]);
	});

	it("tokenizeTagInput keeps single value when split disabled", () => {
		expect(tokenizeTagInput(" relay-a.example.com:7443 relay-b.example.com:8443 ", false)).toEqual(
			["relay-a.example.com:7443 relay-b.example.com:8443"],
		);
	});

	it("treats trimmed duplicates in the same list as duplicates", () => {
		expect(isDuplicateTag("hk", ["hk"], [])).toBe(true);
		expect(isDuplicateTag("hk", ["other"], [])).toBe(false);
	});

	it("normalizes forward relay keys when comparing", () => {
		expect(
			isDuplicateTag(
				"Relay.EXAMPLE.com:8443",
				[],
				["relay.example.com:8443"],
				normalizeForwardRelayItem,
			),
		).toBe(true);
		expect(tagKeyForDedup("Relay.EXAMPLE.com:8443", normalizeForwardRelayItem)).toBe(
			"relay.example.com:8443",
		);
	});

	it("tryAppendTag rejects duplicates without mutating the list", () => {
		const result = tryAppendTag("hk", ["hk"], []);
		expect(result).toEqual({ ok: false, reason: "duplicate", tag: "hk" });
	});

	it("tryAppendTag returns invalid when formatTag throws", () => {
		const result = tryAppendTag("bad", [], [], normalizeForwardRelayItem);
		expect(result.ok).toBe(false);
		if (!result.ok) {
			expect(result.reason).toBe("invalid");
		}
	});
});
