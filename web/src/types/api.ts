export type MessageLevel = "info" | "warning";

export interface Message {
	level: MessageLevel;
	code: string;
	message: string;
	context?: Record<string, unknown>;
}

export type BlockingErrorScope = "global" | "stage1_field" | "stage2_row";

export interface BlockingError {
	code: string;
	message: string;
	scope: BlockingErrorScope;
	context?: Record<string, unknown>;
	retryable?: boolean;
}

export interface AdvancedOptions {
	emoji: boolean | null;
	udp: boolean | null;
	skipCertVerify: boolean | null;
	config: string | null;
	include: string[] | null;
	exclude: string[] | null;
	enablePortForward: boolean;
}

export interface Stage1Input {
	landingRawText: string;
	transitRawText: string;
	forwardRelayItems: string[];
	advancedOptions: AdvancedOptions;
}

export interface RestrictedMode {
	reasonCode: string;
	reasonText: string;
}

export interface Stage2Row {
	landingNodeName: string;
	mode: "none" | "chain" | "port_forward";
	targetName: string | null;
}

export interface Stage2InitRow extends Stage2Row {
	landingNodeType: string;
	restrictedModes?: Partial<Record<"none" | "chain" | "port_forward", RestrictedMode>>;
}

export interface ChainTarget {
	name: string;
	kind: "proxy-groups" | "proxies";
	isEmpty?: boolean;
}

export interface ForwardRelay {
	name: string;
}

export interface Stage2Init {
	availableModes: Array<"none" | "chain" | "port_forward">;
	chainTargets: ChainTarget[];
	forwardRelays: ForwardRelay[];
	rows: Stage2InitRow[];
}

export interface Stage2Snapshot {
	rows: Stage2Row[];
}

export interface Stage1ConvertRequest {
	stage1Input: Stage1Input;
}

export interface Stage1ConvertResponse {
	stage2Init: Stage2Init;
	messages: Message[];
	blockingErrors: BlockingError[];
}

export interface GenerateRequest {
	stage1Input: Stage1Input;
	stage2Snapshot: Stage2Snapshot;
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
	stage1Input: Stage1Input;
	stage2Snapshot: Stage2Snapshot;
	messages: Message[];
	blockingErrors: BlockingError[];
}

export interface ErrorResponse {
	messages: Message[];
	blockingErrors: BlockingError[];
}