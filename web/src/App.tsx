import { useEffect, useState } from "react";

import { useAppWorkflow } from "./hooks/useAppWorkflow";
import { copyTextToClipboard } from "./lib/clipboard";
import { getRuntimeConfig } from "./lib/api";
import { DEFAULT_TEMPLATE_URL } from "./lib/defaults";
import type { OutputActions } from "./lib/composition";
import type { RuntimeConfigResponse } from "./types/api";
import { useUIScheme } from "./lib/scheme-context";

function withDownloadFlag(urlString: string) {
	try {
		const url = new URL(urlString, window.location.href);
		url.searchParams.set("download", "1");
		return url.toString();
	} catch {
		return urlString;
	}
}

export default function App() {
	const { Page, primaryBlockingFeedbackPlacement } = useUIScheme();
	const workflow = useAppWorkflow();
	const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");
	const [runtimeConfig, setRuntimeConfig] = useState<RuntimeConfigResponse | null>(null);

	useEffect(() => {
		if (copyState === "idle") {
			return undefined;
		}
		const timer = window.setTimeout(() => setCopyState("idle"), 1800);
		return () => window.clearTimeout(timer);
	}, [copyState]);

	useEffect(() => {
		let cancelled = false;
		getRuntimeConfig()
			.then((config) => {
				if (!cancelled) {
					setRuntimeConfig(config);
				}
			})
			.catch(() => {
				if (!cancelled) {
					setRuntimeConfig({ defaultTemplateURL: DEFAULT_TEMPLATE_URL });
				}
			});
		return () => {
			cancelled = true;
		};
	}, []);

	const defaultTemplateURL = runtimeConfig?.defaultTemplateURL;

	useEffect(() => {
		if (defaultTemplateURL === undefined) {
			return;
		}
		workflow.applyDefaultTemplateURL(defaultTemplateURL);
	}, [defaultTemplateURL]);

	const currentLinkValue = workflow.state.currentLinkInput;
	const trimmedCurrentLinkValue = currentLinkValue.trim();

	function openCurrentLink() {
		if (trimmedCurrentLinkValue === "") {
			return;
		}
		window.open(trimmedCurrentLinkValue, "_blank", "noopener,noreferrer");
	}

	async function copyCurrentLink() {
		if (trimmedCurrentLinkValue === "") {
			return;
		}
		const copied = await copyTextToClipboard(trimmedCurrentLinkValue);
		if (copied) {
			setCopyState("done");
		} else {
			setCopyState("failed");
		}
	}

	function downloadCurrentLink() {
		if (trimmedCurrentLinkValue === "") {
			return;
		}
		const anchor = document.createElement("a");
		anchor.href = withDownloadFlag(trimmedCurrentLinkValue);
		anchor.rel = "noopener noreferrer";
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
	}

	const outputActions: OutputActions = {
		copyState,
		openCurrentLink,
		copyCurrentLink,
		downloadCurrentLink,
	};

	return (
		<Page
			workflow={workflow}
			outputActions={outputActions}
			primaryBlockingFeedbackPlacement={primaryBlockingFeedbackPlacement}
			runtimeConfig={runtimeConfig}
		/>
	);
}