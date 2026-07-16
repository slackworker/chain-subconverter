import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

import { getRuntimeStatus } from "./api";
import type { RuntimeStatusResponse } from "../types/api";
import "./runtime-status.css";

type Locale = "zh" | "en";

interface RuntimeStatusBadgesProps {
	locale: Locale;
	footerCredit?: string;
	endSlot?: ReactNode;
}

const STORAGE_MODES = {
	zh: {
		persistent: "持久化",
		temporary: "临时",
	},
	en: {
		persistent: "persistent",
		temporary: "temporary",
	},
} as const;

const LABELS = {
	zh: {
		releaseTag: "发布标签",
		imageTag: "镜像 tag",
		revision: "构建 revision",
		imageDigest: "镜像 digest",
		subconverter: "Subconverter",
		storage: "短链存储",
		healthy: "可用",
		internalNetwork: "内部网络",
		crossNetwork: "跨网络",
		unhealthy: "不可用",
		loading: "状态加载中…",
		unavailable: "状态暂不可用",
	},
	en: {
		releaseTag: "Release tag",
		imageTag: "Image tag",
		revision: "Revision",
		imageDigest: "Image digest",
		subconverter: "Subconverter",
		storage: "Short links",
		healthy: "healthy",
		internalNetwork: "internal network",
		crossNetwork: "cross-network",
		unhealthy: "unavailable",
		loading: "Loading status…",
		unavailable: "Status unavailable",
	},
} as const;

type BadgeState = "ok" | "warn" | "error";

function formatNetworkScope(scope: RuntimeStatusResponse["subconverter"]["networkScope"], locale: Locale): string {
	const copy = LABELS[locale];
	return scope === "internal" ? copy.internalNetwork : copy.crossNetwork;
}

function formatStorageModeLabel(mode: string, locale: Locale): string {
	if (mode === "persistent" || mode === "temporary") {
		return STORAGE_MODES[locale][mode];
	}
	return mode;
}

function formatSubconverterTooltip(status: RuntimeStatusResponse, locale: Locale): string {
	const copy = LABELS[locale];
	const details = [
		status.subconverter.healthy ? formatNetworkScope(status.subconverter.networkScope, locale) : "",
		status.subconverter.version,
		status.subconverter.error,
	]
		.filter((part) => part && part.trim() !== "")
		.join(" · ");
	return details ? `${copy.subconverter}: ${details}` : copy.subconverter;
}

export type StorageBadgeState = BadgeState;

/** 有空余容量 ok；满容 LRU warn；用量超过容量 error。 */
export function resolveStorageBadgeState(used: number, capacity: number): StorageBadgeState {
	if (used > capacity) {
		return "error";
	}
	if (used >= capacity) {
		return "warn";
	}
	return "ok";
}

const SUBCONVERTER_LATENCY_WARN_MS = 10;

export function resolveSubconverterBadgeState(
	subconverter: RuntimeStatusResponse["subconverter"],
): BadgeState {
	if (!subconverter.healthy) {
		return "error";
	}
	if (subconverter.latencyMs !== undefined && subconverter.latencyMs > SUBCONVERTER_LATENCY_WARN_MS) {
		return "warn";
	}
	return "ok";
}

function badgeClass(state: BadgeState | undefined): string {
	if (state === undefined) {
		return "a-runtime-status__badge";
	}
	return `a-runtime-status__badge a-runtime-status__badge--${state}`;
}

function dotClass(state: BadgeState | undefined): string {
	if (state === undefined) {
		return "a-runtime-status__dot";
	}
	return `a-runtime-status__dot a-runtime-status__dot--${state}`;
}

function formatStorageTooltip(status: RuntimeStatusResponse, locale: Locale): string {
	const copy = LABELS[locale];
	return `${copy.storage}: ${formatStorageModeLabel(status.storage.mode, locale)}`;
}

function shortRevision(revision: string | undefined): string | undefined {
	if (!revision) {
		return undefined;
	}
	// 与 IDE Source Control Graph 默认短 hash（7 位）对齐。
	return revision.slice(0, 7);
}

