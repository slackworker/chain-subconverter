import { getChainTargetGroups } from "./chainTargets";
import { makeStage2OrdinalId, parseStage2OrdinalId } from "./stage2InstanceId";

import type { ChainTargetGroup } from "./chainTargets";
import type {
	AggregationStrategy,
	ChainTarget,
	Stage2Aggregation,
	Stage2AggregationWire,
	Stage2Catalog,
	Stage2CatalogSource,
	Stage2FlatInstance,
	Stage2Instance,
	Stage2Snapshot,
	Stage2SnapshotServer,
	Stage2SnapshotSource,
	Stage2SnapshotWire,
} from "../types/api";

export interface TargetChoice {
	value: string;
	label: string;
	disabled: boolean;
}

export interface ChainTargetChoiceGroup extends Omit<ChainTargetGroup, "targets"> {
	choices: TargetChoice[];
}

export interface CatalogSourcePath {
	serverIndex: number;
	sourceIndex: number;
	serverKey: string;
	source: Stage2CatalogSource;
}

export interface InstancePath {
	serverIndex: number;
	sourceIndex: number;
	instanceIndex: number;
	server: Stage2SnapshotServer;
	source: Stage2SnapshotSource;
	instance: Stage2Instance;
}

export type Stage2SnapshotRows = Stage2FlatInstance[];
export type ServerAggregationStrategy = AggregationStrategy;

export function nextOrdinalForSource(snapshot: Stage2Snapshot, sourceId: string): number {
	const key = sourceId.trim();
	let max = 0;
	for (const server of snapshot.servers) {
		for (const source of server.sources) {
			if (source.sourceId.trim() !== key) continue;
			for (const instance of source.instances) {
				const parsed = parseStage2OrdinalId(instance.instanceId);
				if (parsed) max = Math.max(max, parsed.ordinal);
			}
		}
	}
	return max + 1;
}

export function hydrateInstanceIds(snapshot: Stage2Snapshot): Stage2Snapshot {
	return {
		...snapshot,
		servers: snapshot.servers.map((server) => ({
			...server,
			sources: server.sources.map((source) => {
				let ordinal = 1;
				return {
					...source,
					instances: source.instances.map((instance) => ({
						...instance,
						instanceId: makeStage2OrdinalId(source.sourceId, ordinal++),
					})),
				};
			}),
		})),
	};
}

export function flattenInstances(
	snapshot: Stage2Snapshot,
	catalog: Stage2Catalog | null = null,
): Stage2FlatInstance[] {
	const catalogBySource = new Map<string, Stage2CatalogSource>();
	for (const server of catalog?.servers ?? []) {
		for (const source of server.sources) {
			catalogBySource.set(source.sourceId.trim(), source);
		}
	}
	const result: Stage2FlatInstance[] = [];
	for (const server of snapshot.servers) {
		for (const source of server.sources) {
			const meta = catalogBySource.get(source.sourceId.trim());
			for (let instanceIndex = 0; instanceIndex < source.instances.length; instanceIndex += 1) {
				const instance = source.instances[instanceIndex];
				result.push({
					...instance,
					instanceIndex,
					sourceId: source.sourceId,
					serverKey: server.serverKey,
					...(meta
						? {
							landingNodeType: meta.landingNodeType,
							restrictedModes: meta.restrictedModes,
							modeWarnings: meta.modeWarnings,
						}
						: {}),
				});
			}
		}
	}
	return result;
}

export const projectStage2InstancesDFS = flattenInstances;

export function findCatalogSource(catalog: Stage2Catalog | null, sourceId: string): CatalogSourcePath | null {
	const key = sourceId.trim();
	if (!catalog || !key) return null;
	for (let serverIndex = 0; serverIndex < catalog.servers.length; serverIndex += 1) {
		const server = catalog.servers[serverIndex];
		const sourceIndex = server.sources.findIndex((source) => source.sourceId.trim() === key);
		if (sourceIndex >= 0) {
			return { serverIndex, sourceIndex, serverKey: server.serverKey, source: server.sources[sourceIndex] };
		}
	}
	return null;
}

