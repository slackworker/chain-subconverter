import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import { NoticeRenderer } from "./Notice";
import { AlertTriangleIcon } from "./Icons";

export function Stage2({ workflow }: { workflow: AppWorkflowViewModel }) {
	const { stage2Rows, isStage2Editable, isGenerating, canGenerate, shouldShowStage2StaleNotice } = workflow;
	
	const errors = workflow.getPrimaryBlockingErrorsForStage("stage2");
	const messages = workflow.getStageMessages("stage2");

	return (
		<div className="flex flex-col gap-6 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 p-6 rounded-2xl shadow-xl mt-6">
			<div className="flex items-center justify-between">
				<div>
					<h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">2. 节点配置</h2>
					<p className="text-zinc-400 text-sm mt-1">按需调整各个落地节点的路由模式</p>
				</div>
				{shouldShowStage2StaleNotice && (
					<span className="px-3 py-1 bg-amber-500/10 text-amber-400 text-xs font-medium rounded-full border border-amber-500/20">
						数据已过期，请重新转换
					</span>
				)}
			</div>

			<NoticeRenderer messages={messages} blockingErrors={errors} />

			{stage2Rows.length === 0 ? (
				<div className="py-12 flex items-center justify-center text-zinc-500 text-sm border border-dashed border-zinc-800 rounded-xl">
					请先在上方输入信息并点击「转换并自动填充」
				</div>
			) : (
				<div className="flex flex-col gap-3">
					<div className="overflow-x-auto">
						<table className="w-full text-left text-sm whitespace-nowrap">
							<thead>
								<tr className="text-zinc-400 border-b border-zinc-800/50">
									<th className="font-medium pb-3 px-4">落地节点</th>
									<th className="font-medium pb-3 px-4">类型</th>
									<th className="font-medium pb-3 px-4">配置方式</th>
									<th className="font-medium pb-3 px-4 w-1/3">目标</th>
								</tr>
							</thead>
							<tbody className="divide-y divide-zinc-800/50">
								{stage2Rows.map(row => (
									<Stage2RowItem 
										key={row.landingNodeName} 
										row={row} 
										workflow={workflow} 
										disabled={!isStage2Editable} 
									/>
								))}
							</tbody>
						</table>
					</div>

					<div className="flex justify-end pt-4">
						<button 
							onClick={() => workflow.handleGenerate()}
							disabled={!canGenerate}
							className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-medium shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center min-w-[120px]"
						>
							{isGenerating ? (
								<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
							) : "生成链接"}
						</button>
					</div>
				</div>
			)}
		</div>
	);
}

function Stage2RowItem({ 
	row, 
	workflow, 
	disabled 
}: { 
	row: typeof import("../../lib/state").initialAppState.stage2Snapshot.rows[0]; 
	workflow: AppWorkflowViewModel;
	disabled: boolean;
}) {
	const meta = workflow.getStage2RowMeta(row.landingNodeName);
	const errors = workflow.getStage2RowErrors(row.landingNodeName);
	
	const modeOptions = workflow.modeOptions;

	const renderTargetSelector = () => {
		if (row.mode === "none") {
			return <div className="text-zinc-600 italic px-3 py-2">无需目标</div>;
		}

		if (row.mode === "chain") {
			const groups = workflow.getChainTargetChoiceGroups();
			return (
				<select 
					className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 appearance-none"
					value={row.targetName || ""}
					disabled={disabled}
					onChange={e => workflow.handleTargetChange(row.landingNodeName, e.target.value)}
				>
					<option value="" disabled>请选择中转目标</option>
					{groups.map(g => (
						<optgroup key={g.title} label={g.title}>
							{g.choices.map(c => (
								<option key={c.value} value={c.value} disabled={c.disabled}>
									{c.label}
								</option>
							))}
						</optgroup>
					))}
				</select>
			);
		}

		if (row.mode === "port_forward") {
			const choices = workflow.getForwardRelayChoices(row.landingNodeName);
			return (
				<select 
					className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 appearance-none"
					value={row.targetName || ""}
					disabled={disabled}
					onChange={e => workflow.handleTargetChange(row.landingNodeName, e.target.value)}
				>
					<option value="" disabled>请选择端口转发服务</option>
					{choices.map(c => (
						<option key={c.value} value={c.value} disabled={c.disabled}>
							{c.label}
						</option>
					))}
				</select>
			);
		}
		return null;
	};

	const modeWarningText = meta?.modeWarnings?.[row.mode]?.reasonText;

	return (
		<>
			<tr className="group">
				<td className="py-3 px-4 font-mono text-zinc-300 max-w-[200px] truncate" title={row.landingNodeName}>
					{row.landingNodeName}
				</td>
				<td className="py-3 px-4 text-zinc-400">
					{meta?.landingNodeType || "-"}
				</td>
				<td className="py-3 px-4">
					<select 
						className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 appearance-none min-w-[120px]"
						value={row.mode}
						disabled={disabled}
						onChange={e => workflow.handleModeChange(row.landingNodeName, e.target.value as any)}
					>
						{modeOptions.map(m => {
							const isRestricted = !!meta?.restrictedModes?.[m];
							const isWarning = !!meta?.modeWarnings?.[m];
							const text = m === "none" ? "直接连接 (none)" : m === "chain" ? "链式代理 (chain)" : "端口转发 (port_forward)";
							const reason = meta?.restrictedModes?.[m]?.reasonText;
							return (
								<option key={m} value={m} disabled={isRestricted}>
									{text} {isRestricted ? `(${reason})` : isWarning ? `(不推荐)` : ""}
								</option>
							);
						})}
					</select>
				</td>
				<td className="py-3 px-4">
					{renderTargetSelector()}
				</td>
			</tr>
			{(errors.length > 0 || modeWarningText) && (
				<tr>
					<td colSpan={4} className="px-4 pb-3">
						<div className="flex flex-col gap-1 -mt-2">
							{modeWarningText && (
								<div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded w-fit">
									<AlertTriangleIcon className="w-3.5 h-3.5" />
									{modeWarningText}
								</div>
							)}
							{errors.map((e, i) => (
								<span key={i} className="text-xs text-red-400 px-2">{e.message}</span>
							))}
						</div>
					</td>
				</tr>
			)}
		</>
	);
}
