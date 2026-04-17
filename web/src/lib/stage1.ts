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

function appendMultilineLine(currentValue: string, nextLine: string) {
	if (currentValue === "") {
		return nextLine;
	}
	return currentValue.endsWith("\n") ? `${currentValue}${nextLine}` : `${currentValue}\n${nextLine}`;
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

	const credentials = username === "" ? "" : `${encodeURIComponent(username)}:${encodeURIComponent(password)}@`;
	return `socks5://${credentials}${server}:${port}#${encodeURIComponent(name)}`;
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