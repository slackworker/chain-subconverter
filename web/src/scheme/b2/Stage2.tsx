import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import {
	getStage2DisplayModeOptions,
	getStage2RowEditableName,
	getStage2RowStrictKey,
	getStage2RowSourceLandingName,
	getStage2TargetDisplayLabel,
	isStage2SourceRow,
} from "../../lib/stage2";
import { NoticeRenderer } from "./Notice";
import { AlertTriangleIcon } from "./Icons";

const MODE_LABELS: Record<string, string> = {
	none: "不配置",
	chain: "链式代理",
	port_forward: "端口转发",
};

export function Stage2({ workflow }: { workflow: AppWorkflowViewModel }) {
	const {
		stage2Rows,
		isStage2Editable,
		isGenerating,
		canGenerate,
		shouldShowStage2StaleNotice,
		isConflictReadonly,
		state,
	} = workflow;

	const errors =
		state.stage2Stale || isConflictReadonly ? [] : workflow.getPrimaryBlockingErrorsForStage("stage2");
	const messages = workflow.getStageMessages("stage2");

	return (
		<div className="flex flex-col gap-6 bg-zinc-900/50 backdrop-blur-xl border border-zinc-800/80 p-6 rounded-2xl shadow-xl mt-6">
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className="text-2xl font-semibold text-zinc-100 tracking-tight">2. 节点配置</h2>
					<p className="text-zinc-400 text-sm mt-1">按需调整各个落地节点的路由模式</p>
				</div>
				<span
					className={`shrink-0 px-3 py-1 text-xs font-medium rounded-full border ${
						workflow.stage2Status.tone === "success"
							? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
							: workflow.stage2Status.tone === "warning"
								? "bg-amber-500/10 text-amber-400 border-amber-500/20"
								: "bg-zinc-800/80 text-zinc-400 border-zinc-700/50"
					}`}
				>
					{workflow.stage2Status.label}
				</span>
			</div>

			{isConflictReadonly ? (
				<div className="text-sm text-amber-200 bg-amber-500/10 border border-amber-500/30 rounded-xl px-4 py-3">
					当前恢复快照引用的目标已失效，恢复结果仅供查看。请回到阶段 1 重新执行「转换并自动填充」后再继续。
				</div>
			) : null}

			{shouldShowStage2StaleNotice && !isConflictReadonly ? (
				<div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
					已变更：请重新执行转换后再生成链接。
				</div>
			) : null}

			<NoticeRenderer messages={messages} blockingErrors={errors} responseOriginStage={workflow.responseOriginStage} />

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
								{stage2Rows.map((row) => (
									<Stage2RowItem key={getStage2RowStrictKey(row)} row={row} workflow={workflow} disabled={!isStage2Editable} />
								))}
							</tbody>
						</table>
					</div>

					<div className="flex flex-col sm:flex-row sm:items-center sm:justify-end gap-3 pt-4">
						{errors.length > 0 ? (
							<div className="text-sm text-red-300 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2 sm:mr-auto">
								{errors.map((error) => (
									<p key={`${error.code}:${error.message}`}>{error.message}</p>
								))}
							</div>
						) : null}
						<button
							type="button"
							onClick={() => void workflow.handleGenerate()}
							disabled={!canGenerate || isGenerating}
							className="px-6 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white rounded-xl font-medium shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center min-w-[120px]"
						>
							{isGenerating ? (
								<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
							) : (
								"生成链接"
							)}
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
	disabled,
}: {
	row: (typeof import("../../lib/state").initialAppState.stage2Snapshot.rows)[0];
	workflow: AppWorkflowViewModel;
	disabled: boolean;
}) {
	const rowKey = getStage2RowStrictKey(row);
	const sourceLandingName = getStage2RowSourceLandingName(row);
	const sourceRow = isStage2SourceRow(row);
	const canDeleteRow = !sourceRow && workflow.canDeleteStage2Row(rowKey);
	const meta = workflow.getStage2RowMeta(rowKey);
	const errors = workflow.getStage2RowErrors(rowKey);
	const isSnapshotOnly = workflow.state.stage2Init === null;
	const modeOptions = getStage2DisplayModeOptions(workflow.state.stage2Init, row.mode);
	const targetDisplayLabel = getStage2TargetDisplayLabel(workflow.state.stage2Init, workflow.stage2Rows, row);
	const modeWarningText = meta?.modeWarnings?.[row.mode]?.reasonText;

	const renderTargetSelector = () => {
		if (row.mode === "none") {
			return <div className="text-zinc-600 italic px-3 py-2">--</div>;
		}

		if (isSnapshotOnly) {
			return (
				<select className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 appearance-none" value={row.targetName || ""} disabled>
					<option value="" disabled>
						{row.mode === "chain" ? "请选择中转目标" : "请选择端口转发服务"}
					</option>
					{row.targetName ? <option value={row.targetName}>{targetDisplayLabel ?? row.targetName}</option> : null}
				</select>
			);
		}

		if (row.mode === "chain") {
			const groups = workflow.getChainTargetChoiceGroups();
			return (
				<select
					className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 appearance-none"
					value={row.targetName || ""}
					disabled={disabled}
					onChange={(event) => workflow.handleTargetChange(rowKey, event.target.value)}
				>
					<option value="" disabled>
						请选择中转目标
					</option>
					{groups.map((group) => (
						<optgroup key={group.title} label={group.title}>
							{group.choices.map((choice) => (
								<option key={choice.value} value={choice.value} disabled={choice.disabled}>
									{choice.label}
								</option>
							))}
						</optgroup>
					))}
				</select>
			);
		}

		if (row.mode === "port_forward") {
			const choices = workflow.getForwardRelayChoices(rowKey);
			const displayChoices =
				!disabled &&
				isSnapshotOnly === false &&
				row.targetName !== null &&
				!choices.some((choice) => choice.value === row.targetName)
					? [{ value: row.targetName, label: row.targetName, disabled: false }, ...choices]
					: choices;

			return (
				<select
					className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 appearance-none"
					value={row.targetName || ""}
					disabled={disabled}
					onChange={(event) => workflow.handleTargetChange(rowKey, event.target.value)}
				>
					<option value="" disabled>
						请选择端口转发服务
					</option>
					{displayChoices.map((choice) => (
						<option key={choice.value} value={choice.value} disabled={choice.disabled}>
							{choice.label}
						</option>
					))}
				</select>
			);
		}

		return null;
	};

	return (
		<>
			<tr className="group">
				<td className="py-3 px-4 align-top">
					<div className="flex max-w-[260px] flex-col gap-2">
						<input
							className={`w-full bg-zinc-950 border rounded-lg px-3 py-2 text-zinc-200 font-mono focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 ${
								errors.length > 0 ? "border-red-500/70" : "border-zinc-800"
							}`}
							value={getStage2RowEditableName(row)}
							disabled={disabled}
							aria-label="节点名"
							onChange={(event) => workflow.handleProxyNameChange(rowKey, event.target.value)}
						/>
						<div className="flex flex-wrap gap-2">
							{sourceRow ? (
								<button
									type="button"
									className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
									disabled={disabled}
									onClick={() => workflow.handleCloneStage2Row(rowKey)}
								>
									复制
								</button>
							) : (
								<button
									type="button"
									className="rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 transition-colors hover:border-zinc-500 hover:text-zinc-100 disabled:opacity-40"
									disabled={disabled || !canDeleteRow}
									title={canDeleteRow ? undefined : "至少保留一行"}
									onClick={() => workflow.handleDeleteStage2Row(rowKey)}
								>
									删除
								</button>
							)}
						</div>
						<div className="text-xs text-zinc-500 truncate" title={sourceLandingName}>
							来源: {sourceLandingName}
						</div>
					</div>
				</td>
				<td className="py-3 px-4 text-zinc-400">{meta?.landingNodeType || "-"}</td>
				<td className="py-3 px-4">
					<select
						className="w-full bg-zinc-950 border border-zinc-800 rounded-lg px-3 py-2 text-zinc-200 focus:outline-none focus:border-indigo-500 transition-colors disabled:opacity-50 appearance-none min-w-[120px]"
						value={row.mode}
						disabled={disabled}
						onChange={(event) => workflow.handleModeChange(rowKey, event.target.value as typeof row.mode)}
					>
						{modeOptions.map((mode) => {
							const restriction = meta?.restrictedModes?.[mode];
							const warning = meta?.modeWarnings?.[mode];
							const label = MODE_LABELS[mode] ?? mode;
							return (
								<option key={mode} value={mode} disabled={Boolean(restriction)} title={warning?.reasonText}>
									{restriction ? `${label}（${restriction.reasonText}）` : label}
								</option>
							);
						})}
					</select>
				</td>
				<td className="py-3 px-4">{renderTargetSelector()}</td>
			</tr>
			{(errors.length > 0 || modeWarningText) && (
				<tr>
					<td colSpan={4} className="px-4 pb-3">
						<div className="flex flex-col gap-1 -mt-2">
							{modeWarningText ? (
								<div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2 py-1 rounded w-fit">
									<AlertTriangleIcon className="w-3.5 h-3.5" />
									{modeWarningText}
								</div>
							) : null}
							{errors.map((error, index) => (
								<span key={index} className="text-xs text-red-400 px-2">
									{error.message}
								</span>
							))}
						</div>
					</td>
				</tr>
			)}
		</>
	);
}
