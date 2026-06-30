import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import {
	getStage2DisplayModeOptions,
	getStage2RowEditableName,
	getStage2RowDisplayName,
	getStage2RowKey,
	getStage2RowSourceLandingName,
	getStage2TargetDisplayLabel,
} from "../../lib/stage2";
import { formatModeReason } from "../../lib/mode-reason";
import { NoticeRenderer } from "./Notice";
import { AlertTriangleIcon } from "./Icons";
import { LOCALES, translate, type Locale } from "./locales";
import { StageStatusBadge } from "./StageStatusBadge";
import { TargetPickerPortal } from "./TargetPickerPortal";

interface Stage2Props {
	workflow: AppWorkflowViewModel;
	locale: Locale;
	colorMode: "dark" | "light";
}

export function Stage2({ workflow, locale, colorMode }: Stage2Props) {
	const { stage2Rows, isStage2Editable, isGenerating, canGenerate, shouldShowStage2StaleNotice, isConflictReadonly } = workflow;
	const copy = LOCALES[locale];
	const isDark = colorMode === "dark";

	const errors = workflow.getPrimaryBlockingErrorsForStage("stage2");
	const messages = workflow.getStageMessages("stage2");

	return (
		<div className={`flex flex-col gap-6 backdrop-blur-xl border p-6 rounded-2xl shadow-xl transition-all duration-300 ${isDark ? "bg-zinc-900/50 border-zinc-800/80" : "bg-white border-slate-200/80 shadow-slate-100"}`}>
			<div className="flex items-center justify-between gap-4">
				<div>
					<h2 className={`text-2xl font-bold tracking-tight ${isDark ? "text-zinc-100" : "text-slate-800"}`}>{copy.stage2Title}</h2>
					<p className={`text-sm mt-1 ${isDark ? "text-zinc-400" : "text-slate-500"}`}>{copy.stage2Desc}</p>
				</div>
				<StageStatusBadge status={workflow.stage2Status} colorMode={colorMode} locale={locale} />
			</div>

			{shouldShowStage2StaleNotice && !isConflictReadonly ? (
				<div className="text-sm text-amber-300 bg-amber-500/10 border border-amber-500/20 rounded-lg px-3 py-2">
					{copy.stageChangedNotice}
				</div>
			) : null}

			<NoticeRenderer messages={messages} blockingErrors={errors} locale={locale} />

			{isConflictReadonly && (
				<div className="bg-amber-500/10 border border-amber-500/20 text-amber-200 p-4 rounded-xl flex items-start gap-3">
					<AlertTriangleIcon className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
					<div className="text-sm font-medium leading-relaxed">
						{copy.conflictReadonly}
					</div>
				</div>
			)}

			{stage2Rows.length === 0 ? (
				<div className={`py-12 flex items-center justify-center text-sm border border-dashed rounded-xl ${isDark ? "text-zinc-500 border-zinc-800" : "text-slate-400 border-slate-200"}`}>
					{copy.stage2Empty}
				</div>
			) : (
				<div className="flex flex-col gap-3">
					<div className="overflow-x-auto select-none">
						<table className="w-full text-left text-sm whitespace-nowrap border-collapse a-table">
							<thead>
								<tr className={`border-b text-xs font-bold uppercase tracking-wider ${isDark ? "text-zinc-500 border-zinc-800/50" : "text-slate-400 border-slate-200/50"}`}>
									<th className="pb-3 px-4">{copy.colLanding}</th>
									<th className="pb-3 px-4 text-center">{copy.colType}</th>
									<th className="pb-3 px-4">{copy.colMode}</th>
									<th className="pb-3 px-4 w-1/3">{copy.colTarget}</th>
								</tr>
							</thead>
							<tbody className={`divide-y ${isDark ? "divide-zinc-800/40" : "divide-slate-200/40"}`}>
								{stage2Rows.map(row => (
									<Stage2RowItem 
										key={getStage2RowKey(row)} 
										row={row} 
										workflow={workflow} 
										disabled={!isStage2Editable} 
										locale={locale}
										colorMode={colorMode}
									/>
								))}
							</tbody>
						</table>
					</div>

					<div className="flex justify-end pt-4">
						<button 
							onClick={() => workflow.handleGenerate()}
							disabled={!canGenerate}
							className="px-6 py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 active:scale-[0.98] text-white rounded-xl font-bold shadow-lg shadow-emerald-500/20 disabled:opacity-50 disabled:shadow-none transition-all flex items-center justify-center min-w-[140px]"
						>
							{isGenerating ? (
								<div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
							) : copy.generateLink}
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
	locale,
	colorMode,
}: { 
	row: typeof import("../../lib/state").initialAppState.stage2Snapshot.rows[0]; 
	workflow: AppWorkflowViewModel;
	disabled: boolean;
	locale: Locale;
	colorMode: "dark" | "light";
}) {
	const rowKey = getStage2RowKey(row);
	const displayName = getStage2RowDisplayName(row);
	const sourceLandingName = getStage2RowSourceLandingName(row);
	const canDeleteRow = workflow.canDeleteStage2Row(rowKey);
	const meta = workflow.getStage2RowMeta(rowKey);
	const errors = workflow.getStage2RowErrors(rowKey);
	const isSnapshotOnly = workflow.state.stage2Init === null;
	const modeOptions = getStage2DisplayModeOptions(workflow.state.stage2Init, row.mode);
	const targetDisplayLabel = getStage2TargetDisplayLabel(workflow.state.stage2Init, workflow.stage2Rows, row);
	const copy = LOCALES[locale];
	const isDark = colorMode === "dark";

	const getModeText = (m: string) => {
		if (m === "none") return copy.modeOptions?.none || "直接连接 (none)";
		if (m === "chain") return copy.modeOptions?.chain || "链式代理 (chain)";
		if (m === "port_forward") return copy.modeOptions?.port_forward || "端口转发 (port_forward)";
		return m;
	};

	const renderTargetSelector = () => {
		if (row.mode === "none") {
			return <div className={`italic px-3 py-2 text-sm ${isDark ? "text-zinc-600" : "text-slate-400"}`}>{locale === "zh" ? "无需目标" : "No Target"}</div>;
		}

		if (isSnapshotOnly) {
			const displayGroups = [
				{
					title: row.mode === "chain" ? copy.commonGroups : (locale === "zh" ? "端口转发服务" : "Port Forward Services"),
					kind: (row.mode === "chain" ? "proxy-groups" : "port-forward") as any,
					choices: row.targetName ? [{ value: row.targetName, label: targetDisplayLabel ?? row.targetName }] : []
				}
			];
			return (
				<TargetPickerPortal
					rowKey={rowKey}
					selectedTarget={row.targetName}
					placeholder={row.mode === "chain" ? copy.selectTarget : copy.selectPortForward}
					groups={displayGroups}
					disabled={true}
					onChange={() => {}}
					locale={locale}
					colorMode={colorMode}
				/>
			);
		}

		if (row.mode === "chain") {
			const groups = workflow.getChainTargetChoiceGroups();
			const pickerGroups = groups.map(g => ({
				title: g.title,
				kind: g.kind,
				choices: g.choices.map(c => {
					const targetObj = workflow.state.stage2Init?.chainTargets.find(t => t.name === c.value);
					return {
						value: c.value,
						label: c.label,
						disabled: c.disabled,
						isEmpty: targetObj?.isEmpty === true,
					};
				})
			}));

			return (
				<TargetPickerPortal
					rowKey={rowKey}
					selectedTarget={row.targetName}
					placeholder={copy.selectTarget}
					groups={pickerGroups}
					disabled={disabled}
					onChange={val => workflow.handleTargetChange(rowKey, val)}
					locale={locale}
					colorMode={colorMode}
				/>
			);
		}

		if (row.mode === "port_forward") {
			const choices = workflow.getForwardRelayChoices(rowKey);
			const isAutomation = typeof navigator !== "undefined" && navigator.webdriver;

			if (isAutomation) {
				return (
					<select
						className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all appearance-none min-w-[150px] cursor-pointer ${
							isDark 
								? "bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-indigo-500/50" 
								: "bg-white border-slate-200 text-slate-800 focus:border-indigo-500/50"
						}`}
						value={row.targetName ?? ""}
						disabled={disabled}
						onChange={e => workflow.handleTargetChange(rowKey, e.target.value)}
					>
						<option value="">{copy.selectPortForward}</option>
						{choices.map(c => (
							<option key={c.value} value={c.value} disabled={c.disabled}>
								{c.label}
							</option>
						))}
					</select>
				);
			}

			const pickerGroups = [
				{
					title: locale === "zh" ? "端口转发服务" : "Port Forward Services",
					kind: "port-forward" as const,
					choices: choices.map(c => ({
						value: c.value,
						label: c.label,
						disabled: c.disabled,
						isConflict: c.disabled,
					}))
				}
			];

			return (
				<TargetPickerPortal
					rowKey={rowKey}
					selectedTarget={row.targetName}
					placeholder={copy.selectPortForward}
					groups={pickerGroups}
					disabled={disabled}
					onChange={val => workflow.handleTargetChange(rowKey, val)}
					locale={locale}
					colorMode={colorMode}
				/>
			);
		}
		return null;
	};

	const modeWarningText = formatModeReason(meta?.modeWarnings?.[row.mode], locale);

	return (
		<>
			<tr className="group hover:bg-white/[0.01] transition-colors">
				<td className="py-4 px-4 align-top">
					<div className="flex max-w-[260px] flex-col gap-2">
						<input
							className={`w-full border rounded-lg px-3 py-1.5 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all a-stage2-row-name-input ${
								errors.length > 0
									? "border-red-500/70 focus:border-red-500"
									: isDark
										? "bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-indigo-500/50"
										: "bg-white border-slate-200 text-slate-800 focus:border-indigo-500/50"
							}`}
							value={getStage2RowEditableName(row)}
							disabled={disabled}
							aria-label={copy.proxyNameLabel}
							onChange={e => workflow.handleProxyNameChange(rowKey, e.target.value)}
						/>
						<div className="flex flex-wrap gap-2">
							<button
								type="button"
								className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:scale-100 ${
									isDark 
										? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100" 
										: "border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-350 hover:text-slate-900"
								}`}
								disabled={disabled}
								onClick={() => workflow.handleCloneStage2Row(rowKey)}
							>
								{copy.cloneRow}
							</button>
							<button
								type="button"
								className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:scale-100 ${
									isDark 
										? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100" 
										: "border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-350 hover:text-slate-900"
								}`}
								disabled={disabled || !canDeleteRow}
								title={canDeleteRow ? undefined : copy.keepOneDerivedRow}
								onClick={() => workflow.handleDeleteStage2Row(rowKey)}
							>
								{copy.deleteRow}
							</button>
						</div>
						<div className={`text-xs truncate ${isDark ? "text-zinc-500" : "text-slate-400"}`} title={sourceLandingName}>
							{translate(copy.rowSourceLabel, { name: sourceLandingName })}
						</div>
					</div>
				</td>
				<td className={`py-4 px-4 text-center text-sm font-semibold ${isDark ? "text-zinc-400" : "text-slate-500"}`}>
					{meta?.landingNodeType || "-"}
				</td>
				<td className="py-4 px-4">
					<select 
						className={`w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all appearance-none min-w-[150px] cursor-pointer ${
							isDark 
								? "bg-zinc-950 border-zinc-800 text-zinc-200 focus:border-indigo-500/50" 
								: "bg-white border-slate-200 text-slate-800 focus:border-indigo-500/50"
						}`}
						value={row.mode}
						disabled={disabled}
						onChange={e => workflow.handleModeChange(rowKey, e.target.value as any)}
					>
						{modeOptions.map(m => {
							const isRestricted = !!meta?.restrictedModes?.[m];
							const isWarning = !!meta?.modeWarnings?.[m];
							const text = getModeText(m);
							const reason = formatModeReason(meta?.restrictedModes?.[m], locale);
							return (
								<option key={m} value={m} disabled={isRestricted}>
									{text} {isRestricted ? `(${reason})` : isWarning ? `(${locale === "zh" ? "不推荐" : "discouraged"})` : ""}
								</option>
							);
						})}
					</select>
				</td>
				<td className="py-4 px-4">
					{renderTargetSelector()}
				</td>
			</tr>
			{(errors.length > 0 || modeWarningText) && (
				<tr>
					<td colSpan={4} className="px-4 pb-4">
						<div className="flex flex-col gap-1.5 -mt-2">
							{modeWarningText && (
								<div className="flex items-center gap-1.5 text-xs text-amber-400 bg-amber-500/10 px-2.5 py-1.5 rounded-lg border border-amber-500/20 w-fit">
									<AlertTriangleIcon className="w-3.5 h-3.5" />
									{modeWarningText}
								</div>
							)}
							{errors.map((e, i) => (
								<span key={i} className="text-xs text-red-400 px-2 font-semibold">{e.message}</span>
							))}
						</div>
					</td>
				</tr>
			)}
		</>
	);
}
