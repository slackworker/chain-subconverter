import type { UIScheme } from "../lib/composition";
import { aUIScheme } from "./a";
import { bUIScheme } from "./b";
import { cUIScheme } from "./c";

const fallbackUIScheme = aUIScheme;
const orderedSchemes = [aUIScheme, bUIScheme, cUIScheme];
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
	const relativePathname = getRelativePathname(pathname, basePath);
	const segments = relativePathname.split("/").filter(Boolean);
	const requestedSchemeName = segments[0] === "ui" && segments[1] ? segments[1] : fallbackName;
	const scheme = resolveUIScheme(requestedSchemeName);

	return {
		scheme,
		canonicalPath: getUISchemePath(scheme.id, basePath),
	};
}