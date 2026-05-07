import type { BlockingError, Message, Stage1Input, Stage1InputPayload, Stage2Init, Stage2Snapshot } from "../types/api";

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
}

export interface GeneratedUrls {
	longUrl: string;
	shortUrl: string | null;
}

export interface AppState {
	currentLinkInput: string;
	preferShortUrl: boolean;
	stage1Input: Stage1Input;
	stage2Init: Stage2Init | null;
	stage2Snapshot: Stage2Snapshot;
	generatedUrls: GeneratedUrls | null;
	stage2Stale: boolean;
	restoreStatus: "idle" | "replayable" | "conflicted";
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
		enablePortForward: false,
	},
};

export function toStage1InputPayload(stage1Input: Stage1Input): Stage1InputPayload {
	const { enablePortForward: _enablePortForward, ...advancedOptions } = stage1Input.advancedOptions;

	return {
		landingRawText: stage1Input.landingRawText,
		transitRawText: stage1Input.transitRawText,
		forwardRelayItems: stage1Input.forwardRelayItems,
		advancedOptions,
	};
}

export function hydrateStage1Input(stage1Input: Stage1InputPayload): Stage1Input {
	return {
		...stage1Input,
		advancedOptions: {
			...stage1Input.advancedOptions,
			enablePortForward: stage1Input.forwardRelayItems.length > 0,
		},
	};
}

export const initialAppState: AppState = {
	currentLinkInput: "",
	preferShortUrl: false,
	stage1Input: initialStage1Input,
	stage2Init: null,
	stage2Snapshot: {
		rows: [],
	},
	generatedUrls: null,
	stage2Stale: true,
	restoreStatus: "idle",
	responseOriginStage: null,
	messages: [],
	workflowLog: [],
	blockingErrors: [],
};