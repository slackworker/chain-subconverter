import { useMemo, type RefObject } from "react";

import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import {
	getStage2DisplayModeOptions,
	getStage2RowDisplayName,
	getStage2RowSourceLandingName,
	getStage2RowStrictKey,
	getStage2TargetDisplayLabel,
	isStage2SourceRow,
} from "../../lib/stage2";
import type { Stage2Row } from "../../types/api";
import {
	getModeLabel,
	Stage2RowModeCell,
	Stage2RowNameCell,
	Stage2RowTargetCell,
	type Stage2Copy,
	type Stage2Locale,
} from "./Stage2RowCells";
import { useStage2TableColumns } from "./useStage2TableColumns";
import { collectStage2TargetOptionLabels } from "./stage2TargetMeasureLabels";

interface Stage2FlatTableProps {
	workflow: AppWorkflowViewModel;
	locale: Stage2Locale;
	copy: Stage2Copy & Record<string, string>;
	tableWrapRef: RefObject<HTMLDivElement | null>;
	openTargetMenuRow: string | null;
	setOpenTargetMenuRow: (rowKey: string | null) => void;
	chainTargetMenuTriggerRef: React.MutableRefObject<HTMLButtonElement | null>;
	chainTargetMenuPanelRef: React.MutableRefObject<HTMLDivElement | null>;
	chainTargetMenuPortalEl: HTMLDivElement | null;
	primaryOpenByRow: Record<string, boolean>;
	supplementOpenByRow: Record<string, boolean>;
	setPrimaryOpen: (rowKey: string, open: boolean) => void;
	setSupplementOpen: (rowKey: string, open: boolean) => void;
}

export function Stage2FlatTable({
	workflow,
	locale,
	copy,
	tableWrapRef,
	openTargetMenuRow,
	setOpenTargetMenuRow,
	chainTargetMenuTriggerRef,
	chainTargetMenuPanelRef,
	chainTargetMenuPortalEl,
	primaryOpenByRow,
	supplementOpenByRow,
	setPrimaryOpen,
	setSupplementOpen,
}: Stage2FlatTableProps) {
	const { state, stage2Rows, getStage2RowMeta } = workflow;

	const stage2ColumnMeasureInput = useMemo(() => {
		if (stage2Rows.length === 0) {
			return null;
		}

		return {
			headers: [copy.colLanding, copy.colType, copy.colMode, copy.colTarget] as const,
			rows: stage2Rows.map((row) => {
				const rowKey = getStage2RowStrictKey(row);
				const meta = getStage2RowMeta(rowKey);
				const displayModeOptions = getStage2DisplayModeOptions(state.stage2Init, row.mode);
				const modeOptionLabels = displayModeOptions.map((mode) => {
					const restriction = meta?.restrictedModes?.[mode];
					const label = getModeLabel(mode, locale, copy);
					return restriction ? `${label}（${restriction.reasonText}）` : label;
				});
				const targetLabel =
					getStage2TargetDisplayLabel(state.stage2Init, stage2Rows, row) ??
					(row.mode === "none" ? "--" : copy.selectTarget);
				const targetOptionLabels = collectStage2TargetOptionLabels({
					stage2Init: state.stage2Init,
					stage2Rows,
					row,
					rowKey,
					copy,
				});

				return {
					landingNodeName: getStage2RowDisplayName(row),
					landingNodeType: meta?.landingNodeType ?? "--",
					modeOptionLabels,
					targetLabel,
					targetOptionLabels,
				};
			}),
		};
	}, [
		stage2Rows,
		state.stage2Init,
		locale,
		copy,
		getStage2RowMeta,
	]);

	const stage2ColumnStyle = useStage2TableColumns(tableWrapRef, stage2ColumnMeasureInput);

	return (
		<div className="a-table-wrap a-table-wrap--stage2-adaptive" ref={tableWrapRef} style={stage2ColumnStyle}>
			<table className="a-table a-table--stage2-adaptive">
				<colgroup>
					<col />
					<col />
					<col />
					<col />
				</colgroup>
				<thead>
					<tr>
						<th scope="col">{copy.colLanding}</th>
						<th scope="col">{copy.colType}</th>
						<th scope="col">{copy.colMode}</th>
						<th scope="col">{copy.colTarget}</th>
					</tr>
				</thead>
				<tbody>
					{stage2Rows.length === 0 ? (
						<tr>
							<td colSpan={4} className="a-table__empty">
								{copy.stage2Empty}
							</td>
						</tr>
					) : (
						stage2Rows.map((row, rowIndex) => (
							<Stage2FlatTableRow
								key={getStage2RowStrictKey(row)}
								row={row}
								rowIndex={rowIndex}
								stage2Rows={stage2Rows}
								workflow={workflow}
								locale={locale}
								copy={copy}
								openTargetMenuRow={openTargetMenuRow}
								setOpenTargetMenuRow={setOpenTargetMenuRow}
								chainTargetMenuTriggerRef={chainTargetMenuTriggerRef}
								chainTargetMenuPanelRef={chainTargetMenuPanelRef}
								chainTargetMenuPortalEl={chainTargetMenuPortalEl}
								primaryOpenByRow={primaryOpenByRow}
								supplementOpenByRow={supplementOpenByRow}
								setPrimaryOpen={setPrimaryOpen}
								setSupplementOpen={setSupplementOpen}
							/>
						))
					)}
				</tbody>
			</table>
		</div>
	);
}

