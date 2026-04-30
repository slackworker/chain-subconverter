function attemptLegacyCopy(text: string): boolean {
	const textarea = document.createElement("textarea");
	textarea.value = text;
	textarea.setAttribute("readonly", "");
	textarea.style.position = "fixed";
	textarea.style.top = "0";
	textarea.style.left = "-9999px";
	textarea.style.opacity = "0";

	const selection = document.getSelection();
	const savedRange = selection && selection.rangeCount > 0 ? selection.getRangeAt(0) : null;
	const activeElement = document.activeElement instanceof HTMLElement ? document.activeElement : null;

	document.body.appendChild(textarea);
	textarea.focus();
	textarea.select();
	textarea.setSelectionRange(0, textarea.value.length);

	let copied = false;
	try {
		copied = document.execCommand("copy");
	} catch {
		copied = false;
	}

	document.body.removeChild(textarea);

	if (savedRange && selection) {
		selection.removeAllRanges();
		selection.addRange(savedRange);
	}
	activeElement?.focus();

	return copied;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
	if (text === "") {
		return false;
	}

	if (typeof navigator !== "undefined" && navigator.clipboard && navigator.clipboard.writeText) {
		try {
			await navigator.clipboard.writeText(text);
			return true;
		} catch {
			// Continue with legacy fallback for browsers or contexts that deny async clipboard API.
		}
	}

	if (typeof document === "undefined") {
		return false;
	}

	return attemptLegacyCopy(text);
}