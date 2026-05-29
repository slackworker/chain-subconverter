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
		subconverter: "Subconverter",
		storage: "短链存储",
		healthy: "可用",
		unhealthy: "不可用",
		latency: "延迟 {ms}ms",
		storageDetail: "{mode} · {used}/{capacity}",
		loading: "状态加载中…",
		unavailable: "状态暂不可用",
	},
	en: {
		app: "App",
		subconverter: "Subconverter",
		storage: "Short links",
		healthy: "healthy",
		unhealthy: "unavailable",
		latency: "latency {ms}ms",
		storageDetail: "{mode} · {used}/{capacity}",
		loading: "Loading status…",
		unavailable: "Status unavailable",
	},
} as const;

function formatSubconverterTooltip(status: RuntimeStatusResponse, locale: Locale): string {
	const copy = LABELS[locale];
	const subLatency =
		status.subconverter.latencyMs !== undefined
			? copy.latency.replace("{ms}", String(status.subconverter.latencyMs))
			: "";
	return [
		`${copy.subconverter}: ${status.subconverter.healthy ? copy.healthy : copy.unhealthy}`,
		status.subconverter.version,
		subLatency,
		status.subconverter.error,
	]
		.filter((part) => part && part.trim() !== "")
		.join(" · ");
}

function formatStorageTooltip(status: RuntimeStatusResponse, locale: Locale): string {
	const copy = LABELS[locale];
	const storageLine = copy.storageDetail
		.replace("{mode}", status.storage.mode)
		.replace("{used}", String(status.storage.used))
		.replace("{capacity}", String(status.storage.capacity));
	return `${copy.storage}: ${storageLine}`;
}

function formatFooterTooltip(status: RuntimeStatusResponse, locale: Locale): string {
	const copy = LABELS[locale];
	return [
		`${copy.app}: ${status.app.version}`,
		formatSubconverterTooltip(status, locale),
		formatStorageTooltip(status, locale),
	].join("\n");
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

	const footerTooltip = status ? formatFooterTooltip(status, locale) : copy.loading;
	const subTooltip = status ? formatSubconverterTooltip(status, locale) : copy.loading;
	const storageTooltip = status ? formatStorageTooltip(status, locale) : copy.loading;
	const subLabel =
		status === null
			? "…"
			: status.subconverter.healthy
				? status.subconverter.latencyMs !== undefined
					? `${status.subconverter.latencyMs}ms`
					: copy.healthy
				: copy.unhealthy;
	const storageLabel = status ? `${status.storage.used}/${status.storage.capacity}` : "…";
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
				<p className="a-footer__credit" title={footerTooltip}>
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
						className={`a-runtime-status__badge ${status?.subconverter.healthy ? "a-runtime-status__badge--ok" : "a-runtime-status__badge--warn"}`}
						title={status ? subTooltip : copy.unavailable}
						aria-label={copy.subconverter}
					>
						<span
							className={`a-runtime-status__dot ${status?.subconverter.healthy ? "a-runtime-status__dot--ok" : "a-runtime-status__dot--warn"}`}
							aria-hidden
						/>
						{subLabel}
					</span>
					<span
						className="a-runtime-status__badge"
						title={status ? storageTooltip : copy.unavailable}
						aria-label={copy.storage}
					>
						{storageLabel}
					</span>
				</div>
				{endSlot}
			</div>
		</>
	);
}
