import type {
	BlockingError,
	Message,
	RestoreConflict,
	Stage1Input,
	Stage1InputPayload,
	Stage2Aggregation,
	Stage2Catalog,
	Stage2Snapshot,
} from "../types/api";

export type ResponseOriginStage = "stage1" | "stage2" | "stage3";
export type WorkflowLogLevel = Message["level"] | "success" | "error";

export interface WorkflowLogEntry {
	id: string;
	createdAt: string;
	level: WorkflowLogLevel;
	code: string;
	message: string;
	source: "backend" | "frontend";
	originStage: ResponseOriginStage | null;
	kind?: "entry" | "separator";
}

export interface GeneratedUrls {
	longUrl: string;
	shortUrl: string | null;
}

export interface AppState {
	currentLinkInput: string;
	preferShortUrl: boolean;
	stage1Input: Stage1Input;
	stage2Catalog: Stage2Catalog | null;
	/** @deprecated UI compatibility alias; kept synchronized with stage2Catalog. */
	stage2Init: Stage2Catalog | null;
	stage2Snapshot: Stage2Snapshot;
	aggregationDraftsByServerKey: Record<string, Stage2Aggregation>;
	generatedUrls: GeneratedUrls | null;
	stage3Expired: boolean;
	stage2Stale: boolean;
	restoreStatus: "idle" | "replayable" | "conflicted";
	restoreConflicts: RestoreConflict[];
	responseOriginStage: ResponseOriginStage | null;
	messages: Message[];
	workflowLog: WorkflowLogEntry[];
	blockingErrors: BlockingError[];
}

export const initialStage1Input: Stage1Input = {
	landingRawText: "",
	transitRawText: "",
	forwardRelayItems: [],
	advancedOptions: {
		emoji: true,
		udp: true,
		skipCertVerify: null,
		config: null,
		include: null,
		exclude: null,
	},
};

export function normalizeRawTextareaInput(value: string): string {
	return value
		.replace(/\r\n?/g, "\n")
		.replace(/\n+$/g, "");
}

export function toStage1InputPayload(stage1Input: Stage1Input): Stage1InputPayload {
	return {
		landingRawText: normalizeRawTextareaInput(stage1Input.landingRawText),
		transitRawText: normalizeRawTextareaInput(stage1Input.transitRawText),
		forwardRelayItems: stage1Input.forwardRelayItems,
		advancedOptions: stage1Input.advancedOptions,
	};
}

export function isInitialStage1Input(stage1Input: Stage1Input): boolean {
	return JSON.stringify(toStage1InputPayload(stage1Input)) === JSON.stringify(toStage1InputPayload(initialStage1Input));
}

export function hydrateStage1Input(stage1Input: Stage1InputPayload): Stage1Input {
	return stage1Input;
}

export const initialAppState: AppState = {
	currentLinkInput: "",
	preferShortUrl: false,
	stage1Input: initialStage1Input,
	stage2Catalog: null,
	stage2Init: null,
	stage2Snapshot: {
		chainProxyTargetGroupSwitchOptimizationEnabled: false,
		servers: [],
	},
	aggregationDraftsByServerKey: {},
	generatedUrls: null,
	stage3Expired: false,
	stage2Stale: false,
	restoreStatus: "idle",
	restoreConflicts: [],
	responseOriginStage: null,
	messages: [],
	workflowLog: [],
	blockingErrors: [],
};