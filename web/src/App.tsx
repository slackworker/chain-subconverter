import { useEffect, useState } from "react";

import { FieldErrorList } from "./components/FieldErrorList";
import { NoticeStack } from "./components/NoticeStack";
import { StageCard } from "./components/StageCard";
import { StatusPill } from "./components/StatusPill";
import { TextAreaField } from "./components/TextAreaField";
import { TextField } from "./components/TextField";
import { ToggleField } from "./components/ToggleField";
import { getErrorResponse, postStage1Convert } from "./lib/api";
import { initialAppState } from "./lib/state";
import type { BlockingError, Stage1Input, Stage2Init } from "./types/api";

type ThemeMode = "dawn" | "night";

export default function App() {
	const [theme, setTheme] = useState<ThemeMode>("dawn");
	const [state, setState] = useState(initialAppState);
	const [isConverting, setIsConverting] = useState(false);

	useEffect(() => {
		document.documentElement.dataset.theme = theme;
	}, [theme]);

	const activeOutput = state.generatedUrls?.preferShortUrl && state.generatedUrls.shortUrl
		? state.generatedUrls.shortUrl
		: state.generatedUrls?.longUrl ?? "尚未生成链接";
	const globalErrors = state.blockingErrors.filter((error) => error.scope === "global");
	const stage2Rows = state.stage2Init?.rows ?? [];

	function updateStage1Input(updater: (current: Stage1Input) => Stage1Input) {
		setState((current) => ({
			...current,
			stage1Input: updater(current.stage1Input),
			generatedUrls: null,
			stage2Stale: true,
		}));
	}

	function applyStage2Init(stage2Init: Stage2Init) {
		setState((current) => ({
			...current,
			stage2Init,
			stage2Snapshot: {
				rows: stage2Init.rows.map((row) => ({
					landingNodeName: row.landingNodeName,
					mode: row.mode,
					targetName: row.targetName,
				})),
			},
			generatedUrls: null,
			stage2Stale: false,
		}));
	}

	async function handleStage1Convert() {
		setIsConverting(true);
		setState((current) => ({
			...current,
			messages: [],
			blockingErrors: [],
		}));

		try {
			const response = await postStage1Convert({ stage1Input: state.stage1Input });
			applyStage2Init(response.stage2Init);
			setState((current) => ({
				...current,
				messages: response.messages,
				blockingErrors: response.blockingErrors,
			}));
		} catch (error) {
			const errorResponse = getErrorResponse(error);
			const fallbackError: BlockingError = {
				code: "REQUEST_FAILED",
				message: error instanceof Error ? error.message : "请求失败",
				scope: "global",
			};
			setState((current) => ({
				...current,
				messages: errorResponse?.messages ?? [],
				blockingErrors: errorResponse?.blockingErrors ?? [fallbackError],
			}));
		} finally {
			setIsConverting(false);
		}
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
						description="单一 URL 恢复入口已经在公共壳层预留，后续接入 resolve-url 时直接复用当前消息区和状态位。"
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
								className="rounded-[20px] bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90"
							>
								恢复
							</button>
						</div>
					</StageCard>

					<StageCard
						eyebrow="Stage 1"
						title="输入与自动填充"
						description="当前主干基线先固定三段式输入结构、advanced options 容器和过期态提示，再允许 A/B/C 分支在页面编排上分化。"
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
								<p className="text-sm leading-7 text-muted">共享层已固定“修改 Stage 1 任意输入就让 Stage 2 过期”的行为，A/B/C 只允许改呈现方式，不允许改业务语义。</p>
								<button type="button" onClick={handleStage1Convert} disabled={isConverting} className="rounded-[18px] bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
									{isConverting ? "转换中..." : "转换并自动填充"}
								</button>
							</div>
						</div>
					</StageCard>

					<StageCard
						eyebrow="Stage 2"
						title="配置区公共骨架"
						description="当前表格行模型、mode 列和 target 列都已按后端契约固化为共享层；后续分支只能改信息层次和交互节奏。"
						aside={<StatusPill label={`${state.stage2Snapshot.rows.length} Rows`} tone={state.stage2Init === null ? "warning" : "success"} />}
					>
						<div className="overflow-hidden rounded-[24px] border border-line">
							<div className="grid grid-cols-[1.2fr_0.8fr_1fr] bg-panel px-4 py-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
								<span>落地节点</span>
								<span>配置方式</span>
								<span>目标</span>
							</div>
							{stage2Rows.length === 0 ? (
								<div className="border-t border-line bg-surface px-4 py-6 text-sm leading-7 text-muted">
									尚未获得 `stage2Init`。请先填写 Stage 1 输入并执行“转换并自动填充”。
								</div>
							) : null}
							{state.stage2Snapshot.rows.map((row) => (
								<div key={row.landingNodeName} className="grid grid-cols-[1.2fr_0.8fr_1fr] items-center gap-4 border-t border-line bg-surface px-4 py-4 text-sm">
									<div>
										<p className="font-semibold text-ink">{row.landingNodeName}</p>
										<p className="text-xs text-muted">稳定行模型由 stage2Init 决定</p>
									</div>
									<div>
										<span className="rounded-full bg-accentSoft px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-accent">{row.mode}</span>
									</div>
									<div className="text-muted">{row.targetName ?? "未选择"}</div>
								</div>
							))}
						</div>
						<div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-dashed border-line bg-panel px-4 py-4 text-sm leading-7 text-muted">
							<p>{state.stage2Init === null ? "Stage 2 仍在等待后端初始化结果。" : "Stage 2 已接入真实 stage2Init；下一步继续补编辑控件与 generate 主线。"}</p>
							<button
								type="button"
								disabled={state.stage2Stale}
								className="rounded-[18px] bg-ink px-5 py-3 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:bg-line disabled:text-muted"
							>
								生成链接
							</button>
						</div>
					</StageCard>

					<StageCard
						eyebrow="Stage 3"
						title="输出区与操作位"
						description="长链接始终是规范来源；短链接、恢复和订阅操作位都已在公共层固定位置，后面只补真实动作。"
						aside={<StatusPill label={state.generatedUrls?.shortUrl ? "Short URL Ready" : "Long URL Preview"} tone="success" />}
					>
						<div className="rounded-[24px] border border-line bg-panel p-4">
							<p className="mb-3 text-xs font-semibold uppercase tracking-[0.18em] text-muted">Current Output</p>
							<p className="break-all rounded-[18px] bg-surface px-4 py-4 font-mono text-sm leading-7 text-ink">{activeOutput}</p>
						</div>
						<div className="flex flex-wrap gap-3">
							<button type="button" className="rounded-[18px] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink">打开</button>
							<button type="button" className="rounded-[18px] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink">复制</button>
							<button type="button" className="rounded-[18px] border border-line bg-panel px-4 py-3 text-sm font-semibold text-ink">下载</button>
						</div>
					</StageCard>
				</main>
			</div>
		</div>
	);
}