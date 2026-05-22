function normalizeNewlines(value) {
	return value.replace(/\r\n/g, "\n");
}

function trimTrailingNewline(value) {
	return value.replace(/[\n]+$/, "");
}

export function nonEmptyLines(value) {
	return trimTrailingNewline(normalizeNewlines(value))
		.split("\n")
		.map((line) => line.trim())
		.filter((line) => line !== "");
}

function normalizeStringList(items) {
	return (items ?? []).map((item) => item.trim()).filter((item) => item !== "");
}

function buildManualSocksGeneratedURIs(manualSocksItems, sourceLabel = "manualSocks5Items") {
	return (manualSocksItems ?? [])
		.map((item, index) => {
			if (typeof item?.generatedURI !== "string" || item.generatedURI.trim() === "") {
				throw new Error(`${sourceLabel}[${index}] is missing generatedURI`);
			}
			return item.generatedURI.trim();
		})
		.filter((item) => item !== "");
}

export function buildLandingURILines(stage1Input) {
	return normalizeStringList(stage1Input?.landingItems);
}

export function buildLandingURILinesWithManualSocks(
	stage1Input,
	sourceLabel = "stage1Input.manualSocks5Items",
) {
	return [
		...buildLandingURILines(stage1Input),
		...buildManualSocksGeneratedURIs(stage1Input?.manualSocks5Items, sourceLabel),
	];
}

function normalizeBase64(value) {
	const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
	const padding = normalized.length % 4;
	if (padding === 0) {
		return normalized;
	}
	return normalized.padEnd(normalized.length + (4 - padding), "=");
}

function decodeBase64URL(value) {
	return Buffer.from(normalizeBase64(value), "base64").toString("utf8");
}

