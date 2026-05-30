import type { ResponseOriginStage, WorkflowLogEntry, WorkflowLogLevel } from "./state";
import type { Message } from "../types/api";
import { type WorkflowEventCode, WORKFLOW_EVENTS } from "./workflow-log-events";

export const MAX_WORKFLOW_LOG_ENTRIES = 200;

const ROUTINE_SUCCESS_CODES = new Set<string>([
	"STAGE1_CONVERT_SUCCEEDED",
	"RESTORE_SUCCEEDED",
	"GENERATE_SUCCEEDED",
	"SHORT_URL_READY",
]);

const INTERACTION_EVENT_CODES = new Set<string>([
	"OPEN_PREVIEW",
	"COPY_LINK_SUCCEEDED",
	"DOWNLOAD_YAML",
]);

let workflowLogSequence = 0;

function nextWorkflowLogID() {
	workflowLogSequence += 1;
	return `workflow-log-${Date.now()}-${workflowLogSequence}`;
}

export function buildWorkflowLogEntry(
	level: WorkflowLogLevel,
	code: string,
	message: string,
	source: WorkflowLogEntry["source"],
	originStage: ResponseOriginStage | null,
	kind: WorkflowLogEntry["kind"] = "entry",
): WorkflowLogEntry {
	return {
		id: nextWorkflowLogID(),
		createdAt: new Date().toISOString(),
		level,
		code,
		message,
		source,
		originStage,
		kind,
	};
}

export function workflowActionSeparator(code: WorkflowEventCode): WorkflowLogEntry {
	const event = WORKFLOW_EVENTS[code];
	return buildWorkflowLogEntry("info", code, event.message, "frontend", event.originStage, "separator");
}

export function shouldPersistWorkflowEvent(code: string) {
	if (code.endsWith("_STARTED")) {
		return false;
	}
	if (ROUTINE_SUCCESS_CODES.has(code as WorkflowEventCode)) {
		return false;
	}
	if (INTERACTION_EVENT_CODES.has(code as WorkflowEventCode)) {
		return false;
	}
	return true;
}

function normalizeLogText(value: string) {
	return value.trim().replace(/\s+/g, " ");
}

function isDuplicateWorkflowEntry(existing: WorkflowLogEntry, candidate: WorkflowLogEntry) {
	if (existing.code === "RESTORE_CONFLICT" && candidate.code === "RESTORE_CONFLICTED") {
		return true;
	}
	if (existing.code !== candidate.code) {
		return false;
	}
	if (existing.kind === "separator" || candidate.kind === "separator") {
		return false;
	}
	if (existing.source === candidate.source && normalizeLogText(existing.message) === normalizeLogText(candidate.message)) {
		return true;
	}
	if (candidate.code.endsWith("_FAILED") && existing.code.endsWith("_FAILED")) {
		return existing.originStage === candidate.originStage;
	}

	return false;
}

export function appendWorkflowLogEntries(current: WorkflowLogEntry[], entries: WorkflowLogEntry[]) {
	const filtered = entries.filter((entry) => shouldPersistWorkflowEvent(entry.code));
	if (filtered.length === 0) {
		return current;
	}

	const next = [...current];
	for (const entry of filtered) {
		if (next.some((existing) => isDuplicateWorkflowEntry(existing, entry))) {
			continue;
		}
		next.push(entry);
	}

	return next.length > MAX_WORKFLOW_LOG_ENTRIES ? next.slice(-MAX_WORKFLOW_LOG_ENTRIES) : next;
}

export function backendMessagesToWorkflowLog(messages: Message[], originStage: ResponseOriginStage | null) {
	return messages.map((message) => buildWorkflowLogEntry(message.level, message.code, message.message, "backend", originStage));
}

export function frontendWorkflowEvent(code: WorkflowEventCode): WorkflowLogEntry {
	const event = WORKFLOW_EVENTS[code];
	return buildWorkflowLogEntry(event.level, code, event.message, "frontend", event.originStage);
}

export function frontendWorkflowFailureEvent(
	code: WorkflowEventCode,
	detail: string,
	originStage: ResponseOriginStage | null = WORKFLOW_EVENTS[code].originStage,
): WorkflowLogEntry {
	const event = WORKFLOW_EVENTS[code];
	const prefix = event.message.endsWith("。") || event.message.endsWith("？")
		? event.message.slice(0, -1)
		: event.message;
	const message = detail.trim() === "" ? `${prefix}。` : `${prefix}：${detail}`;
	return buildWorkflowLogEntry(event.level, code, message, "frontend", originStage);
}

export function resetWorkflowLogSequenceForTests() {
	workflowLogSequence = 0;
}
