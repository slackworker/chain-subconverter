import { createContext, useContext } from "react";

import type { UIScheme } from "./composition";

const UISchemeContext = createContext<UIScheme | null>(null);

export const UISchemeProvider = UISchemeContext.Provider;

export function useUIScheme() {
	const value = useContext(UISchemeContext);
	if (value === null) {
		throw new Error("UISchemeContext is not initialized.");
	}
	return value;
}