export function makeStage2OrdinalId(sourceId: string, ordinal: number): string {
	return `${sourceId.trim()}::i${ordinal}`;
}

export function parseStage2OrdinalId(id: string): { sourceId: string; ordinal: number } | null {
	const trimmed = id.trim();
	const separator = trimmed.lastIndexOf("::i");
	if (separator <= 0) return null;
	const sourceId = trimmed.slice(0, separator);
	const ordinal = Number(trimmed.slice(separator + 3));
	if (!Number.isInteger(ordinal) || ordinal < 1) return null;
	return { sourceId, ordinal };
}
