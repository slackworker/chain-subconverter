import type { BlockingError, Stage2Catalog, Stage2FlatInstance } from "../types/api";

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

function trimmedName(value: string | null | undefined): string {
	return value?.trim() ?? "";
}

/** 非空 target 不在当前 catalog 对应候选中时，行级定位可立即标出，不必等生成请求。 */
export function collectUnresolvedTargetErrors(
	rows: Stage2FlatInstance[],
	catalog: Stage2Catalog | null,
): BlockingError[] {
	if (!catalog) {
		return [];
	}
	const chainNames = new Set(
		catalog.chainTargets.map((target) => target.name.trim()).filter((name) => name !== ""),
	);
	const relayNames = new Set(
		catalog.forwardRelays.map((relay) => relay.name.trim()).filter((name) => name !== ""),
	);
	const errors: BlockingError[] = [];
	for (const row of rows) {
		const targetName = trimmedName(row.targetName);
		if (targetName === "") {
			continue;
		}
		const known = row.mode === "chain" ? chainNames : row.mode === "port_forward" ? relayNames : null;
		if (known === null || known.has(targetName)) {
			continue;
		}
		const sourceId = row.sourceId.trim();
		const proxyName = normalizeProxyName(row.proxyName);
		if (sourceId === "" || proxyName === "") {
			continue;
		}
		errors.push({
			code: "TARGET_NOT_FOUND",
			message: "target not found",
			scope: "stage2_instance",
			context: {
				sourceId,
				proxyName,
				field: "targetName",
			},
		});
	}
	return errors;
}

export function rowErrorsWithUnresolvedTargets(
	stored: BlockingError[],
	row: Stage2FlatInstance,
	catalog: Stage2Catalog | null,
): BlockingError[] {
	const local = collectUnresolvedTargetErrors([row], catalog);
	if (local.length === 0) {
		return stored;
	}
	const covered = new Set(stored.map((error) => `${error.code}\0${String(error.context?.field ?? "")}`));
	const extra = local.filter((error) => !covered.has(`${error.code}\0${String(error.context?.field ?? "")}`));
	return extra.length === 0 ? stored : [...stored, ...extra];
}
