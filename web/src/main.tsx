import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import { UISchemeProvider } from "./lib/scheme-context";
import { resolveUISchemeRoute } from "./scheme";

function SchemeRoot() {
	const fallbackSchemeName = import.meta.env.VITE_CHAIN_SUBCONVERTER_UI_SCHEME;
	const basePath = import.meta.env.BASE_URL;
	const [pathname, setPathname] = useState(() => window.location.pathname);
	const route = useMemo(() => resolveUISchemeRoute(pathname, basePath, fallbackSchemeName), [pathname, basePath, fallbackSchemeName]);

	useEffect(() => {
		const handlePopState = () => setPathname(window.location.pathname);
		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, []);

	useEffect(() => {
		if (window.location.pathname === route.canonicalPath) {
			return;
		}
		const nextURL = `${route.canonicalPath}${window.location.search}${window.location.hash}`;
		window.history.replaceState({}, "", nextURL);
		setPathname(route.canonicalPath);
	}, [route.canonicalPath]);

	return (
		<UISchemeProvider value={route.scheme}>
			<App />
		</UISchemeProvider>
	);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<SchemeRoot />
	</React.StrictMode>,
);