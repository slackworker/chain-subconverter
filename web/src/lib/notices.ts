import type { ResponseOriginStage } from "./state";
import type { BlockingError, Message } from "../types/api";

type NoticePlacement = "global" | "stage-local";

export interface Stage2StaleNoticeOptions {
	stage2Stale: boolean;
	hasStage2Rows: boolean;
	hasBlockingErrors: boolean;
	isRequestInFlight: boolean;
	isConflictReadonly: boolean;
}

function toArray<T>(value: T | T[]) {
	return Array.isArray(value) ? value : [value];
}

function hasOperationalBlockingErrors(errors: BlockingError[]) {
	return errors.some((error) => error.scope !== "global");
}

export function getPrimaryBlockingErrorsForStage(
	errors: BlockingError[],
	responseOriginStage: ResponseOriginStage | null,
	stage: ResponseOriginStage,
) {
	if (responseOriginStage !== stage || !hasOperationalBlockingErrors(errors)) {
		return [];
	}

	return errors;
}

export function getGlobalPrimaryBlockingErrors(
	errors: BlockingError[],
	responseOriginStage: ResponseOriginStage | null,
	placement: NoticePlacement,
) {
	if (errors.length === 0) {
		return [];
	}
	if (placement === "global") {
		return errors;
	}
	if (responseOriginStage !== null && hasOperationalBlockingErrors(errors)) {
		return [];
	}
	return errors;
}

export function getOriginStageLabel(stage: ResponseOriginStage | null) {
	if (stage === "stage1") {
		return "阶段 1";
	}
	if (stage === "stage2") {
		return "阶段 2";
	}
	if (stage === "stage3") {
		return "阶段 3";
	}
	return undefined;
}

export function getFieldErrors(errors: BlockingError[], field: string) {
	return errors.filter((error) => error.scope === "stage1_field" && error.context?.field === field);
}

export function getStage3FieldErrors(errors: BlockingError[], field: string) {
	return errors.filter((error) => error.scope === "stage3_field" && error.context?.field === field);
}

export function getRowErrors(errors: BlockingError[], landingNodeName: string) {
	return errors.filter((error) => error.scope === "stage2_row" && error.context?.landingNodeName === landingNodeName);
}

export function clearStage1FieldErrors(errors: BlockingError[], fields: string | string[]) {
	const targetFields = new Set(toArray(fields));
	if (targetFields.size === 0) {
		return errors;
	}

	return errors.filter((error) => !(error.scope === "stage1_field" && targetFields.has(String(error.context?.field ?? ""))));
}

export function clearStage2RowErrors(errors: BlockingError[], landingNodeName: string) {
	return errors.filter((error) => !(error.scope === "stage2_row" && error.context?.landingNodeName === landingNodeName));
}

export function clearStage3FieldErrors(errors: BlockingError[], fields: string | string[]) {
	const targetFields = new Set(toArray(fields));
	if (targetFields.size === 0) {
		return errors;
	}

	return errors.filter((error) => !(error.scope === "stage3_field" && targetFields.has(String(error.context?.field ?? ""))));
}

export function clearStage3ActionErrors(errors: BlockingError[]) {
	return errors.filter((error) => error.scope !== "stage3_action");
}

/** 阶段 1 变更使阶段 2 过期时，旧的 stage2 阻断反馈不再有效；若上次请求来源为阶段 2，则整组阻断均为旧快照上下文（见 04-business-rules §4）。 */
export function clearBlockingErrorsSupersededByStage2Stale(
	errors: BlockingError[],
	responseOriginStage: ResponseOriginStage | null,
): BlockingError[] {
	const withoutRow = errors.filter((error) => error.scope !== "stage2_row");
	if (responseOriginStage === "stage2") {
		return [];
	}
	return withoutRow;
}

export function getVisibleMessages(messages: Message[], responseOriginStage: ResponseOriginStage | null, stage?: ResponseOriginStage) {
	if (stage === undefined) {
		return messages;
	}
	if (responseOriginStage === null) {
		return [];
	}

	return responseOriginStage === stage ? messages : [];
}

export function shouldPromoteStage2StaleNotice(options: Stage2StaleNoticeOptions) {
	return options.stage2Stale
		&& options.hasStage2Rows
		&& !options.hasBlockingErrors
		&& !options.isRequestInFlight
		&& !options.isConflictReadonly;
}
