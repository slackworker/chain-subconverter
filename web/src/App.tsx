import { useEffect, useState } from "react";

import { FieldErrorList } from "./components/FieldErrorList";
import { NoticeStack } from "./components/NoticeStack";
import { StageCard } from "./components/StageCard";
import { StatusPill } from "./components/StatusPill";
import { TextAreaField } from "./components/TextAreaField";
import { TextField } from "./components/TextField";
import { ToggleField } from "./components/ToggleField";
import { getErrorResponse, postGenerate, postResolveURL, postShortLink, postStage1Convert } from "./lib/api";
import { initialAppState } from "./lib/state";
import type { BlockingError, Message, Stage1Input, Stage2Init, Stage2Row } from "./types/api";

type ThemeMode = "dawn" | "night";

const modeLabelMap: Record<Stage2Row["mode"], string> = {
	none: "不修改",
	chain: "链式代理",
	port_forward: "端口转发",
};

function snapshotRowsFromInit(stage2Init: Stage2Init) {
	return stage2Init.rows.map((row) => ({
		landingNodeName: row.landingNodeName,
		mode: row.mode,
		targetName: row.targetName,
	}));
}

function fallbackBlockingError(error: unknown): BlockingError {
	return {
		code: "REQUEST_FAILED",
		message: error instanceof Error ? error.message : "请求失败",
		scope: "global",
	};
}

function mergeMessages(...messageGroups: Message[][]): Message[] {
	const seen = new Set<string>();
	return messageGroups.flat().filter((message) => {
		const key = `${message.level}:${message.code}:${message.message}`;
		if (seen.has(key)) {
			return false;
		}
		seen.add(key);
		return true;
	});
}

function buildGeneratedUrls(longUrl: string, shortUrl: string | null | undefined, preferShortUrl = false) {
	return {
		longUrl,
		shortUrl: shortUrl ?? null,
		preferShortUrl: preferShortUrl && Boolean(shortUrl),
	};
}

function withDownloadFlag(urlString: string) {
	try {
		const url = new URL(urlString, window.location.href);
		url.searchParams.set("download", "1");
		return url.toString();
	} catch {
		return urlString;
	}
}

function getModeOptions(stage2Init: Stage2Init | null) {
	return stage2Init?.availableModes ?? [];
}

function getTargetChoices(stage2Init: Stage2Init | null, mode: Stage2Row["mode"]) {
	if (stage2Init === null) {
		return [];
	}
	if (mode === "chain") {
		return stage2Init.chainTargets.map((target) => ({
			value: target.name,
			label: target.isEmpty ? `${target.name}（策略组为空）` : target.name,
			disabled: target.isEmpty === true,
		}));
	}
	if (mode === "port_forward") {
		return stage2Init.forwardRelays.map((relay) => ({
			value: relay.name,
			label: relay.name,
			disabled: false,
		}));
	}
	return [];
}

function pickNextTarget(stage2Init: Stage2Init | null, mode: Stage2Row["mode"], currentTarget: string | null) {
	if (mode === "none") {
		return null;
	}
	const choices = getTargetChoices(stage2Init, mode).filter((choice) => !choice.disabled);
	if (choices.some((choice) => choice.value === currentTarget)) {
		return currentTarget;
	}
	if (mode === "port_forward" && choices.length === 1) {
		return choices[0].value;
	}
	return null;
}

