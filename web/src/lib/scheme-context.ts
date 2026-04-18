import { createContext, useContext } from "react";

import type { UIScheme } from "./composition";
import { aUIScheme } from "../scheme/a";

const UISchemeContext = createContext<UIScheme>(aUIScheme);

export const UISchemeProvider = UISchemeContext.Provider;

export function useUIScheme() {
	return useContext(UISchemeContext);
}