export function findInstance(snapshot: Stage2Snapshot, instanceId: string): InstancePath | null {
	const key = parseRowKey(instanceId);
	if (!key) return null;
	for (let serverIndex = 0; serverIndex < snapshot.servers.length; serverIndex += 1) {
		const server = snapshot.servers[serverIndex];
		for (let sourceIndex = 0; sourceIndex < server.sources.length; sourceIndex += 1) {
			const source = server.sources[sourceIndex];
			const instanceIndex = source.instances.findIndex((instance) => instance.instanceId.trim() === key);
			if (instanceIndex >= 0) {
				return { serverIndex, sourceIndex, instanceIndex, server, source, instance: source.instances[instanceIndex] };
			}
		}
	}
	return null;
}

function mapSource(
	snapshot: Stage2Snapshot,
	instanceId: string,
	mapper: (source: Stage2SnapshotSource, instanceIndex: number, server: Stage2SnapshotServer) => Stage2SnapshotSource,
): Stage2Snapshot {
	const path = findInstance(snapshot, instanceId);
	if (!path) return snapshot;
	return {
		...snapshot,
		servers: snapshot.servers.map((server, serverIndex) =>
			serverIndex !== path.serverIndex
				? server
				: {
					...server,
					sources: server.sources.map((source, sourceIndex) =>
						sourceIndex === path.sourceIndex ? mapper(source, path.instanceIndex, server) : source),
				}),
	};
}

export function updateInstance(
	snapshot: Stage2Snapshot,
	instanceId: string,
	updater: (instance: Stage2Instance) => Stage2Instance,
): Stage2Snapshot {
	return mapSource(snapshot, instanceId, (source, instanceIndex) => ({
		...source,
		instances: source.instances.map((instance, index) => index === instanceIndex ? updater(instance) : instance),
	}));
}

export function cloneInstance(snapshot: Stage2Snapshot, instanceId: string): Stage2Snapshot {
	const path = findInstance(snapshot, instanceId);
	if (!path) return snapshot;
	const proxyName = pickNextDerivedProxyName(flattenInstances(snapshot), path.instance.proxyName);
	const ordinal = nextOrdinalForSource(snapshot, path.source.sourceId);
	const clone: Stage2Instance = {
		...path.instance,
		proxyName,
		instanceId: makeStage2OrdinalId(path.source.sourceId, ordinal),
	};
	return mapSource(snapshot, instanceId, (source) => {
		const instances = [...source.instances, clone];
		return { ...source, instances };
	});
}

export function deleteInstance(snapshot: Stage2Snapshot, instanceId: string): Stage2Snapshot {
	const path = findInstance(snapshot, instanceId);
	if (!path || path.source.instances.length <= 1) return snapshot;
	const canonicalId = path.instance.instanceId;
	return {
		...snapshot,
		servers: snapshot.servers.map((server, serverIndex) => {
			if (serverIndex !== path.serverIndex) return server;
			return {
				...server,
				aggregation: {
					...server.aggregation,
					memberLocalInstanceIds: (server.aggregation.memberLocalInstanceIds ?? []).filter((id) => id !== canonicalId),
				},
				sources: server.sources.map((source, sourceIndex) =>
					sourceIndex !== path.sourceIndex
						? source
						: { ...source, instances: source.instances.filter((instance) => instance.instanceId !== canonicalId) }),
			};
		}),
	};
}

/** @deprecated Use updateInstance to change proxyName; ordinal instanceId stays stable. */
export function renameInstance(snapshot: Stage2Snapshot, instanceId: string, proxyName: string): Stage2Snapshot {
	return updateInstance(snapshot, instanceId, (instance) => ({ ...instance, proxyName }));
}

