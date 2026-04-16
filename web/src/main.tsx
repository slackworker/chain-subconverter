import React from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./index.css";
import { UISchemeProvider } from "./lib/scheme-context";
import { resolveUIScheme } from "./scheme";

const uiScheme = resolveUIScheme(import.meta.env.VITE_CHAIN_SUBCONVERTER_UI_SCHEME);

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<UISchemeProvider value={uiScheme}>
			<App />
		</UISchemeProvider>
	</React.StrictMode>,
);