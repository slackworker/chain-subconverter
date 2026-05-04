import type { Stage1Input } from "../types/api";

export interface ManualSocks5FormState {
	name: string;
	server: string;
	port: string;
	username: string;
	password: string;
}

export const initialManualSocks5FormState: ManualSocks5FormState = {
	name: "",
	server: "",
	port: "",
	username: "",
	password: "",
};

const SUPPORTED_SOCKS5_URI_PROTOCOLS = new Set(["socks5:", "socks5h:"]);

function isStrictIPv4Literal(server: string) {
	if (server === "") {
		return false;
	}
	for (const char of server) {
		if ((char < "0" || char > "9") && char !== ".") {
			return false;
		}
	}
	const parts = server.split(".");
	if (parts.length !== 4) {
		return false;
	}
	for (const part of parts) {
		if (part === "") {
			return false;
		}
		if (part.length > 1 && part.startsWith("0")) {
			return false;
		}
		const value = Number(part);
		if (!Number.isInteger(value) || value < 0 || value > 255) {
			return false;
		}
	}
	return true;
}

function isDigitsAndDots(server: string) {
	if (server === "") {
		return false;
	}
	for (const char of server) {
		if ((char < "0" || char > "9") && char !== ".") {
			return false;
		}
	}
	return true;
}

function isValidASCIIHostname(server: string) {
	if (server.length === 0 || server.length > 253 || !server.includes(".")) {
		return false;
	}
	for (const char of server) {
		if (char.charCodeAt(0) > 127) {
			return false;
		}
	}
	const labels = server.split(".");
	for (const label of labels) {
		if (label.length === 0 || label.length > 63) {
			return false;
		}
		if (label.startsWith("-") || label.endsWith("-")) {
			return false;
		}
		for (const char of label) {
			const isLetter = (char >= "a" && char <= "z") || (char >= "A" && char <= "Z");
			const isDigit = char >= "0" && char <= "9";
			if (!isLetter && !isDigit && char !== "-") {
				return false;
			}
		}
	}
	return true;
}

function appendMultilineLine(currentValue: string, nextLine: string) {
	if (currentValue === "") {
		return nextLine;
	}
	return currentValue.endsWith("\n") ? `${currentValue}${nextLine}` : `${currentValue}\n${nextLine}`;
}

function buildTelegramSocksURI(name: string, server: string, port: number, username: string, password: string) {
	const params = new URLSearchParams({
		server,
		port: String(port),
		remarks: name,
	});

	if (username !== "") {
		params.set("user", username);
		params.set("pass", password);
	}

	return `tg://socks?${params.toString()}`;
}

function decodeURLComponentIfNeeded(value: string) {
	return value === "" ? "" : decodeURIComponent(value);
}

export function normalizeServerAddress(serverText: string, fieldLabel = "服务器地址") {
	const server = serverText.trim();
	if (server === "") {
		throw new Error(`${fieldLabel}不能为空`);
	}
	if (isStrictIPv4Literal(server)) {
		return server;
	}
	if (isDigitsAndDots(server) || !isValidASCIIHostname(server)) {
		throw new Error(`${fieldLabel}必须是有效的 IPv4 或 ASCII 域名`);
	}
	return server.toLowerCase();
}

export function normalizePortValue(portText: string, fieldLabel = "端口") {
	const trimmedPort = portText.trim();
	if (!/^\d+$/.test(trimmedPort)) {
		throw new Error(`${fieldLabel}必须是 1-65535 的整数`);
	}

	const port = Number(trimmedPort);
	if (!Number.isInteger(port) || port < 1 || port > 65535) {
		throw new Error(`${fieldLabel}必须是 1-65535 的整数`);
	}
	return String(port);
}

export function normalizeForwardRelayItem(draft: string) {
	if (draft === "") {
		throw new Error("端口转发服务不能为空");
	}
	if (draft !== draft.trim()) {
		throw new Error("端口转发服务不能包含首尾空白");
	}
	if (draft.split(":").length !== 2) {
		throw new Error("端口转发服务必须是 server:port 格式");
	}

	const [server, portText] = draft.split(":");
	if (server === "" || portText === "") {
		throw new Error("端口转发服务必须是 server:port 格式");
	}

	const normalizedServer = normalizeServerAddress(server, "端口转发服务器地址");
	const normalizedPort = normalizePortValue(portText, "端口转发端口");
	return `${normalizedServer}:${normalizedPort}`;
}

