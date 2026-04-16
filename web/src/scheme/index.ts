import type { UIScheme } from "../lib/composition";
import { defaultUIScheme } from "./default";
import { plainUIScheme } from "./plain";

const schemes: Record<string, UIScheme> = {
	default: defaultUIScheme,
	plain: plainUIScheme,
};

export function resolveUIScheme(name: string | undefined): UIScheme {
	if (name === undefined) {
		return defaultUIScheme;
	}

	return schemes[name] ?? defaultUIScheme;
}