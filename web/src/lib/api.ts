import type {
	ErrorResponse,
	GenerateRequest,
	GenerateResponse,
	ResolveURLResponse,
	RuntimeConfigResponse,
	ShortLinkResponse,
	Stage1ConvertRequest,
	Stage1ConvertResponse,
} from "../types/api";

function normalizeConfiguredBase(value: string | undefined): string {
	const trimmedValue = value?.trim() ?? "";
	if (trimmedValue === "" || trimmedValue === "/") {
		return "";
	}
	if (/^https?:\/\//i.test(trimmedValue)) {
		return trimmedValue.replace(/\/+$/, "");
	}
	const withLeadingSlash = trimmedValue.startsWith("/") ? trimmedValue : `/${trimmedValue}`;
	return withLeadingSlash.replace(/\/+$/, "");
}

function shouldFallbackToSameOriginProxy(configuredBase: string): boolean {
	if (!/^https?:\/\//i.test(configuredBase)) {
		return false;
	}

	try {
		const configuredURL = new URL(configuredBase);
		const currentURL = new URL(window.location.href);
		const isLocalHost =
			(configuredURL.hostname === "localhost" || configuredURL.hostname === "127.0.0.1") &&
			(currentURL.hostname === "localhost" || currentURL.hostname === "127.0.0.1");
		return isLocalHost && configuredURL.port !== currentURL.port;
	} catch {
		return false;
	}
}

function resolveApiBase(): string {
	const configuredBase = normalizeConfiguredBase(
		window.__CHAIN_SUBCONVERTER_API_BASE__ ??
			import.meta.env.VITE_CHAIN_SUBCONVERTER_API_BASE ??
			import.meta.env.BASE_URL,
	);
	if (!shouldFallbackToSameOriginProxy(configuredBase)) {
		return configuredBase;
	}
	return "";
}

const apiBase = resolveApiBase();

export interface APIRequestError extends Error {
	status?: number;
	errorBody?: ErrorResponse;
	requestPath?: string;
}

async function readErrorResponse(response: Response): Promise<ErrorResponse | undefined> {
	const responseText = await response.text();
	if (responseText.trim() === "") {
		return undefined;
	}

	try {
		return JSON.parse(responseText) as ErrorResponse;
	} catch {
		return undefined;
	}
}

async function postJSON<TResponse, TRequest>(path: string, payload: TRequest): Promise<TResponse> {
	let response: Response;
	try {
		response = await fetch(`${apiBase}${path}`, {
			method: "POST",
			headers: {
				"Content-Type": "application/json",
			},
			body: JSON.stringify(payload),
		});
	} catch (error) {
		const requestError = new Error(error instanceof Error ? error.message : "请求失败") as APIRequestError;
		Object.assign(requestError, {
			requestPath: path,
		});
		throw requestError;
	}

	if (!response.ok) {
		const errorBody = await readErrorResponse(response);
		const error = new Error(errorBody?.blockingErrors[0]?.message ?? `request failed with status ${response.status}`) as APIRequestError;
		Object.assign(error, {
			status: response.status,
			errorBody,
			requestPath: path,
		});
		throw error;
	}

	return (await response.json()) as TResponse;
}

async function getJSON<TResponse>(path: string): Promise<TResponse> {
	let response: Response;
	try {
		response = await fetch(`${apiBase}${path}`, {
			method: "GET",
		});
	} catch (error) {
		const requestError = new Error(error instanceof Error ? error.message : "请求失败") as APIRequestError;
		Object.assign(requestError, {
			requestPath: path,
		});
		throw requestError;
	}

	if (!response.ok) {
		const errorBody = await readErrorResponse(response);
		const error = new Error(errorBody?.blockingErrors[0]?.message ?? `request failed with status ${response.status}`) as APIRequestError;
		Object.assign(error, {
			status: response.status,
			errorBody,
			requestPath: path,
		});
		throw error;
	}

	return (await response.json()) as TResponse;
}

export function getErrorResponse(error: unknown): ErrorResponse | null {
	if (typeof error !== "object" || error === null) {
		return null;
	}
	const maybeError = error as APIRequestError;
	return maybeError.errorBody ?? null;
}

export function postStage1Convert(payload: Stage1ConvertRequest) {
	return postJSON<Stage1ConvertResponse, Stage1ConvertRequest>("/api/stage1/convert", payload);
}

export function postGenerate(payload: GenerateRequest) {
	return postJSON<GenerateResponse, GenerateRequest>("/api/generate", payload);
}

export function postResolveURL(url: string) {
	return postJSON<ResolveURLResponse, { url: string }>("/api/resolve-url", { url });
}

export function postShortLink(longUrl: string) {
	return postJSON<ShortLinkResponse, { longUrl: string }>("/api/short-links", { longUrl });
}

export function getRuntimeConfig() {
	return getJSON<RuntimeConfigResponse>("/api/runtime-config");
}