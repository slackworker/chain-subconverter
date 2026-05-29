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
import type { ColorMode } from "./theme";
import {
	cardShell,
	cardSubtitle,
	cardTitle,
	emptyState,
	isDark,
	mutedText,
	neutralBadge,
	secondaryButton,
	selectField,
	tableBodyDivide,
	tableHead,
} from "./theme";

const MODE_LABELS: Record<string, string> = {
	none: "不配置",
	chain: "链式代理",
	port_forward: "端口转发",
};

export function Stage2({ workflow, colorMode }: { workflow: AppWorkflowViewModel; colorMode: ColorMode }) {
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

	const statusBadgeClass =
		workflow.stage2Status.tone === "success"
			? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20"
			: workflow.stage2Status.tone === "warning"
				? "bg-amber-500/10 text-amber-400 border-amber-500/20"
				: neutralBadge(colorMode);

	return (
		<div className={cardShell(colorMode)}>
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className={cardTitle(colorMode)}>2. 节点配置</h2>
					<p className={cardSubtitle(colorMode)}>按需调整各个落地节点的路由模式</p>
				</div>
				<span className={`shrink-0 px-3 py-1 text-xs font-semibold rounded-full border ${statusBadgeClass}`}>
					{workflow.stage2Status.label}
				</span>
			</div>

			{isConflictReadonly ? (
				<div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 p-4 rounded-xl flex items-start gap-3">
					<AlertTriangleIcon className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
					<div className="text-sm font-medium leading-relaxed">
						当前恢复快照引用的目标已失效，恢复结果仅供查看。请回到阶段 1 重新执行「转换并自动填充」后再继续。
					</div>
				</div>
			) : null}

			{shouldShowStage2StaleNotice && !isConflictReadonly ? (
				<div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
					已变更：请重新执行转换后再生成链接。
				</div>
			) : null}

			<NoticeRenderer messages={messages} blockingErrors={errors} responseOriginStage={workflow.responseOriginStage} />

			{stage2Rows.length === 0 ? (
				<div className={emptyState(colorMode)}>请先在上方输入信息并点击「转换并自动填充」</div>
			) : (
				<div className="flex flex-col gap-3">
					<div className="overflow-x-auto select-none">
						<table className="w-full text-left text-sm whitespace-nowrap border-collapse">
							<thead>
								<tr className={tableHead(colorMode)}>
									<th className="pb-3 px-4">落地节点</th>
									<th className="pb-3 px-4">类型</th>
									<th className="pb-3 px-4">配置方式</th>
									<th className="pb-3 px-4 w-1/3">目标</th>
								</tr>
							</thead>
							<tbody className={tableBodyDivide(colorMode)}>
								{stage2Rows.map((row) => (
									<Stage2RowItem
										key={getStage2RowStrictKey(row)}
										row={row}
										workflow={workflow}
										disabled={!isStage2Editable}
										colorMode={colorMode}
									/>
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
							className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center min-w-[140px]"
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
	colorMode,
}: {
	row: (typeof import("../../lib/state").initialAppState.stage2Snapshot.rows)[0];
	workflow: AppWorkflowViewModel;
	disabled: boolean;
	colorMode: ColorMode;
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
	const dark = isDark(colorMode);

	const renderTargetSelector = () => {
		if (row.mode === "none") {
			return <div className={`italic px-3 py-2 text-sm ${dark ? "text-zinc-600" : "text-slate-400"}`}>--</div>;
		}

		if (isSnapshotOnly) {
			return (
				<select className={selectField(colorMode)} value={row.targetName || ""} disabled>
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
					className={selectField(colorMode)}
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
					className={selectField(colorMode)}
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
			<tr className="group hover:bg-white/[0.01] transition-colors">
				<td className="py-4 px-4 align-top">
					<div className="flex max-w-[260px] flex-col gap-2">
						<input
							className={`${selectField(colorMode, errors.length > 0)} font-mono py-1.5`}
							value={getStage2RowEditableName(row)}
							disabled={disabled}
							aria-label="节点名"
							onChange={(event) => workflow.handleProxyNameChange(rowKey, event.target.value)}
						/>
						<div className="flex flex-wrap gap-2">
							{sourceRow ? (
								<button
									type="button"
									className={secondaryButton(colorMode)}
									disabled={disabled}
									onClick={() => workflow.handleCloneStage2Row(rowKey)}
								>
									复制
								</button>
							) : (
								<button
									type="button"
									className={secondaryButton(colorMode)}
									disabled={disabled || !canDeleteRow}
									title={canDeleteRow ? undefined : "至少保留一行"}
									onClick={() => workflow.handleDeleteStage2Row(rowKey)}
								>
									删除
								</button>
							)}
						</div>
						<div className={`text-xs truncate ${mutedText(colorMode)}`} title={sourceLandingName}>
							来源: {sourceLandingName}
						</div>
					</div>
				</td>
				<td className={`py-4 px-4 text-sm font-semibold ${dark ? "text-zinc-400" : "text-slate-500"}`}>
					{meta?.landingNodeType || "-"}
				</td>
				<td className="py-4 px-4">
					<select
						className={`${selectField(colorMode)} min-w-[120px]`}
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
				<td className="py-4 px-4">{renderTargetSelector()}</td>
			</tr>
			{(errors.length > 0 || modeWarningText) && (
				<tr>
					<td colSpan={4} className="px-4 pb-4">
						<div className="flex flex-col gap-1.5 -mt-2">
							{modeWarningText ? (
								<div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20 w-fit">
									<AlertTriangleIcon className="w-3.5 h-3.5" />
									{modeWarningText}
								</div>
							) : null}
							{errors.map((error, index) => (
								<span key={index} className="text-xs text-red-400 px-2 font-semibold">
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
