import { useEffect, useState } from "react";

import { useAppWorkflow } from "./hooks/useAppWorkflow";
import { copyTextToClipboard } from "./lib/clipboard";
import { getRuntimeConfig } from "./lib/api";
import { DEFAULT_TEMPLATE_URL } from "./lib/defaults";
import type { OutputActions } from "./lib/composition";
import type { RuntimeConfigResponse } from "./types/api";
import { useUIScheme } from "./lib/scheme-context";

const INVALID_CURRENT_LINK_MESSAGE = "请输入完整的 HTTP(S) 订阅链接后再打开或下载。";

function getConsumableHTTPURL(urlString: string) {
	try {
		const url = new URL(urlString);
		if (url.protocol !== "http:" && url.protocol !== "https:") {
			return null;
		}
		return url;
	} catch {
		return null;
	}
}

function withDownloadFlag(urlString: string) {
	const url = getConsumableHTTPURL(urlString);
	if (url === null) {
		return null;
	}
	url.searchParams.set("download", "1");
	return url.toString();
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
		const url = getConsumableHTTPURL(trimmedCurrentLinkValue);
		if (url === null) {
			workflow.reportCurrentLinkInputError(INVALID_CURRENT_LINK_MESSAGE, "打开预览");
			return;
		}
		window.open(url.toString(), "_blank", "noopener,noreferrer");
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
		const downloadURL = withDownloadFlag(trimmedCurrentLinkValue);
		if (downloadURL === null) {
			workflow.reportCurrentLinkInputError(INVALID_CURRENT_LINK_MESSAGE, "下载 YAML");
			return;
		}
		const anchor = document.createElement("a");
		anchor.href = downloadURL;
		anchor.download = "subscription.yaml";
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