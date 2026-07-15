export type MessageLevel = "info" | "warning";

export interface Message {
	level: MessageLevel;
	code: string;
	message: string;
	context?: Record<string, unknown>;
}

export type BlockingErrorScope =
	| "global"
	| "stage1_field"
	| "stage2_instance"
	| "stage2_server"
	| "stage3_field"
	| "stage3_action";

export interface BlockingError {
	code: string;
	message: string;
	scope: BlockingErrorScope;
	context?: Record<string, unknown>;
	retryable?: boolean;
}

export interface AdvancedOptionsPayload {
	emoji: boolean | null;
	udp: boolean | null;
	skipCertVerify: boolean | null;
	config: string | null;
	include: string[] | null;
	exclude: string[] | null;
}

export interface Stage1InputPayload {
	landingRawText: string;
	transitRawText: string;
	forwardRelayItems: string[];
	advancedOptions: AdvancedOptionsPayload;
}

export interface Stage1Input {
	landingRawText: string;
	transitRawText: string;
	forwardRelayItems: string[];
	advancedOptions: AdvancedOptionsPayload;
}

export interface ModeReason {
	reasonCode?: string;
	reasonArgs?: Record<string, unknown>;
	/** Transitional fallback when backend still emits legacy reasonText. */
	reasonText?: string;
}

export interface RestoreConflict {
	reasonCode: string;
	reasonArgs?: Record<string, unknown>;
}

export type Stage2Mode = "none" | "chain" | "port_forward";
export type AggregationStrategy = "fallback" | "url-test" | "select" | "load-balance";

export interface ChainTarget {
	name: string;
	kind: "proxy-groups" | "proxies";
	isEmpty?: boolean;
}

export interface ForwardRelay {
	name: string;
}

export interface Stage2CatalogSource {
	sourceId: string;
	landingNodeType: string;
	restrictedModes?: Partial<Record<Stage2Mode, ModeReason>>;
	modeWarnings?: Partial<Record<Stage2Mode, ModeReason>>;
	defaultProxyName: string;
	defaultMode: Stage2Mode;
	defaultTargetName: string | null;
}

export interface Stage2CatalogServer {
	serverKey: string;
	sources: Stage2CatalogSource[];
}

export interface Stage2Catalog {
	availableModes: Stage2Mode[];
	chainTargets: ChainTarget[];
	forwardRelays: ForwardRelay[];
	servers: Stage2CatalogServer[];
}

export interface Stage2InstanceWire {
	proxyName: string;
	mode: Stage2Mode;
	targetName: string | null;
}

export interface Stage2Instance extends Stage2InstanceWire {
	instanceId: string;
}

export interface Stage2SnapshotSource {
	sourceId: string;
	instances: Stage2Instance[];
}

export interface Stage2AggregationWire {
	enabled: boolean;
	groupName?: string;
	strategy?: AggregationStrategy;
	memberProxyNames?: string[];
}

export interface Stage2Aggregation {
	enabled: boolean;
	groupName?: string;
	strategy?: AggregationStrategy;
	memberLocalInstanceIds?: string[];
}

export interface Stage2SnapshotServer {
	serverKey: string;
	aggregation: Stage2Aggregation;
	sources: Stage2SnapshotSource[];
}

export interface Stage2Snapshot {
	chainProxyTargetGroupSwitchOptimizationEnabled?: boolean;
	servers: Stage2SnapshotServer[];
}

export interface Stage2SnapshotWire {
	chainProxyTargetGroupSwitchOptimizationEnabled?: boolean;
	servers: Array<{
		serverKey: string;
		aggregation: Stage2AggregationWire;
		sources: Array<{
			sourceId: string;
			instances: Stage2InstanceWire[];
		}>;
	}>;
}

export interface Stage2Bundle {
	catalog: Stage2Catalog;
	snapshot: Stage2Snapshot;
}

/** Flat projection of one nested instance for table UI / notices. */
export interface Stage2FlatInstance {
	instanceId: string;
	/** 0-based index within `source.instances`; stable across proxy rename for React keys. */
	instanceIndex: number;
	sourceId: string;
	serverKey: string;
	proxyName: string;
	mode: Stage2Mode;
	targetName: string | null;
	landingNodeType?: string;
	restrictedModes?: Partial<Record<Stage2Mode, ModeReason>>;
	modeWarnings?: Partial<Record<Stage2Mode, ModeReason>>;
}

export interface Stage1ConvertRequest {
	stage1Input: Stage1InputPayload;
}

export interface Stage1ConvertResponse {
	stage2: Stage2Bundle;
	messages: Message[];
	blockingErrors: BlockingError[];
}

export interface GenerateRequest {
	stage1Input: Stage1InputPayload;
	stage2: {
		snapshot: Stage2SnapshotWire;
	};
}

export interface GenerateResponse {
	longUrl: string;
	messages: Message[];
	blockingErrors: BlockingError[];
}

export interface ShortLinkResponse {
	longUrl: string;
	shortUrl: string;
	messages: Message[];
	blockingErrors: BlockingError[];
}

export interface ResolveURLResponse {
	longUrl: string;
	shortUrl?: string;
	restoreStatus: "replayable" | "conflicted";
	restoreConflicts?: RestoreConflict[];
	stage1Input: Stage1InputPayload;
	stage2: Stage2Bundle;
	messages: Message[];
	blockingErrors: BlockingError[];
}

export interface RuntimeConfigResponse {
	defaultTemplateURL: string;
	maxPublicLongURLLength: number;
}

export interface RuntimeStatusResponse {
	app: {
		version: string;
		releaseTag?: string;
		imageTag?: string;
		revision?: string;
		imageDigest?: string;
	};
	subconverter: {
		healthy: boolean;
		networkScope: "internal" | "cross_network";
		latencyMs?: number;
		version?: string;
		lastCheckedAt?: string;
		error?: string;
	};
	storage: {
		mode: string;
		used: number;
		capacity: number;
	};
}

export interface ErrorResponse {
	messages: Message[];
	blockingErrors: BlockingError[];
}

/** @deprecated Kept as aliases during exploration-scheme migration. */
export type Stage2Init = Stage2Catalog;
export type Stage2Row = Stage2FlatInstance;
export type Stage2InitRow = Stage2FlatInstance;
export type ServerAggregationGroup = {
	server: string;
	groupName?: string;
	enabled: boolean;
	strategy: AggregationStrategy;
	memberRowIds: string[];
};
