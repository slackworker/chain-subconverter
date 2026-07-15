import type { BlockingError, Stage2FlatInstance } from "../types/api";

export function normalizeProxyName(proxyName: string): string {
	return proxyName.trim();
}

export function collectDuplicateProxyNameErrors(rows: Stage2FlatInstance[]): BlockingError[] {
	const byName = new Map<string, Stage2FlatInstance[]>();

	for (const row of rows) {
		const name = normalizeProxyName(row.proxyName);
		if (name === "") {
			continue;
		}
		const group = byName.get(name) ?? [];
		group.push(row);
		byName.set(name, group);
	}

	const errors: BlockingError[] = [];
	for (const group of byName.values()) {
		if (group.length < 2) {
			continue;
		}
		for (const row of group) {
			errors.push({
				code: "DUPLICATE_PROXY_NAME",
				message: "duplicate proxy name",
				scope: "stage2_instance",
				context: {
					sourceId: row.sourceId.trim(),
					proxyName: normalizeProxyName(row.proxyName),
					field: "proxyName",
				},
			});
		}
	}

	return errors;
}
