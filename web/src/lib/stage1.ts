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
	const server = formState.server.trim();
	const portText = formState.port.trim();
	const username = formState.username.trim();
	const password = formState.password.trim();

	if (name === "") {
		throw new Error("SOCKS5 节点名称不能为空");
	}
	if (server === "") {
		throw new Error("SOCKS5 服务器地址不能为空");
	}
	if (!/^\d+$/.test(portText)) {
		throw new Error("SOCKS5 端口必须是 1-65535 的整数");
	}

	const port = Number(portText);
	if (port < 1 || port > 65535) {
		throw new Error("SOCKS5 端口必须是 1-65535 的整数");
	}
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

	return {
		...stage1Input,
		forwardRelayItems: [...stage1Input.forwardRelayItems, draft],
	};
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