import { useState } from "react";
import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import { Socks5Modal, PortForwardModal } from "./Modals";
import { TagInput } from "./TagInput";
import { ChevronDownIcon } from "./Icons";
import { NoticeRenderer } from "./Notice";

export function Stage1({ workflow }: { workflow: AppWorkflowViewModel }) {
	const [isSocks5Open, setIsSocks5Open] = useState(false);
	const [isPortForwardOpen, setIsPortForwardOpen] = useState(false);
	const [isAdvancedOpen, setIsAdvancedOpen] = useState(false);

	const { state, updateStage1Input, isConverting, isConflictReadonly } = workflow;
	const stage1Input = state.stage1Input;

	const handleSocks5Submit = (uri: string) => {
		updateStage1Input(curr => ({
			...curr,
			landingRawText: curr.landingRawText ? curr.landingRawText + "\n" + uri : uri
		}));
		setIsSocks5Open(false);
	};

	const handlePortForwardSubmit = (items: string[]) => {
		updateStage1Input(curr => ({
			...curr,
			forwardRelayItems: items
		}));
		setIsPortForwardOpen(false);
	};

	const handleToggleEnablePortForward = () => {
		const nextState = !stage1Input.advancedOptions.enablePortForward;
		updateStage1Input(curr => ({
			...curr,
			forwardRelayItems: nextState ? curr.forwardRelayItems : [],
			advancedOptions: {
				...curr.advancedOptions,
				enablePortForward: nextState
			}
		}));
	};

	const errors = workflow.getPrimaryBlockingErrorsForStage("stage1");
	const messages = workflow.getStageMessages("stage1");

	return (
		<div className="flex flex-col gap-6 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 p-6 rounded-2xl shadow-xl">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">1. 输入订阅信息</h2>
					<p className="text-zinc-400 text-sm mt-1">请填写您的落地节点与中转节点信息</p>
				</div>
				{workflow.stage1Status.tone === "success" && (
					<span className="px-3 py-1 bg-emerald-500/10 text-emerald-400 text-xs font-medium rounded-full border border-emerald-500/20">
						转换成功
					</span>
				)}
			</div>

			<NoticeRenderer messages={messages} blockingErrors={errors} />

			<div className="flex flex-col md:flex-row gap-6">
				{/* 落地节点 */}
				<div className="flex-1 flex flex-col gap-2">
					<div className="flex justify-between items-center">
						<label className="text-sm font-medium text-zinc-300">落地节点信息</label>
						<button 
							onClick={() => setIsSocks5Open(true)}
							disabled={isConflictReadonly}
							className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
						>
							+ 添加 SOCKS5
						</button>
					</div>
					<textarea
						className="w-full h-40 bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 font-mono resize-none focus:outline-none focus:border-indigo-500/50 transition-colors disabled:opacity-50 whitespace-pre overflow-x-auto"
						placeholder="每行一个节点或订阅链接"
						value={stage1Input.landingRawText}
						disabled={isConflictReadonly}
						onChange={e => updateStage1Input(c => ({ ...c, landingRawText: e.target.value }))}
					/>
					<FieldErrors errors={workflow.getStage1FieldErrors("landingRawText")} />
				</div>

				{/* 中转节点 */}
				<div className="flex-1 flex flex-col gap-2">
					<div className="flex justify-between items-center">
						<label className="text-sm font-medium text-zinc-300">中转信息</label>
						{stage1Input.advancedOptions.enablePortForward && (
							<button 
								onClick={() => setIsPortForwardOpen(true)}
								disabled={isConflictReadonly}
								className="text-xs text-indigo-400 hover:text-indigo-300 transition-colors disabled:opacity-50"
							>
								+ 端口转发
							</button>
						)}
					</div>
					<textarea
						className="w-full h-40 bg-zinc-950/80 border border-zinc-800 rounded-xl p-3 text-sm text-zinc-200 font-mono resize-none focus:outline-none focus:border-indigo-500/50 transition-colors disabled:opacity-50 whitespace-pre overflow-x-auto"
						placeholder="每行一个节点或订阅链接"
						value={stage1Input.transitRawText}
						disabled={isConflictReadonly}
						onChange={e => updateStage1Input(c => ({ ...c, transitRawText: e.target.value }))}
					/>
					<FieldErrors errors={workflow.getStage1FieldErrors("transitRawText")} />
					
					{stage1Input.advancedOptions.enablePortForward && stage1Input.forwardRelayItems.length > 0 && (
						<div className="flex flex-wrap gap-2 p-2 bg-zinc-950 border border-zinc-800 rounded-lg">
							{stage1Input.forwardRelayItems.map((item: string) => (
								<div key={item} className="text-xs px-2 py-1 bg-indigo-500/20 text-indigo-300 rounded border border-indigo-500/20">
									{item}
								</div>
							))}
						</div>
					)}
					<FieldErrors errors={workflow.getStage1FieldErrors("forwardRelayItems")} />
				</div>
			</div>

			{/* 高级选项 */}
			<div className="flex flex-col gap-3 bg-zinc-950/50 border border-zinc-800/50 rounded-xl p-4">
				<button 
					className="flex items-center gap-2 text-zinc-300 text-sm font-medium hover:text-white transition-colors w-full text-left"
					onClick={() => setIsAdvancedOpen(!isAdvancedOpen)}
				>
					<ChevronDownIcon className={`w-4 h-4 transition-transform ${isAdvancedOpen ? "rotate-180" : ""}`} />
					高级选项
				</button>
				
				{isAdvancedOpen && (
					<div className="flex flex-col gap-5 pt-3 border-t border-zinc-800/50">
						<div className="flex flex-col gap-2">
							<label className="text-xs text-zinc-400">模板 URL</label>
							<input 
								className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-sm text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50"
								placeholder="请使用带地域分组的模板，留空将使用推荐的 Aethersailor 模板"
								disabled={isConflictReadonly}
								value={stage1Input.advancedOptions.config ?? ""}
								onChange={e => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, config: e.target.value || null } }))}
							/>
							<FieldErrors errors={workflow.getStage1FieldErrors("config")} />
						</div>

						<div className="flex flex-col md:flex-row gap-4">
							<div className="flex-1 flex flex-col gap-2">
								<label className="text-xs text-zinc-400">包含节点 (include)</label>
								<TagInput 
									tags={stage1Input.advancedOptions.include || []}
									onChange={tags => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, include: tags.length ? tags : null } }))}
									placeholder="输入节点匹配规则"
								/>
								<FieldErrors errors={workflow.getStage1FieldErrors("include")} />
							</div>
							<div className="flex-1 flex flex-col gap-2">
								<label className="text-xs text-zinc-400">排除节点 (exclude)</label>
								<TagInput 
									tags={stage1Input.advancedOptions.exclude || []}
									onChange={tags => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, exclude: tags.length ? tags : null } }))}
									placeholder="输入要排除的节点规则"
								/>
								<FieldErrors errors={workflow.getStage1FieldErrors("exclude")} />
							</div>
						</div>

						<div className="flex flex-wrap gap-6 pt-2">
							<label className="flex items-center gap-2 cursor-pointer group">
								<div className="relative flex items-center justify-center">
									<input type="checkbox" className="peer appearance-none w-5 h-5 border border-zinc-700 rounded bg-zinc-950 checked:bg-indigo-600 checked:border-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
										checked={stage1Input.advancedOptions.emoji ?? false}
										disabled={isConflictReadonly}
										onChange={e => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, emoji: e.target.checked || null } }))}
									/>
									<svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none"><path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
								</div>
								<span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">保留 Emoji</span>
							</label>

							<label className="flex items-center gap-2 cursor-pointer group">
								<div className="relative flex items-center justify-center">
									<input type="checkbox" className="peer appearance-none w-5 h-5 border border-zinc-700 rounded bg-zinc-950 checked:bg-indigo-600 checked:border-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
										checked={stage1Input.advancedOptions.udp ?? false}
										disabled={isConflictReadonly}
										onChange={e => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, udp: e.target.checked || null } }))}
									/>
									<svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none"><path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
								</div>
								<span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">开启 UDP</span>
							</label>

							<label className="flex items-center gap-2 cursor-pointer group">
								<div className="relative flex items-center justify-center">
									<input type="checkbox" className="peer appearance-none w-5 h-5 border border-zinc-700 rounded bg-zinc-950 checked:bg-indigo-600 checked:border-indigo-500 transition-colors cursor-pointer disabled:opacity-50"
										checked={stage1Input.advancedOptions.skipCertVerify ?? false}
										disabled={isConflictReadonly}
										onChange={e => updateStage1Input(c => ({ ...c, advancedOptions: { ...c.advancedOptions, skipCertVerify: e.target.checked || null } }))}
									/>
									<svg className="absolute w-3 h-3 text-white pointer-events-none opacity-0 peer-checked:opacity-100" viewBox="0 0 14 10" fill="none"><path d="M1 5L4.5 8.5L13 1" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>
								</div>
								<span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">跳过证书验证</span>
							</label>

							<div className="w-px bg-zinc-800 mx-2" />

							<label className="flex items-center gap-2 cursor-pointer group">
								<div className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${stage1Input.advancedOptions.enablePortForward ? 'bg-indigo-600' : 'bg-zinc-700'}`}>
									<span className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${stage1Input.advancedOptions.enablePortForward ? 'translate-x-5' : 'translate-x-1'}`} />
									<input 
										type="checkbox" 
										className="absolute inset-0 w-full h-full opacity-0 cursor-pointer disabled:cursor-not-allowed"
										checked={stage1Input.advancedOptions.enablePortForward}
										disabled={isConflictReadonly}
										onChange={handleToggleEnablePortForward}
									/>
								</div>
								<span className="text-sm text-zinc-300 group-hover:text-zinc-100 transition-colors">启用端口转发服务</span>
							</label>
						</div>
					</div>
				)}
			</div>

			<div className="flex justify-end pt-2">
				<button 
					onClick={() => workflow.handleStage1Convert()}
					disabled={isConverting || isConflictReadonly || (stage1Input.landingRawText.trim() === "" && stage1Input.transitRawText.trim() === "")}
					className="px-6 py-2.5 bg-gradient-to-r from-indigo-600 to-violet-600 hover:from-indigo-500 hover:to-violet-500 text-white rounded-xl font-medium shadow-lg shadow-indigo-500/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center min-w-[120px]"
				>
					{isConverting ? (
						<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
					) : "转换并自动填充"}
				</button>
			</div>

			<Socks5Modal 
				isOpen={isSocks5Open} 
				onClose={() => setIsSocks5Open(false)} 
				onSubmit={handleSocks5Submit} 
			/>
			<PortForwardModal 
				isOpen={isPortForwardOpen} 
				onClose={() => setIsPortForwardOpen(false)} 
				initialItems={stage1Input.forwardRelayItems}
				onSubmit={handlePortForwardSubmit} 
			/>
		</div>
	);
}

function FieldErrors({ errors }: { errors: { message: string }[] }) {
	if (!errors || errors.length === 0) return null;
	return (
		<div className="flex flex-col gap-1 mt-1">
			{errors.map((e, i) => <span key={i} className="text-xs text-red-400">{e.message}</span>)}
		</div>
	);
}
