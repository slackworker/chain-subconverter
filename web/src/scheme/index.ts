import type { UIScheme } from "../lib/composition";
import { defaultUIScheme } from "./default";
import { aUIScheme } from "./a";
import { bUIScheme } from "./b";
import { cUIScheme } from "./c";

const fallbackUIScheme = defaultUIScheme;
const orderedSchemes = [defaultUIScheme, aUIScheme, bUIScheme, cUIScheme];
const schemes: Record<string, UIScheme> = Object.fromEntries(orderedSchemes.map((scheme) => [scheme.id, scheme]));

function normalizeBasePath(basePath: string | undefined) {
	const trimmedValue = basePath?.trim() ?? "";
	if (trimmedValue === "" || trimmedValue === "/") {
		return "";
	}
	const withLeadingSlash = trimmedValue.startsWith("/") ? trimmedValue : `/${trimmedValue}`;
	return withLeadingSlash.replace(/\/+$/, "");
}

function getRelativePathname(pathname: string, basePath: string | undefined) {
	const normalizedBasePath = normalizeBasePath(basePath);
	if (normalizedBasePath !== "" && pathname.startsWith(normalizedBasePath)) {
		return pathname.slice(normalizedBasePath.length);
	}
	return pathname;
}

export function getUISchemes() {
	return orderedSchemes;
}

export function resolveUIScheme(name: string | undefined): UIScheme {
	if (name === undefined) {
		return fallbackUIScheme;
	}

	return schemes[name] ?? fallbackUIScheme;
}

export function getUISchemePath(name: string, basePath: string | undefined) {
	const normalizedBasePath = normalizeBasePath(basePath);
	const resolvedScheme = resolveUIScheme(name);
	return normalizedBasePath === "" ? `/ui/${resolvedScheme.id}` : `${normalizedBasePath}/ui/${resolvedScheme.id}`;
}

export function resolveUISchemeRoute(pathname: string, basePath: string | undefined, fallbackName: string | undefined) {
	const normalizedBasePath = normalizeBasePath(basePath);
	const relativePathname = getRelativePathname(pathname, basePath);
	const segments = relativePathname.split("/").filter(Boolean);

	// 根路径保持原 URL（不强制规范化到 /ui/<scheme>），但仍按默认 scheme 渲染
	if (segments.length === 0) {
		const scheme = resolveUIScheme(fallbackName);
		const canonicalRoot = normalizedBasePath === "" ? "/" : `${normalizedBasePath}/`;
		return { scheme, canonicalPath: canonicalRoot };
	}

	const requestedSchemeName = segments[0] === "ui" && segments[1] ? segments[1] : fallbackName;
	const scheme = resolveUIScheme(requestedSchemeName);

	return {
		scheme,
		canonicalPath: getUISchemePath(scheme.id, basePath),
	};
}