function Stage2FlatTableRow({
	row,
	rowIndex,
	stage2Rows,
	workflow,
	locale,
	copy,
	openTargetMenuRow,
	setOpenTargetMenuRow,
	chainTargetMenuTriggerRef,
	chainTargetMenuPanelRef,
	chainTargetMenuPortalEl,
	primaryOpenByRow,
	supplementOpenByRow,
	setPrimaryOpen,
	setSupplementOpen,
}: {
	row: Stage2Row;
	rowIndex: number;
	stage2Rows: Stage2Row[];
	workflow: AppWorkflowViewModel;
	locale: Stage2Locale;
	copy: Stage2Copy & Record<string, string>;
	openTargetMenuRow: string | null;
	setOpenTargetMenuRow: (rowKey: string | null) => void;
	chainTargetMenuTriggerRef: React.MutableRefObject<HTMLButtonElement | null>;
	chainTargetMenuPanelRef: React.MutableRefObject<HTMLDivElement | null>;
	chainTargetMenuPortalEl: HTMLDivElement | null;
	primaryOpenByRow: Record<string, boolean>;
	supplementOpenByRow: Record<string, boolean>;
	setPrimaryOpen: (rowKey: string, open: boolean) => void;
	setSupplementOpen: (rowKey: string, open: boolean) => void;
}) {
	const {
		state,
		isStage2Editable,
		getStage2RowMeta,
		getStage2RowErrors,
		getChainTargetChoiceGroups,
		getForwardRelayChoices,
		handleProxyNameChange,
		handleCloneStage2Row,
		handleDeleteStage2Row,
		canDeleteStage2Row,
		handleModeChange,
		handleTargetChange,
	} = workflow;

	const rowKey = getStage2RowStrictKey(row);
	const sourceLandingName = getStage2RowSourceLandingName(row);
	const previousSourceLandingName =
		rowIndex > 0 ? getStage2RowSourceLandingName(stage2Rows[rowIndex - 1]) : null;
	const nextSourceLandingName =
		rowIndex + 1 < stage2Rows.length ? getStage2RowSourceLandingName(stage2Rows[rowIndex + 1]) : null;
	const groupedBySource =
		previousSourceLandingName === sourceLandingName || nextSourceLandingName === sourceLandingName;
	const groupStart = previousSourceLandingName !== sourceLandingName;
	const groupEnd = nextSourceLandingName !== sourceLandingName;
	const sourceRow = isStage2SourceRow(row);
	const meta = getStage2RowMeta(rowKey);
	const rowErrors = getStage2RowErrors(rowKey);
	const canDeleteRow = !sourceRow && canDeleteStage2Row(rowKey);
	const deleteRowTitle = canDeleteRow ? undefined : copy.keepOneDerivedRow;
	const editable = isStage2Editable;
	const supplementGroup = getChainTargetChoiceGroups().find((group) => group.kind === "proxies") ?? null;
	const selectedInSupplement = Boolean(
		supplementGroup?.choices.some((choice) => choice.value === row.targetName),
	);
	const primaryOpen = primaryOpenByRow[rowKey] !== false;
	const supplementOpen = supplementOpenByRow[rowKey] ?? selectedInSupplement;
	const modeWarnId = `a-s2-mode-warn-${rowKey}`;
	const rowErrorId = `a-s2-row-error-${rowKey}`;
	const rowNameInputId = `a-s2-row-name-${rowKey}`;

	const rowInlineClassName = [
		"a-stage2-row-inline",
		groupedBySource ? "is-grouped" : "is-solo",
		sourceRow ? "is-source" : "is-derived",
		groupStart ? "is-group-start" : "",
		groupEnd ? "is-group-end" : "",
	]
		.filter(Boolean)
		.join(" ");

	return (
		<tr className={rowErrors.length > 0 ? "a-table__row--error" : ""}>
			<td>
				<Stage2RowNameCell
					row={row}
					rowKey={rowKey}
					editable={editable}
					rowErrors={rowErrors}
					copy={copy}
					wrapperClassName={rowInlineClassName}
					sourceLandingName={sourceLandingName}
					isSource={sourceRow}
					canDeleteRow={canDeleteRow}
					deleteRowTitle={deleteRowTitle}
					rowNameInputId={rowNameInputId}
					onProxyNameChange={handleProxyNameChange}
					onCloneRow={handleCloneStage2Row}
					onDeleteRow={handleDeleteStage2Row}
				/>
			</td>
			<td>
				<div className="a-cell-type">{meta?.landingNodeType ?? "--"}</div>
			</td>
			<td>
				<Stage2RowModeCell
					row={row}
					rowKey={rowKey}
					editable={editable}
					locale={locale}
					copy={copy}
					rowErrors={rowErrors}
					stage2Init={state.stage2Init}
					getStage2RowMeta={getStage2RowMeta}
					onModeChange={handleModeChange}
					modeWarnId={modeWarnId}
					rowErrorId={rowErrorId}
					openTargetMenuRow={openTargetMenuRow}
					setOpenTargetMenuRow={setOpenTargetMenuRow}
					chainTargetMenuTriggerRef={chainTargetMenuTriggerRef}
					chainTargetMenuPanelRef={chainTargetMenuPanelRef}
					chainTargetMenuPortalEl={chainTargetMenuPortalEl}
				/>
			</td>
			<td>
				<Stage2RowTargetCell
					row={row}
					rowKey={rowKey}
					editable={editable}
					copy={copy}
					rowErrors={rowErrors}
					stage2Init={state.stage2Init}
					stage2Rows={stage2Rows}
					getChainTargetChoiceGroups={getChainTargetChoiceGroups}
					getForwardRelayChoices={getForwardRelayChoices}
					onTargetChange={handleTargetChange}
					openTargetMenuRow={openTargetMenuRow}
					setOpenTargetMenuRow={setOpenTargetMenuRow}
					chainTargetMenuTriggerRef={chainTargetMenuTriggerRef}
					chainTargetMenuPanelRef={chainTargetMenuPanelRef}
					chainTargetMenuPortalEl={chainTargetMenuPortalEl}
					primaryOpen={primaryOpen}
					supplementOpen={supplementOpen}
					setPrimaryOpen={setPrimaryOpen}
					setSupplementOpen={setSupplementOpen}
					rowErrorId={rowErrorId}
				/>
			</td>
		</tr>
	);
}