export function defaultSnapshotFromCatalog(catalog: Stage2Catalog): Stage2Snapshot {
	return hydrateInstanceIds({
		chainProxyTargetGroupSwitchOptimizationEnabled: false,
		servers: catalog.servers.map((server) => ({
			serverKey: server.serverKey,
			aggregation: { enabled: false },
			sources: server.sources.map((source) => ({
				sourceId: source.sourceId,
				instances: [{
					instanceId: "",
					proxyName: source.defaultProxyName,
					mode: source.defaultMode,
					targetName: source.defaultTargetName,
				}],
			})),
		})),
	});
}

export function mergeSnapshotAfterConvert(
	currentSnapshot: Stage2Snapshot,
	newCatalog: Stage2Catalog,
	newDefaultSnapshot: Stage2Snapshot = defaultSnapshotFromCatalog(newCatalog),
): Stage2Snapshot {
	const currentSources = new Map<string, { instances: Stage2Instance[]; aggregation: Stage2Aggregation }>();
	for (const server of currentSnapshot.servers) {
		for (const source of server.sources) {
			currentSources.set(source.sourceId.trim(), {
				instances: source.instances,
				aggregation: server.aggregation,
			});
		}
	}
	const merged: Stage2Snapshot = {
		chainProxyTargetGroupSwitchOptimizationEnabled:
			currentSnapshot.chainProxyTargetGroupSwitchOptimizationEnabled ?? false,
		servers: newDefaultSnapshot.servers.map((defaultServer) => {
			const allowedIds = new Set<string>();
			const sources = defaultServer.sources.map((defaultSource) => {
				const current = currentSources.get(defaultSource.sourceId.trim());
				const instances = current?.instances.length ? current.instances : defaultSource.instances;
				for (const instance of instances) allowedIds.add(instance.instanceId);
				return { ...defaultSource, instances };
			});
			const priorAggregation = currentSnapshot.servers
				.find((server) => server.serverKey.trim() === defaultServer.serverKey.trim())?.aggregation;
			const aggregation = priorAggregation
				? {
					...priorAggregation,
					memberLocalInstanceIds: (priorAggregation.memberLocalInstanceIds ?? []).filter((id) => allowedIds.has(id)),
				}
				: defaultServer.aggregation;
			return { ...defaultServer, aggregation, sources };
		}),
	};
	return hydrateInstanceIds(merged);
}

export function resetInstanceFromCatalog(
	snapshot: Stage2Snapshot,
	catalog: Stage2Catalog,
	instanceId: string,
): Stage2Snapshot {
	const path = findInstance(snapshot, instanceId);
	if (!path) return snapshot;
	const meta = findCatalogSource(catalog, path.source.sourceId);
	if (!meta) return snapshot;
	return updateInstance(snapshot, instanceId, (instance) => ({
		...instance,
		proxyName: meta.source.defaultProxyName,
		mode: meta.source.defaultMode,
		targetName: meta.source.defaultTargetName,
	}));
}

function mapMemberLocalIdsToProxyNames(snapshot: Stage2Snapshot, memberLocalInstanceIds: string[]): string[] {
	const byId = new Map(flattenInstances(snapshot).map((row) => [row.instanceId.trim(), row.proxyName.trim()]));
	return memberLocalInstanceIds
		.map((id) => byId.get(id.trim()) ?? "")
		.filter((name) => name !== "");
}

export function normalizeSnapshotForRequest(snapshot: Stage2Snapshot): Stage2SnapshotWire {
	return {
		chainProxyTargetGroupSwitchOptimizationEnabled: snapshot.chainProxyTargetGroupSwitchOptimizationEnabled,
		servers: snapshot.servers.map((server) => ({
			serverKey: server.serverKey,
			aggregation: server.aggregation.enabled
				? {
					enabled: true,
					...(server.aggregation.groupName?.trim() ? { groupName: server.aggregation.groupName.trim() } : {}),
					strategy: server.aggregation.strategy ?? "fallback",
					memberProxyNames: mapMemberLocalIdsToProxyNames(
						snapshot,
						server.aggregation.memberLocalInstanceIds ?? [],
					),
				} satisfies Stage2AggregationWire
				: { enabled: false },
			sources: server.sources.map((source) => ({
				sourceId: source.sourceId,
				instances: source.instances.map(({ proxyName, mode, targetName }) => ({ proxyName, mode, targetName })),
			})),
		})),
	};
}

