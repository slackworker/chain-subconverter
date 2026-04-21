import type { BlockingError, Message, Stage1Input, Stage2Init, Stage2Snapshot } from "../types/api";

export type ResponseOriginStage = "stage1" | "stage2" | "stage3";

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
	blockingErrors: [],
};