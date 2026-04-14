import { useEffect, useState } from "react";

import { ChainTargetPicker } from "./components/ChainTargetPicker";
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

interface ManualSocks5FormState {
	name: string;
	server: string;
	port: string;
	username: string;
	password: string;
}

const initialManualSocks5FormState: ManualSocks5FormState = {
	name: "",
	server: "",
	port: "",
	username: "",
	password: "",
};

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

function appendMultilineValue(currentValue: string, nextLine: string) {
	if (currentValue === "") {
		return nextLine;
	}
	return currentValue.endsWith("\n") ? `${currentValue}${nextLine}` : `${currentValue}\n${nextLine}`;
}

function buildManualSocks5URI(formState: ManualSocks5FormState) {
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
	const [state, setState] = useState(initialAppState);
	const [isAdvancedOptionsOpen, setIsAdvancedOptionsOpen] = useState(false);
	const [manualSocks5Form, setManualSocks5Form] = useState(initialManualSocks5FormState);
	const [manualSocks5Error, setManualSocks5Error] = useState<string | null>(null);
	const [isConverting, setIsConverting] = useState(false);
	const [isRestoring, setIsRestoring] = useState(false);
	const [isGenerating, setIsGenerating] = useState(false);
	const [isCreatingShortUrl, setIsCreatingShortUrl] = useState(false);
	const [copyState, setCopyState] = useState<"idle" | "done" | "failed">("idle");

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
	const stage1StatusLabel =
		state.stage1Input.landingRawText.trim() === "" && state.stage1Input.transitRawText.trim() === ""
			? "Awaiting Input"
			: state.stage2Stale && stage2Rows.length > 0
				? "Changed"
				: state.stage2Init !== null
					? "Converted"
					: "Editing";
	const stage1StatusTone = state.stage2Init !== null && !state.stage2Stale ? "success" : stage1StatusLabel === "Changed" ? "warning" : "neutral";
	const stage3StatusLabel = state.generatedUrls === null ? "Awaiting Generate" : state.generatedUrls.shortUrl ? "Short URL Ready" : "Long URL Ready";
	const stage3StatusTone = state.generatedUrls === null ? "neutral" : "success";
	const restoreStatusLabel = state.restoreStatus === "idle" ? "Idle" : state.restoreStatus;

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

	function updateManualSocks5Field(field: keyof ManualSocks5FormState, value: string) {
		setManualSocks5Form((current) => ({
			...current,
			[field]: value,
		}));
		if (manualSocks5Error !== null) {
			setManualSocks5Error(null);
		}
	}

	function handleAppendManualSocks5() {
		try {
			const socks5URI = buildManualSocks5URI(manualSocks5Form);
			updateStage1Input((current) => ({
				...current,
				landingRawText: appendMultilineValue(current.landingRawText, socks5URI),
			}));
			setManualSocks5Form(initialManualSocks5FormState);
			setManualSocks5Error(null);
		} catch (error) {
			setManualSocks5Error(error instanceof Error ? error.message : "无法追加 SOCKS5 节点");
		}
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
			<div className="mx-auto flex min-h-screen max-w-6xl flex-col px-4 py-6 md:px-8 md:py-10">
				<main className="space-y-6">
					<div id="restore" className="scroll-mt-32">
					<StageCard
						eyebrow="Restore"
						title="恢复入口"
						description="支持从 longUrl 或 shortUrl 恢复 Stage 1 与 Stage 2；可重放时进入可编辑态，冲突时保留只读快照。"
						aside={<StatusPill label={restoreStatusLabel} />}
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
					</div>

					<div id="stage-1" className="scroll-mt-32">
					<StageCard
						eyebrow="Stage 1"
						title="输入与自动填充"
						description="按 spec 收集落地与中转输入，修改任一输入后 Stage 2 标记过期，需重新执行转换并自动填充。"
						aside={<StatusPill label={stage1StatusLabel} tone={stage1StatusTone} />}
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
							<div className="rounded-[24px] border border-line bg-panel p-4">
								<div className="flex flex-wrap items-start justify-between gap-3">
									<div>
										<p className="text-sm font-semibold text-ink">手动添加 SOCKS5 节点</p>
										<p className="mt-1 text-sm leading-6 text-muted">只支持 SOCKS5。提交后会生成标准 socks5 URI，并追加到落地输入区末尾。</p>
									</div>
									<button
										type="button"
										onClick={handleAppendManualSocks5}
										className="rounded-[18px] border border-line bg-surface px-4 py-3 text-sm font-semibold text-ink transition hover:border-accent hover:text-accent"
									>
										追加到落地信息
									</button>
								</div>
								<div className="mt-4 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
									<TextField
										label="节点名称"
										helper="必填"
										placeholder="Tokyo Socks"
										value={manualSocks5Form.name}
										onChange={(value) => updateManualSocks5Field("name", value)}
									/>
									<TextField
										label="服务器地址"
										helper="必填"
										placeholder="relay.example.com"
										value={manualSocks5Form.server}
										onChange={(value) => updateManualSocks5Field("server", value)}
									/>
									<TextField
										label="端口"
										helper="1-65535"
										placeholder="1080"
										value={manualSocks5Form.port}
										onChange={(value) => updateManualSocks5Field("port", value)}
									/>
									<TextField
										label="用户名"
										helper="可选"
										placeholder="username"
										value={manualSocks5Form.username}
										onChange={(value) => updateManualSocks5Field("username", value)}
									/>
									<TextField
										label="密码"
										helper="与用户名成对出现"
										placeholder="password"
										value={manualSocks5Form.password}
										onChange={(value) => updateManualSocks5Field("password", value)}
									/>
								</div>
								{manualSocks5Error ? <p className="mt-3 text-sm leading-7 text-danger">{manualSocks5Error}</p> : null}
							</div>
							<TextAreaField
								label="中转信息"
								helper="支持订阅 URL、节点 URI、data:text/plain"
								placeholder="https://example.com/subscription.txt"
								value={state.stage1Input.transitRawText}
								onChange={(value) => updateStage1Input((current) => ({ ...current, transitRawText: value }))}
							/>
							<FieldErrorList errors={state.blockingErrors} field="transitRawText" />

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

							<div className="overflow-hidden rounded-[24px] border border-line bg-panel">
								<button
									type="button"
									onClick={() => setIsAdvancedOptionsOpen((current) => !current)}
									className="flex w-full items-center justify-between gap-4 px-4 py-4 text-left"
								>
									<div>
										<p className="text-sm font-semibold text-ink">高级菜单</p>
										<p className="mt-1 text-sm leading-6 text-muted">Stage 1 的高级参数统一收纳在这里；展开后可编辑 emoji、udp、证书校验、模板 URL 与过滤条件。</p>
									</div>
									<span className="rounded-full border border-line px-3 py-1 text-xs font-semibold uppercase tracking-[0.18em] text-muted">
										{isAdvancedOptionsOpen ? "收起" : "展开"}
									</span>
								</button>
								{isAdvancedOptionsOpen ? (
									<div className="border-t border-line px-4 py-4">
										<div className="grid gap-4 lg:grid-cols-2">
											<ToggleField
												label="Emoji"
												description="对应上游 emoji 参数；当前前端 checkbox 只在 true 与 null 之间切换。"
												checked={state.stage1Input.advancedOptions.emoji === true}
												onChange={(checked) =>
													updateStage1Input((current) => ({
														...current,
														advancedOptions: {
															...current.advancedOptions,
															emoji: checked ? true : null,
														},
													}))
												}
											/>
											<ToggleField
												label="UDP"
												description="对应上游 udp 参数；当前前端 checkbox 只在 true 与 null 之间切换。"
												checked={state.stage1Input.advancedOptions.udp === true}
												onChange={(checked) =>
													updateStage1Input((current) => ({
														...current,
														advancedOptions: {
															...current.advancedOptions,
															udp: checked ? true : null,
														},
													}))
												}
											/>
											<ToggleField
												label="跳过证书验证"
												description="业务语义对应 skip_cert_verify；当前前端 checkbox 只在 true 与 null 之间切换，实际映射到上游 scv 参数。"
												checked={state.stage1Input.advancedOptions.skipCertVerify === true}
												onChange={(checked) =>
													updateStage1Input((current) => ({
														...current,
														advancedOptions: {
															...current.advancedOptions,
															skipCertVerify: checked ? true : null,
														},
													}))
												}
											/>
											<ToggleField
												label="启用端口转发（实验性）"
												description="关闭时会隐藏并清空端口转发服务输入区。"
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
										</div>
										<div className="mt-4 grid gap-4 lg:grid-cols-2">
											<div className="space-y-3">
												<TextField
													label="模板 URL"
													helper="留空时使用默认 Aethersailor 模板"
													placeholder="不填写将使用默认 Aethersailor 模板"
													value={state.stage1Input.advancedOptions.config ?? ""}
													inputAside={
														<span
															title="当前默认推荐模板 URL 为 https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini，上游更新可能导致规则变化。"
															aria-label="默认推荐模板提示"
															className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-warm/30 bg-warm/10 text-sm font-bold text-warm"
														>
															!
														</span>
													}
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
												<p className="rounded-[18px] border border-line bg-surface px-4 py-3 text-sm leading-7 text-muted">
													! 当前默认推荐模板 URL 为 https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini，上游更新可能导致规则变化。
												</p>
												<FieldErrorList errors={state.blockingErrors} field="config" />
											</div>
											<div className="space-y-3">
												<TextField
													label="Include"
													helper="非空时透传给上游 include"
													placeholder="hk|jp"
													value={state.stage1Input.advancedOptions.include ?? ""}
													onChange={(value) =>
														updateStage1Input((current) => ({
															...current,
															advancedOptions: {
																...current.advancedOptions,
																include: value.trim() === "" ? null : value,
															},
														}))
													}
												/>
												<FieldErrorList errors={state.blockingErrors} field="include" />
												<TextField
													label="Exclude"
													helper="非空时透传给上游 exclude"
													placeholder="test|expire"
													value={state.stage1Input.advancedOptions.exclude ?? ""}
													onChange={(value) =>
														updateStage1Input((current) => ({
															...current,
															advancedOptions: {
																...current.advancedOptions,
																exclude: value.trim() === "" ? null : value,
															},
														}))
													}
												/>
												<FieldErrorList errors={state.blockingErrors} field="exclude" />
											</div>
										</div>
									</div>
								) : null}
							</div>

							<div className="flex flex-wrap items-center justify-between gap-4 rounded-[24px] border border-dashed border-line bg-panel px-4 py-4">
								<p className="text-sm leading-7 text-muted">当前输入框已支持行号、禁止自动换行和横向滚动，长 URI 与多行订阅文本会按原始分行编辑。</p>
								<button type="button" onClick={handleStage1Convert} disabled={isConverting} className="rounded-[18px] bg-accent px-5 py-3 text-sm font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60">
									{isConverting ? "转换中..." : "转换并自动填充"}
								</button>
							</div>
						</div>
					</StageCard>
					</div>

					<div id="stage-2" className="scroll-mt-32">
					<StageCard
						eyebrow="Stage 2"
						title="配置区"
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
								const portForwardChoices = row.mode === "port_forward" ? getTargetChoices(state.stage2Init, row.mode) : [];
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
										{isStage2Editable && row.mode === "chain" ? (
											<ChainTargetPicker
												targets={state.stage2Init?.chainTargets ?? []}
												value={row.targetName}
												onChange={(targetName) => handleTargetChange(row.landingNodeName, targetName ?? "")}
											/>
										) : isStage2Editable ? (
											<select
												value={row.targetName ?? ""}
												onChange={(event) => handleTargetChange(row.landingNodeName, event.target.value)}
												disabled={row.mode === "none"}
												className="w-full rounded-[16px] border border-line bg-panel px-3 py-3 text-sm text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft disabled:cursor-not-allowed disabled:bg-surface disabled:text-muted"
											>
												<option value="">{row.mode === "none" ? "当前模式无需目标" : "请选择目标"}</option>
												{portForwardChoices.map((choice) => (
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
					</div>

					<div id="stage-3" className="scroll-mt-32">
					<StageCard
						eyebrow="Stage 3"
						title="输出区与操作位"
						description="长链接始终是规范来源；可按需生成短链接，并直接对当前选中的订阅链接执行打开、复制和下载。"
						aside={<StatusPill label={stage3StatusLabel} tone={stage3StatusTone} />}
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
					</div>
				</main>
			</div>
		</div>
	);
}