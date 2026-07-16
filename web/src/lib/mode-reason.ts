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

function formatRowRef(reasonArgs: Record<string, unknown> | undefined, locale: ModeReasonLocale): string {
	const instanceId = typeof reasonArgs?.instanceId === "string" ? reasonArgs.instanceId.trim() : "";
	const proxyName = typeof reasonArgs?.proxyName === "string" ? reasonArgs.proxyName.trim() : "";
	const sourceId = typeof reasonArgs?.sourceId === "string" ? reasonArgs.sourceId.trim() : "";
	const label = proxyName || instanceId || sourceId;
	if (!label) {
		return "";
	}
	return locale === "zh" ? `行「${label}」` : `Row "${label}"`;
}

function formatRestoreConflictReason(
	reasonCode: string,
	reasonArgs: Record<string, unknown> | undefined,
	locale: ModeReasonLocale,
): string {
	const rowRef = formatRowRef(reasonArgs, locale);
	const rowPrefix = rowRef ? `${rowRef}：` : "";

	switch (reasonCode) {
		case "TARGET_NOT_FOUND":
			return locale === "zh"
				? `${rowPrefix}引用的目标在当前模板中不存在`
				: `${rowPrefix}references a target that no longer exists in the current template`;
		case "LANDING_NODE_NOT_FOUND":
			return locale === "zh"
				? `${rowPrefix}引用的落地节点在当前环境中不存在`
				: `${rowPrefix}references a landing node that no longer exists in the current environment`;
		case "EMPTY_CHAIN_TARGET":
			return locale === "zh"
				? `${rowPrefix}引用的链式目标当前不可用`
				: `${rowPrefix}references a chain target that is currently unavailable`;
		case "STAGE2_ROWSET_MISMATCH":
			return locale === "zh"
				? "恢复的配置与当前可生成的 Stage 2 行集合不一致"
				: "The restored configuration no longer matches the current Stage 2 row set";
		case "SERVER_AGGREGATION_MEMBER_NOT_FOUND":
			return locale === "zh"
				? "恢复的配置引用了当前环境中不存在的聚合成员行"
				: "The restored configuration references an aggregation member row that no longer exists";
		case "SERVER_AGGREGATION_GROUP_TOO_SMALL":
			return locale === "zh"
				? "恢复的配置引用的聚合组已不满足最小成员数量"
				: "A restored aggregation group no longer meets the minimum member count";
		case "SERVER_AGGREGATION_SERVER_MISMATCH":
			return locale === "zh"
				? "恢复的配置存在跨 server 聚合成员不一致"
				: "The restored configuration has aggregation members from mismatched servers";
		case "TEMPLATE_CONFIG_UNAVAILABLE":
			return locale === "zh"
				? "当前快照使用的模板 URL 暂时不可用"
				: "The template URL used by this snapshot is temporarily unavailable";
		case "LEGACY_PAYLOAD_VERSION": {
			const payloadVersion = asNumber(reasonArgs?.payloadVersion);
			const currentVersion = asNumber(reasonArgs?.currentVersion);
			if (payloadVersion !== undefined && currentVersion !== undefined) {
				return locale === "zh"
					? `链接载荷版本 v${payloadVersion} 与当前 v${currentVersion} 不兼容：已还原阶段 1，阶段 2 及之后需重新转换`
					: `Payload version v${payloadVersion} is incompatible with current v${currentVersion}: Stage 1 was restored; re-run convert for Stage 2+`;
			}
			return locale === "zh"
				? "链接载荷版本不兼容：已还原阶段 1，阶段 2 及之后需重新转换"
				: "Payload version is incompatible: Stage 1 was restored; re-run convert for Stage 2+";
		}
		case "INVALID_REQUEST":
			if (reasonArgs?.field === "config") {
				return locale === "zh"
					? "当前快照使用的模板 URL 已失效或不再可用"
					: "The template URL used by this snapshot is invalid or no longer available";
			}
			return locale === "zh"
				? "恢复的配置包含当前无法复用的输入"
				: "The restored configuration contains input that can no longer be reused";
		default:
			return reasonCode;
	}
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
		case "TARGET_NOT_FOUND":
		case "LANDING_NODE_NOT_FOUND":
		case "EMPTY_CHAIN_TARGET":
		case "STAGE2_ROWSET_MISMATCH":
		case "SERVER_AGGREGATION_MEMBER_NOT_FOUND":
		case "SERVER_AGGREGATION_GROUP_TOO_SMALL":
		case "SERVER_AGGREGATION_SERVER_MISMATCH":
		case "TEMPLATE_CONFIG_UNAVAILABLE":
		case "LEGACY_PAYLOAD_VERSION":
		case "INVALID_REQUEST":
			return formatRestoreConflictReason(reasonCode, reasonArgs, locale);
		default:
			return reasonCode;
	}
}
