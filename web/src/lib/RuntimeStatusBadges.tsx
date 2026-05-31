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

const LABELS = {
	zh: {
		app: "应用",
		revision: "SHA",
		subconverter: "Subconverter",
		storage: "短链存储",
		healthy: "可用",
		internalNetwork: "内部网络",
		crossNetwork: "跨网络",
		unhealthy: "不可用",
		latency: "延迟 {ms}ms",
		storageDetail: "{mode} · {used}/{capacity}",
		loading: "状态加载中…",
		unavailable: "状态暂不可用",
	},
	en: {
		app: "App",
		revision: "SHA",
		subconverter: "Subconverter",
		storage: "Short links",
		healthy: "healthy",
		internalNetwork: "internal network",
		crossNetwork: "cross-network",
		unhealthy: "unavailable",
		latency: "latency {ms}ms",
		storageDetail: "{mode} · {used}/{capacity}",
		loading: "Loading status…",
		unavailable: "Status unavailable",
	},
} as const;

type BadgeState = "ok" | "warn" | "error";

function formatNetworkScope(scope: RuntimeStatusResponse["subconverter"]["networkScope"], locale: Locale): string {
	const copy = LABELS[locale];
	return scope === "internal" ? copy.internalNetwork : copy.crossNetwork;
}

function formatSubconverterTooltip(status: RuntimeStatusResponse, locale: Locale): string {
	const copy = LABELS[locale];
	const subLatency =
		status.subconverter.latencyMs !== undefined
			? copy.latency.replace("{ms}", String(status.subconverter.latencyMs))
			: "";
	return [
		`${copy.subconverter}: ${status.subconverter.healthy ? copy.healthy : copy.unhealthy}`,
		status.subconverter.healthy ? formatNetworkScope(status.subconverter.networkScope, locale) : "",
		status.subconverter.version,
		subLatency,
		status.subconverter.error,
	]
		.filter((part) => part && part.trim() !== "")
		.join(" · ");
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

export function resolveSubconverterBadgeState(
	subconverter: RuntimeStatusResponse["subconverter"],
): BadgeState {
	if (!subconverter.healthy) {
		return "error";
	}
	if (subconverter.networkScope === "cross_network") {
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
	const storageLine = copy.storageDetail
		.replace("{mode}", status.storage.mode)
		.replace("{used}", String(status.storage.used))
		.replace("{capacity}", String(status.storage.capacity));
	return `${copy.storage}: ${storageLine}`;
}

function formatAppTooltip(status: RuntimeStatusResponse, locale: Locale): string {
	const copy = LABELS[locale];
	return [
		`${copy.app}: ${status.app.version}`,
		status.app.revision ? `${copy.revision}: ${status.app.revision}` : "",
	]
		.filter((part) => part && part.trim() !== "")
		.join(" · ");
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
	const appLabel = status?.app.version ?? "…";

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
				<p className="a-footer__credit" title={appTooltip}>
					{footerCreditWithAppVersion(footerCredit, appLabel)}
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
