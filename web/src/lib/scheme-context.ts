import { createContext, useContext } from "react";

import type { UIScheme } from "./composition";
import { defaultUIScheme } from "../scheme/default";

const UISchemeContext = createContext<UIScheme>(defaultUIScheme);

export const UISchemeProvider = UISchemeContext.Provider;

export function useUIScheme() {
	return useContext(UISchemeContext);
}