export function getServerAggregation(snapshot: Stage2Snapshot, serverKey: string): Stage2Aggregation | null {
	return snapshot.servers.find((server) => server.serverKey.trim() === serverKey.trim())?.aggregation ?? null;
}

export const getServerAggregationGroup = getServerAggregation;

export function getServerAggregationStrategy(snapshot: Stage2Snapshot, serverKey: string) {
	return getServerAggregation(snapshot, serverKey)?.strategy ?? null;
}

export function getServerInstances(snapshot: Stage2Snapshot, serverKey: string): Stage2FlatInstance[] {
	const server = snapshot.servers.find((candidate) => candidate.serverKey.trim() === serverKey.trim());
	return server ? flattenInstances({ servers: [server] }) : [];
}

export function getServerAggregationMemberRows(snapshot: Stage2Snapshot, aggregation: Stage2Aggregation) {
	const byId = new Map(flattenInstances(snapshot).map((row) => [row.instanceId, row]));
	return (aggregation.memberLocalInstanceIds ?? []).flatMap((id) => {
		const row = byId.get(id);
		return row ? [row] : [];
	});
}

export function updateServerAggregation(
	snapshot: Stage2Snapshot,
	serverKey: string,
	updater: (aggregation: Stage2Aggregation, server: Stage2SnapshotServer) => Stage2Aggregation,
): Stage2Snapshot {
	return {
		...snapshot,
		servers: snapshot.servers.map((server) =>
			server.serverKey.trim() === serverKey.trim()
				? { ...server, aggregation: updater(server.aggregation, server) }
				: server),
	};
}

export function reorderInstances(snapshot: Stage2Snapshot, sourceId: string, orderedInstanceIds: string[]): Stage2Snapshot {
	const order = new Map(orderedInstanceIds.map((id, index) => [id, index]));
	return {
		...snapshot,
		servers: snapshot.servers.map((server) => ({
			...server,
			sources: server.sources.map((source) =>
				source.sourceId.trim() !== sourceId.trim()
					? source
					: {
						...source,
						instances: [...source.instances].sort((a, b) =>
							(order.get(a.instanceId) ?? Number.MAX_SAFE_INTEGER)
							- (order.get(b.instanceId) ?? Number.MAX_SAFE_INTEGER)),
					}),
		})),
	};
}

export function getStage2RowDisplayName(row: Pick<Stage2FlatInstance, "proxyName">) {
	return row.proxyName.trim();
}

export function getStage2RowEditableName(row: Pick<Stage2FlatInstance, "proxyName">) {
	return row.proxyName;
}

export function getStage2RowSourceLandingName(row: Pick<Stage2FlatInstance, "sourceId">) {
	return row.sourceId.trim();
}

export function getStage2SourceGroupSize(rows: Stage2SnapshotRows, sourceId: string) {
	return rows.filter((row) => row.sourceId.trim() === sourceId.trim()).length;
}

export function getStage2RowKey(row: Pick<Stage2FlatInstance, "instanceId">) {
	return row.instanceId.trim();
}

export function getStage2RowStrictKey(row: Pick<Stage2FlatInstance, "instanceId">) {
	const id = row.instanceId.trim();
	return id ? `instanceId:${id}` : "";
}

/** React list key: ordinal instanceId is stable across proxyName edits. */
export function getStage2RowStableKey(row: Pick<Stage2FlatInstance, "instanceId">) {
	return row.instanceId.trim();
}

