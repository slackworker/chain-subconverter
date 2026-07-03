import { useMemo, type RefObject } from "react";

import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import {
	collectTemplateProxyGroupNames,
	getServerAggregationGroupDisplayName,
	getStage2DisplayModeOptions,
	getStage2RowDisplayName,
	getStage2RowStrictKey,
	getStage2TargetDisplayLabel,
	isStage2SourceRow,
} from "../../lib/stage2";
import { formatModeReason } from "../../lib/mode-reason";
import {
	buildStage2AggregationTree,
	formatStage2TreeGlyphMeasureSpacer,
	getServerBlockAggregationEnabled,
	getStage2AggregationTreeRowInlineClassName,
	type Stage2TreeNode,
} from "./stage2AggregationTree";
import {
	getAggregationStrategyLabel,
	getModeLabel,
	Stage2AggregationCell,
	Stage2RowModeCell,
	Stage2RowNameCell,
	Stage2RowTargetCell,
	Stage2ServerMemberOrderCell,
	type Stage2Copy,
	type Stage2Locale,
} from "./Stage2RowCells";
import { useStage2AggTableColumns } from "./useStage2AggTableColumns";
import { collectStage2TargetOptionLabels } from "./stage2TargetMeasureLabels";

interface Stage2AggregationTreeProps {
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

function getServerGroupEditableName(
	snapshot: AppWorkflowViewModel["state"]["stage2Snapshot"],
	stage2Init: AppWorkflowViewModel["state"]["stage2Init"],
	server: string,
	groupName: string,
	enabled: boolean,
): string {
	const trimmedGroupName = groupName.trim();
	if (trimmedGroupName !== "") {
		return trimmedGroupName;
	}
	return getServerAggregationGroupDisplayName(snapshot, server, {
		groupName,
		enabled,
		existingProxyGroupNames: collectTemplateProxyGroupNames(stage2Init?.chainTargets ?? []),
	});
}

function getServerGroupColumnLabel(
	snapshot: AppWorkflowViewModel["state"]["stage2Snapshot"],
	stage2Init: AppWorkflowViewModel["state"]["stage2Init"],
	server: string,
	serverAggregation: ReturnType<AppWorkflowViewModel["getServerAggregationGroup"]>,
): string {
	return getServerAggregationGroupDisplayName(snapshot, server, {
		groupName: serverAggregation?.groupName,
		enabled: serverAggregation?.enabled ?? false,
		existingProxyGroupNames: collectTemplateProxyGroupNames(stage2Init?.chainTargets ?? []),
	});
}

export function Stage2AggregationTree({
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
}: Stage2AggregationTreeProps) {
	const {
		state,
		stage2Rows,
		isStage2Editable,
		getStage2RowMeta,
		getStage2RowErrors,
		getServerAggregationGroup,
		getChainTargetChoiceGroups,
		getForwardRelayChoices,
		handleProxyNameChange,
		handleCloneStage2Row,
		handleDeleteStage2Row,
		canDeleteStage2Row,
		handleModeChange,
		handleTargetChange,
		handleServerAggregationChange,
		handleServerAggregationEnableWithDefaults,
		handleServerAggregationMemberMoveTo,
		handleServerAggregationGroupNameChange,
		getServerAggregationOrderedMembers,
	} = workflow;

	const treeNodes = useMemo(
		() => buildStage2AggregationTree(stage2Rows, getStage2RowMeta),
		[stage2Rows, getStage2RowMeta],
	);

	const stage2ColumnMeasureInput = useMemo(() => {
		if (treeNodes.length === 0) {
			return null;
		}

		const rows = treeNodes.map((node) => {
			if (node.kind === "server") {
				const serverAggregation = getServerAggregationGroup(node.anchorRowKey);
				return {
					nodeLabel: getServerGroupColumnLabel(state.stage2Snapshot, state.stage2Init, node.server, serverAggregation),
					landingNodeType: copy.typePolicyGroup,
					modeOptionLabels: [
						getAggregationStrategyLabel("fallback", copy),
						getAggregationStrategyLabel("url-test", copy),
					],
					targetLabel: copy.memberOrderManage,
					targetOptionLabels: [copy.memberOrderManage, copy.memberOrderFallbackHint],
				};
			}

			const rowKey = node.rowKey;
			const meta = getStage2RowMeta(rowKey);
			const displayModeOptions = getStage2DisplayModeOptions(state.stage2Init, node.row.mode);
			const modeOptionLabels = displayModeOptions.map((mode) => {
				const restriction = meta?.restrictedModes?.[mode];
				const label = getModeLabel(mode, locale, copy);
				return restriction ? `${label}（${formatModeReason(restriction, locale)}）` : label;
			});
			const targetLabel =
				getStage2TargetDisplayLabel(state.stage2Init, stage2Rows, node.row) ??
				(node.row.mode === "none" ? "--" : copy.selectTarget);
			const targetOptionLabels = collectStage2TargetOptionLabels({
				stage2Init: state.stage2Init,
				stage2Rows,
				row: node.row,
				rowKey,
				copy,
			});

			return {
				nodeLabel: `${formatStage2TreeGlyphMeasureSpacer(node.glyphParts)}${getStage2RowDisplayName(node.row)}`,
				landingNodeType: meta?.landingNodeType ?? "--",
				modeOptionLabels,
				targetLabel,
				targetOptionLabels,
			};
		});

		return {
			headers: [copy.colNodeTree, copy.colAggregation, copy.colTypeAgg, copy.colMode, copy.colTarget] as const,
			rows,
		};
	}, [treeNodes, state.stage2Init, state.stage2Snapshot, stage2Rows, locale, copy, getStage2RowMeta, getServerAggregationGroup]);

	const stage2ColumnStyle = useStage2AggTableColumns(tableWrapRef, stage2ColumnMeasureInput);

	return (
		<div
			className="a-table-wrap a-table-wrap--stage2-adaptive a-table-wrap--stage2-tree"
			ref={tableWrapRef}
			style={stage2ColumnStyle}
		>
			<table className="a-table a-table--stage2-adaptive a-stage2-tree">
				<colgroup>
					<col />
					<col />
					<col />
					<col />
					<col />
				</colgroup>
				<thead>
					<tr>
						<th scope="col">{copy.colNodeTree}</th>
						<th scope="col">{copy.colAggregation}</th>
						<th scope="col">{copy.colTypeAgg}</th>
						<th scope="col">{copy.colMode}</th>
						<th scope="col">{copy.colTarget}</th>
					</tr>
				</thead>
				<tbody>
					{treeNodes.map((node, nodeIndex) => (
						<Stage2AggregationTreeRow
							key={node.kind === "server" ? `server:${node.server}` : node.rowKey}
							node={node}
							nodeIndex={nodeIndex}
							treeNodes={treeNodes}
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
					))}
				</tbody>
			</table>
		</div>
	);
}

function Stage2AggregationTreeRow({
	node,
	nodeIndex,
	treeNodes,
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
	node: Stage2TreeNode;
	nodeIndex: number;
	treeNodes: Stage2TreeNode[];
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
		stage2Rows,
		isStage2Editable,
		getStage2RowMeta,
		getStage2RowErrors,
		getServerAggregationGroup,
		getChainTargetChoiceGroups,
		getForwardRelayChoices,
		handleProxyNameChange,
		handleCloneStage2Row,
		handleDeleteStage2Row,
		canDeleteStage2Row,
		handleModeChange,
		handleTargetChange,
		handleServerAggregationChange,
		handleServerAggregationEnableWithDefaults,
		handleServerAggregationMemberMoveTo,
		handleServerAggregationGroupNameChange,
		getServerAggregationOrderedMembers,
	} = workflow;

	const editable = isStage2Editable;
	const serverAggregationEnabled = getServerBlockAggregationEnabled(
		treeNodes,
		nodeIndex,
		(anchorRowKey) => getServerAggregationGroup(anchorRowKey)?.enabled ?? false,
	);
	const rowInlineClassName = getStage2AggregationTreeRowInlineClassName(treeNodes, nodeIndex, {
		serverAggregationEnabled,
	});

	if (node.kind === "server") {
		const anchorRow = stage2Rows.find((candidate) => getStage2RowStrictKey(candidate) === node.anchorRowKey);
		if (!anchorRow) {
			return null;
		}
		const serverAggregation = getServerAggregationGroup(node.anchorRowKey);
		const enabled = serverAggregation?.enabled ?? false;
		const groupName = serverAggregation?.groupName ?? "";
		const strategy = serverAggregation?.strategy ?? "fallback";
		const memberChecked = serverAggregation?.memberChecked ?? false;

		return (
			<tr className={`a-stage2-tree-server${enabled ? "" : " a-stage2-tree-server--inactive"}`}>
				<td>
					<Stage2RowNameCell
						row={anchorRow}
						rowKey={node.anchorRowKey}
						editable={editable && enabled}
						nameValueOverride={getServerGroupEditableName(
							state.stage2Snapshot,
							state.stage2Init,
							node.server,
							groupName,
							enabled,
						)}
						nameEditableHint={copy.serverGroupNameEditableHint}
						rowErrors={[]}
						copy={copy}
						wrapperClassName={rowInlineClassName}
						isSource={true}
						canDeleteRow={false}
						rowNameInputId={`a-s2-server-name-${node.server}`}
						onProxyNameChange={handleProxyNameChange}
						onNameChange={handleServerAggregationGroupNameChange}
						onCloneRow={handleCloneStage2Row}
						onDeleteRow={handleDeleteStage2Row}
						toolbarPlaceholder={true}
					/>
				</td>
				<td>
					<Stage2AggregationCell
						hint={copy.aggregationEnable}
						checked={enabled}
						disabled={!editable}
						onChange={(checked) =>
							handleServerAggregationEnableWithDefaults(node.anchorRowKey, {
								enabled: checked,
								strategy,
							})
						}
					/>
				</td>
				<td>
					<div className="a-cell-type">{copy.typePolicyGroup}</div>
				</td>
				<td>
					<Stage2RowModeCell
						row={anchorRow}
						rowKey={node.anchorRowKey}
						editable={editable}
						locale={locale}
						copy={copy}
						rowErrors={[]}
						stage2Init={state.stage2Init}
						getStage2RowMeta={getStage2RowMeta}
						onModeChange={handleModeChange}
						modeWarnId={`a-s2-server-strategy-warn-${node.server}`}
						rowErrorId={`a-s2-server-strategy-error-${node.server}`}
						strategyValue={strategy}
						strategyDisabled={!enabled}
						onStrategyChange={(nextStrategy) =>
							handleServerAggregationChange(node.anchorRowKey, {
								enabled,
								strategy: nextStrategy,
								memberChecked,
							})
						}
						openTargetMenuRow={openTargetMenuRow}
						setOpenTargetMenuRow={setOpenTargetMenuRow}
						chainTargetMenuTriggerRef={chainTargetMenuTriggerRef}
						chainTargetMenuPanelRef={chainTargetMenuPanelRef}
						chainTargetMenuPortalEl={chainTargetMenuPortalEl}
					/>
				</td>
				<td>
					<Stage2ServerMemberOrderCell
						anchorRowKey={node.anchorRowKey}
						editable={editable}
						enabled={enabled}
						strategy={strategy}
						copy={copy}
						members={getServerAggregationOrderedMembers(node.anchorRowKey)}
						onMemberMoveTo={(memberRowId, toIndex) =>
							handleServerAggregationMemberMoveTo(node.anchorRowKey, memberRowId, toIndex)
						}
						openTargetMenuRow={openTargetMenuRow}
						setOpenTargetMenuRow={setOpenTargetMenuRow}
						chainTargetMenuTriggerRef={chainTargetMenuTriggerRef}
						chainTargetMenuPanelRef={chainTargetMenuPanelRef}
						chainTargetMenuPortalEl={chainTargetMenuPortalEl}
					/>
				</td>
			</tr>
		);
	}

	const row = node.row;
	const rowKey = node.rowKey;
	const meta = getStage2RowMeta(rowKey);
	const rowErrors = getStage2RowErrors(rowKey);
	const serverAggregation = getServerAggregationGroup(rowKey);
	const memberChecked = row.rowId ? (serverAggregation?.memberChecked ?? false) : false;
	const sourceRow = isStage2SourceRow(row);
	const canDeleteRow = !sourceRow && canDeleteStage2Row(rowKey);
	const deleteRowTitle = canDeleteRow ? undefined : copy.keepOneDerivedRow;
	const supplementGroup = getChainTargetChoiceGroups().find((group) => group.kind === "proxies") ?? null;
	const selectedInSupplement = Boolean(
		supplementGroup?.choices.some((choice) => choice.value === row.targetName),
	);
	const primaryOpen = primaryOpenByRow[rowKey] !== false;
	const supplementOpen = supplementOpenByRow[rowKey] ?? selectedInSupplement;
	const modeWarnId = `a-s2-mode-warn-${rowKey}`;
	const rowErrorId = `a-s2-row-error-${rowKey}`;
	const rowNameInputId = `a-s2-row-name-${rowKey}`;

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
				{row.rowId ? (
					<Stage2AggregationCell
						hint={copy.aggregationInclude}
						checked={memberChecked}
						disabled={!editable || !(serverAggregation?.enabled ?? false)}
						onChange={(checked) =>
							handleServerAggregationChange(rowKey, {
								enabled: serverAggregation?.enabled ?? false,
								strategy: serverAggregation?.strategy ?? "fallback",
								memberChecked: checked,
							})
						}
					/>
				) : null}
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