export default function App() {
	const [theme, setTheme] = useState<ThemeMode>("dawn");
	const [state, setState] = useState(initialAppState);
	const [isConverting, setIsConverting] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isCreatingShortUrl, setIsCreatingShortUrl] = useState(false);
	const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	useEffect(() => {
		if (copyState === "idle") {
			return undefined;
		}
		const timer = window.setTimeout(() => setCopyState("idle"), 1800);
		return () => window.clearTimeout(timer);
	}, [copyState]);

	const activeOutput = state.generatedUrls?.preferShortUrl && state.generatedUrls.shortUrl
		? state.generatedUrls.shortUrl
		: state.generatedUrls?.longUrl ?? "尚未生成链接";
	const globalErrors = state.blockingErrors.filter((error) => error.scope === "global");
	const stage2Rows = state.stage2Snapshot.rows;
	const modeOptions = getModeOptions(state.stage2Init);
	const isConflictReadonly = state.restoreStatus === "conflicted";
	const isStage2Editable = state.stage2Init !== null && !state.stage2Stale && !isConflictReadonly;
	const canGenerate = stage2Rows.length > 0 && !state.stage2Stale && !isConflictReadonly && !isGenerating;
	const stage2StatusLabel = isConflictReadonly ? "Conflict" : state.stage2Stale ? "Stage 2 Stale" : state.stage2Init === null ? "Awaiting Init" : "Ready";
	const stage2StatusTone = isConflictReadonly || state.stage2Stale || state.stage2Init === null ? "warning" : "success";

	function updateStage1Input(updater: (current: Stage1Input) => Stage1Input) {
		setState((current) => ({
			...current,
			stage1Input: updater(current.stage1Input),
			generatedUrls: null,
			stage2Stale: current.stage2Snapshot.rows.length > 0 ? true : current.stage2Stale,
		}));
	}

	function applyStage2Init(stage2Init: Stage2Init) {
		setState((current) => ({
			...current,
			stage2Init,
			stage2Snapshot: { rows: snapshotRowsFromInit(stage2Init) },
			generatedUrls: null,
			stage2Stale: false,
			restoreStatus: "idle",
		}));
	}

	function getStage2RowMeta(landingNodeName: string) {
		return state.stage2Init?.rows.find((row) => row.landingNodeName === landingNodeName) ?? null;
	}

	function getStage2RowErrors(landingNodeName: string) {
		return state.blockingErrors.filter((error) => error.scope === "stage2_row" && error.context?.landingNodeName === landingNodeName);
	}

	async function handleStage1Convert() {
		const stage1Input = state.stage1Input;
		setIsConverting(true);
		setState((current) => ({
			...current,
			messages: [],
			blockingErrors: [],
		}));

		try {
			const response = await postStage1Convert({ stage1Input });
			applyStage2Init(response.stage2Init);
			setState((current) => ({
				...current,
				messages: response.messages,
				blockingErrors: response.blockingErrors,
			}));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			setState((current) => ({
				...current,
				messages: errorResponse?.messages ?? [],
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error)],
			}));
		} finally {
			setIsConverting(false);
		}
	}

	async function handleRestore() {
		const restoreInput = state.restoreInput.trim();
		if (restoreInput === "") {
			return;
		}

		setIsRestoring(true);
		setState((current) => ({
			...current,
			messages: [],
			blockingErrors: [],
		}));

		try {
			const restoreResponse = await postResolveURL(restoreInput);
			if (restoreResponse.restoreStatus === "conflicted") {
				setState((current) => ({
					...current,
					restoreInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
					stage1Input: restoreResponse.stage1Input,
					stage2Init: null,
					stage2Snapshot: restoreResponse.stage2Snapshot,
					generatedUrls: buildGeneratedUrls(restoreResponse.longUrl, restoreResponse.shortUrl, Boolean(restoreResponse.shortUrl)),
					stage2Stale: false,
					restoreStatus: restoreResponse.restoreStatus,
					messages: restoreResponse.messages,
					blockingErrors: restoreResponse.blockingErrors,
				}));
				return;
			}

			try {
				const convertResponse = await postStage1Convert({ stage1Input: restoreResponse.stage1Input });
				setState((current) => ({
					...current,
					restoreInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
					stage1Input: restoreResponse.stage1Input,
					stage2Init: convertResponse.stage2Init,
					stage2Snapshot: restoreResponse.stage2Snapshot,
					generatedUrls: buildGeneratedUrls(restoreResponse.longUrl, restoreResponse.shortUrl, Boolean(restoreResponse.shortUrl)),
					stage2Stale: false,
					restoreStatus: restoreResponse.restoreStatus,
					messages: mergeMessages(restoreResponse.messages, convertResponse.messages),
					blockingErrors: restoreResponse.blockingErrors.length > 0 ? restoreResponse.blockingErrors : convertResponse.blockingErrors,
				}));
			} catch (convertError) {
				const errorResponse = getErrorResponse(convertError);
				setState((current) => ({
					...current,
					restoreInput: restoreResponse.shortUrl ?? restoreResponse.longUrl,
					stage1Input: restoreResponse.stage1Input,
					stage2Init: null,
					stage2Snapshot: restoreResponse.stage2Snapshot,
					generatedUrls: buildGeneratedUrls(restoreResponse.longUrl, restoreResponse.shortUrl, Boolean(restoreResponse.shortUrl)),
					stage2Stale: true,
					restoreStatus: restoreResponse.restoreStatus,
					messages: restoreResponse.messages,
					blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(convertError)],
				}));
			}
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			setState((current) => ({
				...current,
				messages: errorResponse?.messages ?? [],
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error)],
			}));
		} finally {
			setIsRestoring(false);
		}
	}

	function updateStage2Row(landingNodeName: string, updater: (row: Stage2Row) => Stage2Row) {
		setState((current) => ({
			...current,
			generatedUrls: null,
			blockingErrors: current.blockingErrors.filter(
				(error) => !(error.scope === "stage2_row" && error.context?.landingNodeName === landingNodeName),
			),
			stage2Snapshot: {
				rows: current.stage2Snapshot.rows.map((row) => (row.landingNodeName === landingNodeName ? updater(row) : row)),
			},
		}));
	}

	function handleModeChange(landingNodeName: string, mode: Stage2Row["mode"]) {
		updateStage2Row(landingNodeName, (row) => ({
			...row,
			mode,
			targetName: pickNextTarget(state.stage2Init, mode, row.targetName),
		}));
	}

	function handleTargetChange(landingNodeName: string, targetName: string) {
		updateStage2Row(landingNodeName, (row) => ({
			...row,
			targetName: targetName === "" ? null : targetName,
		}));
	}

	async function handleGenerate() {
		setIsGenerating(true);
		setState((current) => ({
			...current,
			messages: [],
			blockingErrors: [],
		}));

		try {
			const response = await postGenerate({
				stage1Input: state.stage1Input,
				stage2Snapshot: state.stage2Snapshot,
			});
			setState((current) => ({
				...current,
				generatedUrls: buildGeneratedUrls(response.longUrl, null),
				messages: response.messages,
				blockingErrors: response.blockingErrors,
			}));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			setState((current) => ({
				...current,
				messages: errorResponse?.messages ?? [],
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error)],
			}));
		} finally {
			setIsGenerating(false);
		}
	}

	async function handlePreferShortUrl(checked: boolean) {
		if (state.generatedUrls === null) {
			return;
		}
		if (!checked) {
			setState((current) => current.generatedUrls === null ? current : ({
				...current,
				generatedUrls: {
					...current.generatedUrls,
					preferShortUrl: false,
				},
			}));
			return;
		}
		if (state.generatedUrls.shortUrl) {
			setState((current) => current.generatedUrls === null ? current : ({
				...current,
				generatedUrls: {
					...current.generatedUrls,
					preferShortUrl: true,
				},
			}));
			return;
		}

		setIsCreatingShortUrl(true);
		setState((current) => ({
			...current,
			messages: [],
			blockingErrors: [],
		}));

		try {
			const response = await postShortLink(state.generatedUrls.longUrl);
			setState((current) => ({
				...current,
				generatedUrls: buildGeneratedUrls(response.longUrl, response.shortUrl, true),
				messages: response.messages,
				blockingErrors: response.blockingErrors,
			}));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			setState((current) => ({
				...current,
				messages: errorResponse?.messages ?? [],
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackBlockingError(error)],
			}));
		} finally {
			setIsCreatingShortUrl(false);
		}
	}

	function handleOpenOutput() {
		if (state.generatedUrls === null) {
			return;
		}
		window.open(activeOutput, "_blank", "noopener,noreferrer");
	}

	async function handleCopyOutput() {
		if (state.generatedUrls === null) {
			return;
		}
		try {
			await navigator.clipboard.writeText(activeOutput);
			setCopyState("done");
		} catch {
			setCopyState("failed");
		}
	}

	function handleDownloadOutput() {
		if (state.generatedUrls === null) {
			return;
		}
		const anchor = document.createElement("a");
		anchor.href = withDownloadFlag(activeOutput);
		anchor.rel = "noopener noreferrer";
		document.body.appendChild(anchor);
		anchor.click();
		document.body.removeChild(anchor);
	}

	return (
		<div className="min-h-screen bg-canvas text-ink">
			<div className="mx-auto flex min-h-screen max-w-6xl flex-col gap-8 px-4 py-6 md:px-8 md:py-10">
				<header className="overflow-hidden rounded-[32px] border border-line bg-surface shadow-panel shadow-black/5">
					<div className="grid gap-8 px-6 py-8 md:grid-cols-[1.7fr_0.9fr] md:px-8">
						<div className="space-y-5">
							<p className="font-mono text-xs uppercase tracking-[0.4em] text-accent">Phase 4 Public Baseline</p>
							<div className="space-y-3">
								<h1 className="max-w-3xl font-display text-4xl leading-tight md:text-6xl">Chain Converter for Mihomo</h1>
								<p className="max-w-2xl text-base leading-8 text-muted md:text-lg">
									前端主干公共基线已经起步：统一状态模型、公共组件、阶段壳层和后端静态托管已接线，接下来可以在同一基础上分出 A/B/C 三个 UI 方案分支。
								</p>
							</div>
							<div className="flex flex-wrap gap-3">
								<StatusPill label="React + TypeScript" tone="success" />
								<StatusPill label="Tailwind CSS" tone="success" />
								<StatusPill label="Static Hosting Ready" tone="warning" />
							</div>
						</div>
						<div className="flex flex-col justify-between gap-6 rounded-[28px] border border-line bg-panel p-5">
							<div className="space-y-3">
								<p className="text-sm font-semibold uppercase tracking-[0.2em] text-muted">Current Focus</p>
								<ul className="space-y-3 text-sm leading-7 text-ink">
									<li>共享 API client 与 domain types</li>
									<li>公共输入控件与阶段容器</li>
									<li>同源静态资源托管入口</li>
								</ul>
							</div>
							<button
								type="button"
								onClick={() => setTheme((current) => (current === "dawn" ? "night" : "dawn"))}
								className="rounded-full border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
							>
								切换{theme === "dawn" ? "夜色" : "晨光"}主题
							</button>
						</div>
					</div>
				</header>

				<main className="space-y-6">
					<StageCard
						eyebrow="Restore"
						title="恢复入口"
						description="支持从 longUrl 或 shortUrl 恢复 Stage 1 与 Stage 2；可重放时进入可编辑态，冲突时保留只读快照。"
						aside={<StatusPill label={state.restoreStatus === "idle" ? "Idle" : state.restoreStatus} />}
					>
						<NoticeStack messages={state.messages} blockingErrors={globalErrors} />
						<div className="grid gap-4 md:grid-cols-[1fr_auto]">
							<input
								className="w-full rounded-[20px] border border-line bg-panel px-4 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft"
								placeholder="粘贴 longUrl 或 shortUrl"
								value={state.restoreInput}
								onChange={(event) => setState((current) => ({ ...current, restoreInput: event.target.value }))}
							/>
							<button
								type="button"
								onClick={handleRestore}
								disabled={isRestoring || state.restoreInput.trim() === ""}
								className="rounded-[20px] bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
							>
								{isRestoring ? "恢复中..." : "恢复"}
							</button>
						</div>
					</StageCard>

					<StageCard
						eyebrow="Stage 1"
						title="输入与自动填充"
						description="按 spec 收集落地与中转输入，修改任一输入后 Stage 2 标记过期，需重新执行转换并自动填充。"
						aside={<StatusPill label={state.stage2Stale ? "Stage 2 Stale" : "Ready"} tone={state.stage2Stale ? "warning" : "success"} />}
					>
						<NoticeStack messages={state.messages} blockingErrors={globalErrors} />
						<div className="grid gap-5">
							<TextAreaField
								label="落地信息"
								helper="每行一条，保留行号和横向滚动"
								placeholder="ss://...\nvmess://..."
								value={state.stage1Input.landingRawText}
								onChange={(value) => updateStage1Input((current) => ({ ...current, landingRawText: value }))}
							/>
							<FieldErrorList errors={state.blockingErrors} field="landingRawText" />
							<TextAreaField
								label="中转信息"
								helper="支持订阅 URL、节点 URI、data:text/plain"
								placeholder="https://example.com/subscription.txt"
								value={state.stage1Input.transitRawText}
								onChange={(value) => updateStage1Input((current) => ({ ...current, transitRawText: value }))}
							/>
							<FieldErrorList errors={state.blockingErrors} field="transitRawText" />

							<div className="grid gap-4 lg:grid-cols-2">
								<ToggleField
									label="启用端口转发（实验性）"
									description="公共基线先固定启停和清空行为，具体布局与提示方式交给 A/B/C 分支探索。"
									checked={state.stage1Input.advancedOptions.enablePortForward}
									onChange={(checked) =>
										updateStage1Input((current) => ({
											...current,
											forwardRelayRawText: checked ? current.forwardRelayRawText : "",
											advancedOptions: {
												...current.advancedOptions,
												enablePortForward: checked,
											},
										}))
									}
								/>
								<TextField
									label="模板 URL"
									helper="留空时使用默认 Aethersailor 模板"
									placeholder="不填写将使用默认 Aethersailor 模板"
									value={state.stage1Input.advancedOptions.config ?? ""}
									onChange={(value) =>
										updateStage1Input((current) => ({
											...current,
											advancedOptions: {
												...current.advancedOptions,
												config: value.trim() === "" ? null : value,
											},
										}))
									}
								/>
							</div>
							<FieldErrorList errors={state.blockingErrors} field="config" />

							{state.stage1Input.advancedOptions.enablePortForward ? (
								<TextAreaField
									label="端口转发服务"
									helper="每行一条候选 server:port"
									placeholder="relay.example.com:1080"
									value={state.stage1Input.forwardRelayRawText}
									onChange={(value) => updateStage1Input((current) => ({ ...current, forwardRelayRawText: value }))}
								/>
							) : null}
							<FieldErrorList errors={state.blockingErrors} field="forwardRelayRawText" />

							<div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-dashed border-line bg-panel px-4 py-4">
								<p className="text-sm leading-7 text-muted">当前输入框已支持行号、禁止自动换行和横向滚动，长 URI 与多行订阅文本会按原始分行编辑。</p>
								<button type="button" onClick={handleStage1Convert} disabled={isConverting} className="rounded-[18px] bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
									{isConverting ? "转换中..." : "转换并自动填充"}
								</button>
							</div>
						</div>
					</StageCard>

					<StageCard
						eyebrow="Stage 2"
						title="配置区公共骨架"
						description="Stage 2 直接消费后端返回的固定行模型；可编辑态使用当前候选列表，只读冲突态保留恢复快照以便核对。"
						aside={<StatusPill label={stage2StatusLabel} tone={stage2StatusTone} />}
					>
						<NoticeStack messages={state.messages} blockingErrors={globalErrors} />
						<div className="overflow-hidden rounded-[24px] border border-line">
							<div className="grid grid-cols-[1.2fr_0.8fr_1fr] bg-panel px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
								<span>落地节点</span>
								<span>配置方式</span>
								<span>目标</span>
							</div>
							{stage2Rows.length === 0 ? (
								<div className="border-t border-line bg-surface px-4 py-6 text-sm leading-7 text-muted">
									尚未获得 Stage 2 初始化结果。请先填写 Stage 1 输入并执行“转换并自动填充”。
								</div>
							) : null}
							{stage2Rows.map((row) => {
								const rowMeta = getStage2RowMeta(row.landingNodeName);
								const rowErrors = getStage2RowErrors(row.landingNodeName);
								const targetChoices = getTargetChoices(state.stage2Init, row.mode);
								const restrictedReason = rowMeta?.restrictedModes?.[row.mode]?.reasonText;
								return (
								<div key={row.landingNodeName} className="border-t border-line bg-surface px-4 py-4 text-sm">
									<div className="grid grid-cols-1 gap-4 lg:grid-cols-[1.2fr_0.8fr_1fr] lg:items-start">
									<div>
										<p className="font-semibold text-ink">{row.landingNodeName}</p>
										<p className="text-xs text-muted">{isConflictReadonly ? "恢复冲突：当前只读展示恢复快照" : "稳定行模型由当前 stage2Init 决定"}</p>
									</div>
									<div>
										{isStage2Editable ? (
											<select
												value={row.mode}
												onChange={(event) => handleModeChange(row.landingNodeName, event.target.value as Stage2Row["mode"])}
												className="w-full rounded-[16px] border border-line bg-panel px-3 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft"
											>
												{modeOptions.map((mode) => {
													const disabledReason = rowMeta?.restrictedModes?.[mode]?.reasonText;
													return (
														<option key={mode} value={mode} disabled={disabledReason !== undefined}>
															{disabledReason ? `${modeLabelMap[mode]}（${disabledReason}）` : modeLabelMap[mode]}
														</option>
													);
												})}
											</select>
										) : (
											<div className="rounded-[16px] border border-line bg-panel px-3 py-3 text-sm text-ink">
												<p>{modeLabelMap[row.mode]}</p>
												{restrictedReason ? <p className="mt-1 text-xs text-muted">{restrictedReason}</p> : null}
											</div>
										)}
									</div>
									<div>
										{isStage2Editable ? (
											<select
												value={row.targetName ?? ""}
												onChange={(event) => handleTargetChange(row.landingNodeName, event.target.value)}
												disabled={row.mode === "none"}
												className="w-full rounded-[16px] border border-line bg-panel px-3 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
											>
												<option value="">{row.mode === "none" ? "当前模式无需目标" : "请选择目标"}</option>
												{targetChoices.map((choice) => (
													<option key={choice.value} value={choice.value} disabled={choice.disabled}>
														{choice.label}
													</option>
												))}
											</select>
										) : (
											<div className="rounded-[16px] border border-line bg-panel px-3 py-3 text-sm text-ink">
												{row.targetName ?? "当前模式无需目标"}
											</div>
										)}
									</div>
									</div>
									{rowErrors.length > 0 ? (
										<div className="mt-3 space-y-2">
											{rowErrors.map((error) => (
												<p key={`${row.landingNodeName}-${error.code}-${error.message}`} className="text-sm leading-7 text-danger">
													{error.message}
												</p>
											))}
										</div>
									) : null}
								</div>
								);
							})}
						</div>
						<div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-dashed border-line bg-panel px-4 py-4 text-sm leading-7 text-muted">
							<p>
								{isConflictReadonly
									? "当前恢复快照引用的目标已失效，仅供查看；请回到 Stage 1 重新执行转换并自动填充。"
									: state.stage2Stale
										? "Stage 1 已变更，当前 Stage 2 已过期；重新转换后才允许生成链接。"
										: state.stage2Init === null
											? "Stage 2 仍在等待后端初始化结果。"
											: "当前 Stage 2 已可编辑，生成时会提交完整的 Stage 1 与 Stage 2 快照。"}
							</p>
							<button
								type="button"
								onClick={handleGenerate}
								disabled={!canGenerate}
								className="rounded-[18px] bg-ink px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
							>
								{isGenerating ? "校验并生成链接..." : "生成链接"}
							</button>
						</div>
					</StageCard>

					<StageCard
						eyebrow="Stage 3"
						title="输出区与操作位"
						description="长链接始终是规范来源；可按需生成短链接，并直接对当前选中的订阅链接执行打开、复制和下载。"
						aside={<StatusPill label={state.generatedUrls?.shortUrl ? "Short URL Ready" : "Long URL Preview"} tone="success" />}
					>
						<NoticeStack messages={state.messages} blockingErrors={globalErrors} />
						{state.generatedUrls !== null ? (
							<ToggleField
								label="使用短链接"
								description={isCreatingShortUrl ? "正在创建短链接..." : "开启后优先展示短链接；首次开启时会调用 short-links 接口创建别名。"}
								checked={state.generatedUrls.preferShortUrl && state.generatedUrls.shortUrl !== null}
								disabled={isCreatingShortUrl}
								onChange={(checked) => void handlePreferShortUrl(checked)}
							/>
						) : null}
						<div className="rounded-[24px] border border-line bg-panel p-4">
							<p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Current Output</p>
							<p className="break-all rounded-[18px] bg-surface px-4 py-4 font-mono text-sm leading-7 text-ink">{activeOutput}</p>
						</div>
						<div className="flex flex-wrap gap-3">
							<button type="button" onClick={handleOpenOutput} disabled={state.generatedUrls === null} className="rounded-[18px] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-60">打开</button>
							<button type="button" onClick={() => void handleCopyOutput()} disabled={state.generatedUrls === null} className="rounded-[18px] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-60">{copyState === "done" ? "已复制" : copyState === "failed" ? "复制失败" : "复制"}</button>
							<button type="button" onClick={handleDownloadOutput} disabled={state.generatedUrls === null} className="rounded-[18px] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink transition disabled:cursor-not-allowed disabled:opacity-60">下载</button>
						</div>
					</StageCard>
				</main>
			</div>
		</div>
	);
}