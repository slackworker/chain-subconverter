import { useEffect, useState } from "react";

import { useAppWorkflow } from "./hooks/useAppWorkflow";
import type { OutputActions } from "./lib/composition";
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
	const { Page } = useUIScheme();
	const workflow = useAppWorkflow();
	const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");

	useEffect(() => {
		if (copyState === "idle") {
			return undefined;
		}
		const timer = window.setTimeout(() => setCopyState("idle"), 1800);
		return () => window.clearTimeout(timer);
	}, [copyState]);

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
		try {
			await navigator.clipboard.writeText(trimmedCurrentLinkValue);
			setCopyState("done");
		} catch {
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

	return <Page workflow={workflow} outputActions={outputActions} />;
}