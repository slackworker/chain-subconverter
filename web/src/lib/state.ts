import type { BlockingError, Message, Stage1Input, Stage2Init, Stage2Snapshot } from "../types/api";

export interface GeneratedUrls {
	longUrl: string;
	shortUrl: string | null;
	preferShortUrl: boolean;
}

export interface AppState {
	restoreInput: string;
	stage1Input: Stage1Input;
	stage2Init: Stage2Init | null;
	stage2Snapshot: Stage2Snapshot;
	generatedUrls: GeneratedUrls | null;
	stage2Stale: boolean;
	restoreStatus: "idle" | "replayable" | "conflicted";
	messages: Message[];
	blockingErrors: BlockingError[];
}

export const initialStage1Input: Stage1Input = {
	landingRawText: "",
	transitRawText: "",
	forwardRelayRawText: "",
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

export const initialAppState: AppState = {
	restoreInput: "",
	stage1Input: initialStage1Input,
	stage2Init: null,
	stage2Snapshot: {
		rows: [],
	},
	generatedUrls: null,
	stage2Stale: true,
	restoreStatus: "idle",
	messages: [],
	blockingErrors: [],
};