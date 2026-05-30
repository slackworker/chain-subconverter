/** Browser-side diagnostics; only emitted in dev builds or when debug logging is enabled. */
export function debugLog(event: string, detail?: unknown) {
	if (!import.meta.env.DEV) {
		return;
	}
	if (detail === undefined) {
		console.info(`[chain-subconverter] ${event}`);
		return;
	}
	console.info(`[chain-subconverter] ${event}`, detail);
}

export function debugWarn(event: string, detail?: unknown) {
	if (!import.meta.env.DEV) {
		return;
	}
	if (detail === undefined) {
		console.warn(`[chain-subconverter] ${event}`);
		return;
	}
	console.warn(`[chain-subconverter] ${event}`, detail);
}

export function debugError(event: string, detail?: unknown) {
	if (!import.meta.env.DEV) {
		return;
	}
	if (detail === undefined) {
		console.error(`[chain-subconverter] ${event}`);
		return;
	}
	console.error(`[chain-subconverter] ${event}`, detail);
}