function formatAppTooltip(status: RuntimeStatusResponse, locale: Locale): string {
	const copy = LABELS[locale];
	const details = [
		status.app.releaseTag ? `${copy.releaseTag}: ${status.app.releaseTag}` : "",
		status.app.imageTag ? `${copy.imageTag}: ${status.app.imageTag}` : "",
		shortRevision(status.app.revision) ? `${copy.revision}: ${shortRevision(status.app.revision)}` : "",
		status.app.imageDigest ? `${copy.imageDigest}: ${status.app.imageDigest}` : "",
	]
		.filter((part) => part !== "")
		.join(" · ");
	return details;
}

/** 在 © 前插入应用版本，形如「Chain Subconverter - dev © 2026」。 */
function footerCreditWithAppVersion(footerCredit: string, version: string): string {
	const copyrightSep = " © ";
	const idx = footerCredit.indexOf(copyrightSep);
	if (idx < 0) {
		return `${footerCredit} - ${version}`;
	}
	return `${footerCredit.slice(0, idx)} - ${version}${footerCredit.slice(idx)}`;
}

export function RuntimeStatusBadges({ locale, footerCredit, endSlot }: RuntimeStatusBadgesProps) {
	const copy = LABELS[locale];
	const [status, setStatus] = useState<RuntimeStatusResponse | null>(null);
	const runtimeStatusRef = useRef<HTMLDivElement | null>(null);

	const load = useCallback(async (refresh: boolean) => {
		try {
			const next = await getRuntimeStatus(refresh);
			setStatus(next);
		} catch {
			setStatus(null);
		}
	}, []);

	useEffect(() => {
		void load(false);
	}, [load]);

	const subTooltip = status ? formatSubconverterTooltip(status, locale) : copy.loading;
	const storageTooltip = status ? formatStorageTooltip(status, locale) : copy.loading;
	const appTooltip = status ? formatAppTooltip(status, locale) : copy.loading;
	const subLabel =
		status === null
			? "…"
			: status.subconverter.healthy
				? status.subconverter.latencyMs !== undefined
					? `${status.subconverter.latencyMs}ms`
					: copy.healthy
				: copy.unhealthy;
	const storageLabel = status ? `${status.storage.used}/${status.storage.capacity}` : "…";
	const storageBadgeState = status
		? resolveStorageBadgeState(status.storage.used, status.storage.capacity)
		: undefined;
	const subconverterBadgeState = status ? resolveSubconverterBadgeState(status.subconverter) : undefined;
	const appLabel = status?.app.version;

		function handleRefreshIntent() {
			void load(true);
		}

		useEffect(() => {
			const element = runtimeStatusRef.current;
			if (element === null) {
				return undefined;
			}

			function handleFocus() {
				handleRefreshIntent();
			}

			element.addEventListener("focus", handleFocus);
			return () => {
				element.removeEventListener("focus", handleFocus);
			};
		}, [load]);

	return (
		<>
			{footerCredit ? (
				<p className="a-footer__credit" title={appTooltip || undefined}>
					{appLabel ? footerCreditWithAppVersion(footerCredit, appLabel) : footerCredit}
				</p>
			) : null}
			<div className="a-footer__end">
				<div
					ref={runtimeStatusRef}
					className="a-runtime-status"
					tabIndex={0}
					role="group"
					aria-label={copy.loading}
					onMouseEnter={handleRefreshIntent}
				>
					<span
						className={badgeClass(subconverterBadgeState)}
						title={status ? subTooltip : copy.unavailable}
						aria-label={copy.subconverter}
					>
						<span className={dotClass(subconverterBadgeState)} aria-hidden />
						{subLabel}
					</span>
					<span
						className={badgeClass(storageBadgeState)}
						title={status ? storageTooltip : copy.unavailable}
						aria-label={copy.storage}
					>
						<span className={dotClass(storageBadgeState)} aria-hidden />
						{storageLabel}
					</span>
				</div>
				{endSlot}
			</div>
		</>
	);
}
