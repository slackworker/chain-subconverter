import type { ModeReason } from "../types/api";

export type ModeReasonLocale = "zh" | "en";

function asNumber(value: unknown): number | undefined {
	if (typeof value === "number" && Number.isFinite(value)) {
		return value;
	}
	if (typeof value === "string" && value.trim() !== "") {
		const parsed = Number(value);
		return Number.isFinite(parsed) ? parsed : undefined;
	}
	return undefined;
}

const PROTOCOL_DISCOURAGED_ZH =
	"落地节点若无特殊需求勿选 UDP 类（Hy2/TUIC/WireGuard）与 TLS 伪装（Reality/ShadowTLS），订阅可能无法贯通；建议 SS（AEAD）或 VMess";
const PROTOCOL_DISCOURAGED_EN =
	"For chain mode, avoid UDP-style landings (Hy2/TUIC/WireGuard) and TLS obfuscation (Reality/ShadowTLS) unless required; prefer SS (AEAD) or VMess.";

function formatPortDiscouragedText(reasonArgs: Record<string, unknown> | undefined, locale: ModeReasonLocale) {
	const landingPort = asNumber(reasonArgs?.landingPort);
	const recommendedPortMax = asNumber(reasonArgs?.recommendedPortMax) ?? 10_000;
	if (landingPort !== undefined) {
		return locale === "zh"
			? `当前落地节点端口为 ${landingPort}；若选择链式代理，建议使用 ${recommendedPortMax} 以内端口，避免部分机场对 ${recommendedPortMax} 以上高位端口进行屏蔽导致不通`
			: `Landing port is ${landingPort}; for chain mode, prefer ports up to ${recommendedPortMax} to avoid blocks on high ports.`;
	}
	return locale === "zh"
		? `若选择链式代理，建议使用 ${recommendedPortMax} 以内端口，避免部分机场屏蔽高位端口导致不通`
		: `For chain mode, prefer ports up to ${recommendedPortMax}.`;
}

export function formatModeReason(
	reason: ModeReason | undefined | null,
	locale: ModeReasonLocale = "zh",
): string {
	if (!reason) {
		return "";
	}

	const { reasonCode, reasonArgs, reasonText } = reason;
	if (!reasonCode) {
		return reasonText ?? "";
	}

	switch (reasonCode) {
		case "DISCOURAGED_BY_LANDING_PROTOCOL":
			return locale === "zh" ? PROTOCOL_DISCOURAGED_ZH : PROTOCOL_DISCOURAGED_EN;
		case "DISCOURAGED_BY_LANDING_PORT":
			return formatPortDiscouragedText(reasonArgs, locale);
		case "DISCOURAGED_BY_LANDING_PROTOCOL_AND_PORT": {
			const protocolText = locale === "zh" ? PROTOCOL_DISCOURAGED_ZH : PROTOCOL_DISCOURAGED_EN;
			const portText = formatPortDiscouragedText(reasonArgs, locale);
			return locale === "zh" ? `${protocolText}；${portText}` : `${protocolText} ${portText}`;
		}
		default:
			return reasonCode;
	}
}