function parseRowKey(rowKey: string) {
	const key = rowKey.trim();
	return key.startsWith("instanceId:") ? key.slice("instanceId:".length).trim() : key;
}

export function matchesStage2RowKey(row: Pick<Stage2FlatInstance, "instanceId">, rowKey: string) {
	return row.instanceId.trim() === parseRowKey(rowKey);
}

export function findStage2RowByKey(rows: Stage2SnapshotRows, rowKey: string) {
	return rows.find((row) => matchesStage2RowKey(row, rowKey)) ?? null;
}

/** 同一 sourceId 分组内的首个/默认实例（`instances[0]`）。 */
export function isStage2DefaultInstance(row: Pick<Stage2FlatInstance, "instanceIndex">) {
	return row.instanceIndex === 0;
}

export function getStage2DerivedProxyNameBase(rows: Stage2SnapshotRows, sourceId: string) {
	return rows.find((row) => row.sourceId.trim() === sourceId.trim())?.proxyName.trim() || sourceId.trim();
}

export function pickNextDerivedProxyName(rows: Stage2SnapshotRows, baseName: string) {
	const base = baseName.trim();
	if (!base) return "";
	const used = new Set(rows.map((row) => row.proxyName.trim()));
	if (!used.has(base)) return base;
	let suffix = 2;
	while (used.has(`${base} ${suffix}`)) suffix += 1;
	return `${base} ${suffix}`;
}

function getSelectedForwardRelays(rows: Stage2SnapshotRows) {
	return new Set(rows.filter((row) => row.mode === "port_forward" && row.targetName).map((row) => row.targetName as string));
}

function toChainTargetChoiceGroup(group: ChainTargetGroup): ChainTargetChoiceGroup {
	return {
		...group,
		choices: group.targets.map((target) => ({
			value: target.name,
			label: target.isEmpty ? `${target.name}（策略组为空）` : target.name,
			disabled: target.isEmpty === true,
		})),
	};
}

export function getChainTargetChoiceGroups(catalog: Stage2Catalog | null) {
	return catalog ? getChainTargetGroups(catalog.chainTargets).map(toChainTargetChoiceGroup) : [];
}

export function findChainTarget(catalog: Stage2Catalog | null, targetName: string | null) {
	return catalog && targetName ? catalog.chainTargets.find((target) => target.name === targetName) ?? null : null;
}

export function isSwitchOptimizationEligible(catalog: Stage2Catalog | null, row: Stage2FlatInstance) {
	return row.mode === "chain" && findChainTarget(catalog, row.targetName)?.kind === "proxy-groups";
}

export function getForwardRelayChoices(catalog: Stage2Catalog | null, rows: Stage2SnapshotRows, rowKey: string) {
	if (!catalog) return [];
	const current = findStage2RowByKey(rows, rowKey);
	const selected = getSelectedForwardRelays(rows);
	if (current?.mode === "port_forward" && current.targetName) selected.delete(current.targetName);
	return catalog.forwardRelays.map((relay) => ({
		value: relay.name,
		label: relay.name,
		disabled: selected.has(relay.name),
	}));
}

export function getSelectableChoices(
	catalog: Stage2Catalog | null,
	rows: Stage2SnapshotRows,
	rowKey: string,
	mode: Stage2FlatInstance["mode"],
) {
	if (mode === "chain") {
		return getChainTargetChoiceGroups(catalog).flatMap((group) => group.choices).filter((choice) => !choice.disabled);
	}
	if (mode === "port_forward") {
		return getForwardRelayChoices(catalog, rows, rowKey).filter((choice) => !choice.disabled);
	}
	return [];
}

export function getStage2DisplayModeOptions(catalog: Stage2Catalog | null, currentMode: Stage2FlatInstance["mode"]) {
	return catalog?.availableModes.length ? catalog.availableModes : [currentMode];
}

