import type { BlockingError } from "../types/api";

export function getGlobalErrors(errors: BlockingError[]) {
	return errors.filter((error) => error.scope === "global");
}

export function getFieldErrors(errors: BlockingError[], field: string) {
	return errors.filter((error) => error.scope === "stage1_field" && error.context?.field === field);
}

export function getRowErrors(errors: BlockingError[], landingNodeName: string) {
	return errors.filter((error) => error.scope === "stage2_row" && error.context?.landingNodeName === landingNodeName);
}