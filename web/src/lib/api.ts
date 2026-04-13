import type {
	ErrorResponse,
	GenerateRequest,
	GenerateResponse,
	ResolveURLResponse,
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

const apiBase = normalizeConfiguredBase(
	window.__CHAIN_SUBCONVERTER_API_BASE__ ??
		import.meta.env.VITE_CHAIN_SUBCONVERTER_API_BASE ??
		import.meta.env.BASE_URL,
);

export interface APIRequestError extends Error {
	status?: number;
	errorBody?: ErrorResponse;
}

async function postJSON<TResponse, TRequest>(path: string, payload: TRequest): Promise<TResponse> {
	const response = await fetch(`${apiBase}${path}`, {
		method: "POST",
		headers: {
			"Content-Type": "application/json",
		},
		body: JSON.stringify(payload),
	});

	if (!response.ok) {
		const errorBody = (await response.json()) as ErrorResponse;
		const error = new Error(errorBody.blockingErrors[0]?.message ?? `request failed with status ${response.status}`) as APIRequestError;
		Object.assign(error, {
			status: response.status,
			errorBody,
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