import React, { useEffect, useMemo, useState } from "react";
import ReactDOM from "react-dom/client";

import App from "./App";
import "./global.css";
import { UISchemeProvider } from "./lib/scheme-context";
import type { UIScheme } from "./lib/composition";
import { resolveLoadedUIScheme, resolveUISchemeRoute } from "./scheme";

function SchemeRoot() {
	const fallbackSchemeName = import.meta.env.VITE_CHAIN_SUBCONVERTER_UI_SCHEME;
	const basePath = import.meta.env.BASE_URL;
	const [pathname, setPathname] = useState(() => window.location.pathname);
	const [resolvedScheme, setResolvedScheme] = useState<UIScheme | null>(null);
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

	useEffect(() => {
		let cancelled = false;
		setResolvedScheme((current) => (current?.id === route.scheme.id ? current : null));
		resolveLoadedUIScheme(route.scheme.id).then((scheme) => {
			if (!cancelled) {
				setResolvedScheme(scheme);
			}
		});
		return () => {
			cancelled = true;
		};
	}, [route.scheme.id]);

	if (resolvedScheme === null || resolvedScheme.id !== route.scheme.id) {
		return null;
	}

	return (
		<UISchemeProvider value={resolvedScheme}>
			<App />
		</UISchemeProvider>
	);
}

ReactDOM.createRoot(document.getElementById("root")!).render(
	<React.StrictMode>
		<SchemeRoot />
	</React.StrictMode>,
);