export function getStage2TargetDisplayLabel(
	catalog: Stage2Catalog | null,
	rows: Stage2SnapshotRows,
	row: Stage2FlatInstance,
) {
	if (row.mode === "none" || row.targetName === null) return null;
	if (row.mode === "chain") {
		return getChainTargetChoiceGroups(catalog).flatMap((group) => group.choices)
			.find((choice) => choice.value === row.targetName)?.label ?? row.targetName;
	}
	return getForwardRelayChoices(catalog, rows, row.instanceId)
		.find((choice) => choice.value === row.targetName)?.label ?? row.targetName;
}

export function pickNextTarget(
	catalog: Stage2Catalog | null,
	rows: Stage2SnapshotRows,
	rowKey: string,
	mode: Stage2FlatInstance["mode"],
	currentTarget: string | null,
) {
	if (mode === "none") return null;
	return getSelectableChoices(catalog, rows, rowKey, mode).some((choice) => choice.value === currentTarget)
		? currentTarget
		: null;
}

function getLeadingFlagEmoji(name: string): string | null {
	return name.trim().match(/^(\p{Regional_Indicator}{2})(?:\s|$)/u)?.[1] ?? null;
}

export function detectServerGroupSourceFlagEmoji(rows: Stage2FlatInstance[]): string | null {
	if (!rows.length) return null;
	let emoji: string | null = null;
	for (const row of rows) {
		const current = getLeadingFlagEmoji(row.proxyName);
		if (!current || (emoji && emoji !== current)) return null;
		emoji = current;
	}
	return emoji;
}

export function deriveManagedServerAggregationGroupBaseName(
	serverKey: string,
	groupName: string | undefined,
	memberRows: Stage2FlatInstance[],
) {
	const explicit = groupName?.trim();
	if (explicit) return explicit;
	const base = serverKey.trim() || "server";
	const emoji = detectServerGroupSourceFlagEmoji(memberRows);
	return emoji ? `${emoji} ${base}` : base;
}

export function nextManagedServerAggregationGroupName(baseName: string, usedNames: Set<string>) {
	const base = baseName.trim() || "server";
	if (!usedNames.has(base)) return base;
	let suffix = 2;
	while (usedNames.has(`${base} ${suffix}`)) suffix += 1;
	return `${base} ${suffix}`;
}

export function collectTemplateProxyGroupNames(chainTargets: ChainTarget[]) {
	return new Set(chainTargets.filter((target) => target.kind === "proxy-groups").map((target) => target.name.trim()).filter(Boolean));
}

export function buildManagedServerAggregationGroupDisplayNames(
	snapshot: Stage2Snapshot,
	existingProxyGroupNames: Iterable<string> = [],
) {
	const used = new Set(existingProxyGroupNames);
	const names = new Map<string, string>();
	for (const server of snapshot.servers) {
		if (!server.aggregation.enabled) continue;
		const base = deriveManagedServerAggregationGroupBaseName(
			server.serverKey,
			server.aggregation.groupName,
			getServerAggregationMemberRows(snapshot, server.aggregation),
		);
		const name = nextManagedServerAggregationGroupName(base, used);
		used.add(name);
		names.set(server.serverKey, name);
	}
	return names;
}

export function getServerAggregationGroupDisplayName(
	snapshot: Stage2Snapshot,
	serverKey: string,
	options: {
		groupName?: string;
		enabled?: boolean;
		memberRows?: Stage2FlatInstance[];
		existingProxyGroupNames?: Iterable<string>;
	} = {},
) {
	const aggregation = getServerAggregation(snapshot, serverKey);
	if ((options.enabled ?? aggregation?.enabled) === true) {
		const managed = buildManagedServerAggregationGroupDisplayNames(snapshot, options.existingProxyGroupNames).get(serverKey);
		if (managed) return managed;
	}
	return deriveManagedServerAggregationGroupBaseName(
		serverKey,
		options.groupName ?? aggregation?.groupName,
		options.memberRows ?? (aggregation ? getServerAggregationMemberRows(snapshot, aggregation) : []),
	);
}
