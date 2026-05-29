/** 添加标签时的去重键；`formatTag` 抛错时回退为 trim 后的原文。 */
export function tagKeyForDedup(trimmed: string, formatTag?: (raw: string) => string): string {
	if (!formatTag) {
		return trimmed;
	}
	try {
		return formatTag(trimmed);
	} catch {
		return trimmed;
	}
}

export function isDuplicateTag(
	candidate: string,
	list: readonly string[],
	existing: readonly string[] = [],
	formatTag?: (raw: string) => string,
): boolean {
	const key = tagKeyForDedup(candidate, formatTag);
	const seen = new Set([
		...list.map((tag) => tagKeyForDedup(tag, formatTag)),
		...existing.map((tag) => tagKeyForDedup(tag, formatTag)),
	]);
	return seen.has(key);
}

export type AppendTagResult =
	| { ok: true; next: string[]; tag: string }
	| { ok: false; reason: "empty" }
	| { ok: false; reason: "duplicate"; tag: string }
	| { ok: false; reason: "invalid"; message: string };

export function tryAppendTag(
	trimmed: string,
	list: readonly string[],
	existing: readonly string[] = [],
	formatTag?: (raw: string) => string,
): AppendTagResult {
	if (trimmed === "") {
		return { ok: false, reason: "empty" };
	}

	let tag: string;
	if (formatTag) {
		try {
			tag = formatTag(trimmed);
		} catch (error) {
			return {
				ok: false,
				reason: "invalid",
				message: error instanceof Error ? error.message : "校验失败",
			};
		}
	} else {
		tag = trimmed;
	}

	if (isDuplicateTag(trimmed, list, existing, formatTag)) {
		return { ok: false, reason: "duplicate", tag };
	}

	return { ok: true, next: [...list, tag], tag };
}