function decodeName(hash) {
	if (!hash) {
		return "";
	}
	return decodeURIComponent(hash.replace(/^#/, ""));
}

function splitTopLevel(input) {
	const parts = [];
	let current = "";
	let depth = 0;
	for (let index = 0; index < input.length; index += 1) {
		const char = input[index];
		if (char === "{") {
			depth += 1;
		}
		if (char === "}") {
			depth -= 1;
		}
		if (char === "," && depth === 0) {
			parts.push(current.trim());
			current = "";
			continue;
		}
		current += char;
	}
	if (current.trim() !== "") {
		parts.push(current.trim());
	}
	return parts;
}

function parseInlineMap(raw) {
	const content = raw.trim().replace(/^\{/, "").replace(/\}$/, "");
	const result = {};
	for (const part of splitTopLevel(content)) {
		const separatorIndex = part.indexOf(":");
		if (separatorIndex === -1) {
			continue;
		}
		const key = part.slice(0, separatorIndex).trim().replace(/^"|"$/g, "");
		const value = part.slice(separatorIndex + 1).trim();
		if (value.startsWith("{") && value.endsWith("}")) {
			result[key] = parseInlineMap(value);
			continue;
		}
		result[key] = value.replace(/^"|"$/g, "");
	}
	return result;
}

function parseURL(rawLine) {
	return new URL(rawLine);
}

function buildWSOptions(url) {
	const pathValue = url.searchParams.get("path");
	const host = url.searchParams.get("host");
	const wsOptions = {};
	if (pathValue) {
		wsOptions.path = pathValue;
	}
	if (host) {
		wsOptions.headers = { Host: host };
	}
	return Object.keys(wsOptions).length === 0 ? undefined : wsOptions;
}

function parseSSURI(rawLine) {
	const url = parseURL(rawLine);
	let method = "";
	let password = "";
	if (url.username && !url.password) {
		const decodedUserInfo = decodeBase64URL(decodeURIComponent(url.username));
		const separatorIndex = decodedUserInfo.indexOf(":");
		if (separatorIndex === -1) {
			return {
				name: decodeName(url.hash),
				type: "ss",
				server: url.hostname,
				port: Number(url.port),
			};
		}
		method = decodedUserInfo.slice(0, separatorIndex);
		password = decodedUserInfo.slice(separatorIndex + 1);
	} else {
		method = decodeURIComponent(url.username);
		password = decodeURIComponent(url.password);
	}
	return {
		name: decodeName(url.hash),
		type: "ss",
		server: url.hostname,
		port: Number(url.port),
		cipher: method,
		password,
	};
}

function parseTrojanURI(rawLine) {
	const url = parseURL(rawLine);
	const proxy = {
		name: decodeName(url.hash),
		type: "trojan",
		server: url.hostname,
		port: Number(url.port),
		password: decodeURIComponent(url.username),
	};
	const sni = url.searchParams.get("sni");
	if (sni) {
		proxy.sni = sni;
	}
	const network = url.searchParams.get("type");
	if (network) {
		proxy.network = network;
	}
	const wsOptions = buildWSOptions(url);
	if (wsOptions) {
		proxy["ws-opts"] = wsOptions;
	}
	return proxy;
}

function parseVLESSURI(rawLine) {
	const url = parseURL(rawLine);
	const proxy = {
		name: decodeName(url.hash),
		type: "vless",
		server: url.hostname,
		port: Number(url.port),
		uuid: decodeURIComponent(url.username),
	};
	const security = url.searchParams.get("security");
	if (security === "tls" || security === "reality") {
		proxy.tls = true;
	}
	const servername = url.searchParams.get("sni");
	if (servername) {
		proxy.servername = servername;
	}
	const network = url.searchParams.get("type");
	if (network) {
		proxy.network = network;
	}
	const flow = url.searchParams.get("flow");
	if (flow) {
		proxy.flow = flow;
	}
	const fingerprint = url.searchParams.get("fp");
	if (fingerprint) {
		proxy["client-fingerprint"] = fingerprint;
	}
	const publicKey = url.searchParams.get("pbk");
	if (publicKey) {
		proxy["reality-opts"] = { "public-key": publicKey };
	}
	const wsOptions = buildWSOptions(url);
	if (wsOptions) {
		proxy["ws-opts"] = wsOptions;
	}
	return proxy;
}

function parseHysteria2URI(rawLine) {
	const url = parseURL(rawLine);
	const proxy = {
		name: decodeName(url.hash),
		type: "hysteria2",
		server: url.hostname,
		port: Number(url.port),
		ports: String(url.port),
		password: decodeURIComponent(url.username),
	};
	const sni = url.searchParams.get("sni");
	if (sni) {
		proxy.sni = sni;
	}
	if (url.searchParams.get("insecure") === "1") {
		proxy["skip-cert-verify"] = true;
	}
	return proxy;
}

function parseTUICURI(rawLine) {
	const url = parseURL(rawLine);
	const proxy = {
		name: decodeName(url.hash),
		type: "tuic",
		server: url.hostname,
		port: Number(url.port),
		uuid: decodeURIComponent(url.username),
		password: decodeURIComponent(url.password),
	};
	const sni = url.searchParams.get("sni");
	if (sni) {
		proxy.sni = sni;
	}
	const alpn = url.searchParams.get("alpn");
	if (alpn) {
		proxy.alpn = alpn.includes(",") ? alpn.split(",") : [alpn];
	}
	const congestionController = url.searchParams.get("congestion_control");
	if (congestionController) {
		proxy["congestion-controller"] = congestionController;
	}
	const udpRelayMode = url.searchParams.get("udp_relay_mode");
	if (udpRelayMode) {
		proxy["udp-relay-mode"] = udpRelayMode;
	}
	return proxy;
}

function parseAnyTLSURI(rawLine) {
	const url = parseURL(rawLine);
	const proxy = {
		name: decodeName(url.hash),
		type: "anytls",
		server: url.hostname,
		port: Number(url.port),
		password: decodeURIComponent(url.username),
	};
	const sni = url.searchParams.get("peer");
	if (sni) {
		proxy.sni = sni;
	}
	const alpn = url.searchParams.get("alpn");
	if (alpn) {
		proxy.alpn = alpn.includes(",") ? alpn.split(",") : [alpn];
	}
	return proxy;
}

function parseShadowrocketVMessPayload(payload) {
	const match = /^([^:]+):([^@]+)@([^:]+):(\d+)$/.exec(payload);
	if (!match) {
		return null;
	}
	const networkAndTLS = match[1].split("+");
	const credential = match[2];
	const separatorIndex = credential.lastIndexOf("-");
	if (separatorIndex === -1) {
		return null;
	}
	return {
		networkAndTLS,
		server: match[3],
		port: Number(match[4]),
		uuid: credential.slice(0, separatorIndex),
		alterId: Number(credential.slice(separatorIndex + 1)),
	};
}

function parseVMessURI(rawLine) {
	const url = parseURL(rawLine);
	let parsedPayload = null;
	if (url.username || url.password) {
		const userInfo = decodeURIComponent(url.password);
		const separatorIndex = userInfo.lastIndexOf("-");
		if (separatorIndex === -1) {
			throw new Error(`invalid vmess credential payload: ${rawLine}`);
		}
		parsedPayload = {
			networkAndTLS: decodeURIComponent(url.username).split("+"),
			server: url.hostname,
			port: Number(url.port),
			uuid: userInfo.slice(0, separatorIndex),
			alterId: Number(userInfo.slice(separatorIndex + 1)),
		};
	} else if (url.hostname) {
		parsedPayload = parseShadowrocketVMessPayload(decodeBase64URL(url.hostname));
	}
	if (!parsedPayload) {
		throw new Error(`invalid vmess URI: ${rawLine}`);
	}
	const proxy = {
		name:
			decodeName(url.hash) ||
			url.searchParams.get("ps") ||
			url.searchParams.get("remarks") ||
			"",
		type: "vmess",
		server: parsedPayload.server,
		port: parsedPayload.port,
		uuid: parsedPayload.uuid,
		alterId: parsedPayload.alterId,
		cipher: "auto",
	};
	const network = parsedPayload.networkAndTLS.find((token) => token !== "tls");
	if (network) {
		proxy.network = network;
	}
	if (parsedPayload.networkAndTLS.includes("tls")) {
		proxy.tls = true;
	}
	const tlsParam = url.searchParams.get("tls");
	if (tlsParam === "1" || tlsParam === "true") {
		proxy.tls = true;
	}
	const host = url.searchParams.get("host") || url.searchParams.get("obfsParam");
	if (host) {
		proxy.servername = host;
	}
	const wsOptions = buildWSOptions(url);
	if (wsOptions) {
		proxy["ws-opts"] = wsOptions;
	}
	return proxy;
}

function parseSSRURI(rawLine) {
	const payload = decodeBase64URL(rawLine.slice("ssr://".length));
	const [main, queryString = ""] = payload.split("/?");
	const parts = main.split(":");
	if (parts.length < 6) {
		throw new Error(`invalid ssr payload: ${rawLine}`);
	}
	const [server, port, protocol, cipher, obfs, encodedPassword] = parts;
	const params = new URLSearchParams(queryString);
	const proxy = {
		name: params.get("remarks") ? decodeBase64URL(params.get("remarks")) : "",
		type: "ssr",
		server,
		port: Number(port),
		cipher,
		password: decodeBase64URL(encodedPassword),
		protocol,
		obfs,
	};
	const obfsParam = params.get("obfsparam");
	if (obfsParam) {
		proxy["obfs-param"] = decodeBase64URL(obfsParam);
	}
	const protocolParam = params.get("protoparam") ?? params.get("protocolparam");
	if (protocolParam) {
		proxy["protocol-param"] = decodeBase64URL(protocolParam);
	}
	return proxy;
}

function parseTelegramSocksURI(rawLine) {
	const url = parseURL(rawLine);
	if (url.hostname !== "socks") {
		throw new Error(`unsupported telegram socks URI: ${rawLine}`);
	}
	const server = url.searchParams.get("server")?.trim();
	const port = url.searchParams.get("port")?.trim();
	if (!server || !port) {
		throw new Error(`telegram socks URI is missing server or port: ${rawLine}`);
	}
	const proxy = {
		name: url.searchParams.get("remarks")?.trim() || `${server}:${port}`,
		type: "socks5",
		server,
		port: Number(port),
	};
	const username = url.searchParams.get("user")?.trim();
	const password = url.searchParams.get("pass")?.trim();
	if (username) {
		proxy.username = username;
	}
	if (password) {
		proxy.password = password;
	}
	return proxy;
}

export function parseURIToMihomoProxy(rawLine) {
	if (rawLine.startsWith("ss://")) {
		return parseSSURI(rawLine);
	}
	if (rawLine.startsWith("trojan://")) {
		return parseTrojanURI(rawLine);
	}
	if (rawLine.startsWith("vless://")) {
		return parseVLESSURI(rawLine);
	}
	if (rawLine.startsWith("hysteria2://") || rawLine.startsWith("hy2://")) {
		return parseHysteria2URI(rawLine);
	}
	if (rawLine.startsWith("tuic://")) {
		return parseTUICURI(rawLine);
	}
	if (rawLine.startsWith("anytls://")) {
		return parseAnyTLSURI(rawLine);
	}
	if (rawLine.startsWith("vmess://")) {
		return parseVMessURI(rawLine);
	}
	if (rawLine.startsWith("ssr://")) {
		return parseSSRURI(rawLine);
	}
	if (rawLine.startsWith("tg://socks?")) {
		return parseTelegramSocksURI(rawLine);
	}
	throw new Error(`unsupported worker fixture URI: ${rawLine}`);
}

function renderMihomo(proxies) {
	const lines = ["proxies:"];
	for (const proxy of proxies) {
		lines.push(`  - ${JSON.stringify(proxy)}`);
	}
	return `${lines.join("\n")}\n`;
}

export function deriveSubscriptionArtifacts(uriLines) {
	const normalizedURILines = Array.isArray(uriLines) ? normalizeStringList(uriLines) : nonEmptyLines(uriLines);
	const generalContent = normalizedURILines.join("\n");
	const mihomoProxies = normalizedURILines.map(parseURIToMihomoProxy);
	const mihomoContent = renderMihomo(mihomoProxies);

	return {
		uriLines: normalizedURILines,
		mihomoProxies,
		generalContent,
		uriContent: generalContent,
		base64Content: Buffer.from(generalContent, "utf8").toString("base64"),
		mihomoContent,
		clashmetaContent: mihomoContent,
		outputs: {
			General: generalContent,
			URI: generalContent,
			base64: Buffer.from(generalContent, "utf8").toString("base64"),
			mihomo: mihomoContent,
		},
	};
}

export function buildSubscriptionFiles(baseName, uriLines) {
	const artifacts = deriveSubscriptionArtifacts(uriLines);
	return [
		{
			name: baseName,
			content: artifacts.base64Content,
		},
		{
			name: `${baseName}.uri`,
			content: `${artifacts.uriContent}\n`,
		},
		{
			name: `${baseName}.clashmeta`,
			content: artifacts.clashmetaContent,
		},
	];
}

export function parseProxyList(rawYAML) {
	const proxies = [];
	for (const line of normalizeNewlines(rawYAML).split("\n")) {
		const trimmed = line.trim();
		if (!trimmed.startsWith("- {")) {
			continue;
		}
		const proxyText = trimmed.slice(2).trim();
		try {
			proxies.push(JSON.parse(proxyText));
			continue;
		} catch {
			proxies.push(parseInlineMap(proxyText));
		}
	}
	return proxies;
}