export function parseSocks5URIToManualSocks5FormState(rawURI: string): ManualSocks5FormState {
	const trimmedURI = rawURI.trim();
	if (trimmedURI === "") {
		throw new Error("SOCKS5 URI 不能为空");
	}

	let parsedURL: URL;
	try {
		parsedURL = new URL(trimmedURI);
	} catch {
		throw new Error("SOCKS5 URI 格式不正确");
	}

	if (!SUPPORTED_SOCKS5_URI_PROTOCOLS.has(parsedURL.protocol)) {
		throw new Error("仅支持 socks5:// 或 socks5h:// URI");
	}
	if (parsedURL.hostname === "") {
		throw new Error("SOCKS5 URI 缺少服务器地址");
	}
	if (parsedURL.port === "") {
		throw new Error("SOCKS5 URI 缺少端口");
	}
	if ((parsedURL.username === "") !== (parsedURL.password === "")) {
		throw new Error("SOCKS5 URI 中的用户名与密码必须同时存在");
	}
	if (parsedURL.pathname !== "" && parsedURL.pathname !== "/") {
		throw new Error("SOCKS5 URI 不支持附加路径");
	}

	normalizeServerAddress(parsedURL.hostname, "SOCKS5 服务器地址");
	normalizePortValue(parsedURL.port, "SOCKS5 端口");

	const name = decodeURLComponentIfNeeded(parsedURL.hash.slice(1)) || `${parsedURL.hostname}:${parsedURL.port}`;
	return {
		name,
		server: parsedURL.hostname,
		port: parsedURL.port,
		username: decodeURLComponentIfNeeded(parsedURL.username),
		password: decodeURLComponentIfNeeded(parsedURL.password),
	};
}

export function buildManualSocks5URI(formState: ManualSocks5FormState) {
	const name = formState.name.trim();
	const username = formState.username.trim();
	const password = formState.password.trim();

	if (name === "") {
		throw new Error("SOCKS5 节点名称不能为空");
	}
	const server = normalizeServerAddress(formState.server, "SOCKS5 服务器地址");
	const port = Number(normalizePortValue(formState.port, "SOCKS5 端口"));
	if ((username === "") !== (password === "")) {
		throw new Error("用户名与密码必须同时填写或同时留空");
	}

	return buildTelegramSocksURI(name, server, port, username, password);
}

export function appendManualSocks5ToStage1Input(stage1Input: Stage1Input, formState: ManualSocks5FormState): Stage1Input {
	return {
		...stage1Input,
		landingRawText: appendMultilineLine(stage1Input.landingRawText, buildManualSocks5URI(formState)),
	};
}

export function addForwardRelayItem(stage1Input: Stage1Input, draft: string): Stage1Input {
	if (draft === "") {
		return stage1Input;
	}
	const normalizedDraft = normalizeForwardRelayItem(draft);
	if (stage1Input.forwardRelayItems.includes(normalizedDraft)) {
		throw new Error(`端口转发服务 ${normalizedDraft} 已存在`);
	}

	return {
		...stage1Input,
		forwardRelayItems: [...stage1Input.forwardRelayItems, normalizedDraft],
	};
}

export function appendForwardRelayItems(stage1Input: Stage1Input, drafts: readonly string[]): Stage1Input {
	return drafts.reduce((current, draft) => addForwardRelayItem(current, draft), stage1Input);
}

export function removeForwardRelayItem(stage1Input: Stage1Input, index: number): Stage1Input {
	return {
		...stage1Input,
		forwardRelayItems: stage1Input.forwardRelayItems.filter((_, itemIndex) => itemIndex !== index),
	};
}

export function setPortForwardEnabled(stage1Input: Stage1Input, enabled: boolean): Stage1Input {
	return {
		...stage1Input,
		forwardRelayItems: enabled ? stage1Input.forwardRelayItems : [],
		advancedOptions: {
			...stage1Input.advancedOptions,
			enablePortForward: enabled,
		},
	};
}