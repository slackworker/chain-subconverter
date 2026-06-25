import { createPortal } from "react-dom";

import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import { Tooltip } from "../../lib/Tooltip";
import {
	getStage2DisplayModeOptions,
	getStage2RowEditableName,
	getStage2TargetDisplayLabel,
} from "../../lib/stage2";
import type { Stage2Row } from "../../types/api";
import type { Stage2TreeGlyphParts } from "./stage2AggregationTree";
import { CopyIcon, PencilIcon, TrashIcon } from "./Icons";
import { Stage2MemberOrderList } from "./Stage2MemberOrderList";
import {
	getStage2ForwardTargetMenuKey,
	getStage2ModeMenuKey,
	getStage2StrategyMenuKey,
	Stage2FlatSelectMenu,
} from "./Stage2FlatSelectMenu";

export type Stage2Copy = {
	proxyNameLabel: string;
	proxyNameEditableHint: string;
	cloneRow: string;
	deleteRow: string;
	keepOneDerivedRow: string;
	selectTarget: string;
	commonGroups: string;
	fixedNodes: string;
	noCommonChoices: string;
	localErrorAriaHint: string;
	aggregationStrategyLabel: string;
	memberOrderManage: string;
	memberOrderFallbackHint: string;
	memberOrderUrlTestHint: string;
	memberOrderEmpty: string;
	memberOrderPrimaryBadge: string;
	memberOrderSourceBadge: string;
	memberOrderDerivedBadge: string;
	memberOrderDragHandle: string;
	memberOrderDragHandleAria: string;
};

export type Stage2Locale = "zh" | "en";

export function getServerMemberOrderMenuKey(anchorRowKey: string) {
	return `server-order:${anchorRowKey}`;
}

export function getModeLabel(mode: string, locale: Stage2Locale, copy: Stage2Copy & Record<string, string>) {
	const labels: Record<string, string> = {
		none: copy.mode_none as string,
		chain: copy.mode_chain as string,
		port_forward: copy.mode_port_forward as string,
	};
	return labels[mode] ?? mode;
}

export function getAggregationStrategyLabel(
	strategy: "fallback" | "url-test",
	copy: Stage2Copy & Record<string, string>,
) {
	const labels: Record<"fallback" | "url-test", string> = {
		fallback: copy.strategy_fallback as string,
		"url-test": copy.strategy_url_test as string,
	};
	return labels[strategy] ?? strategy;
}

interface Stage2RowNameCellProps {
	row: Stage2Row;
	rowKey: string;
	editable: boolean;
	nameValueOverride?: string;
	rowErrors: { code: string; message: string }[];
	copy: Stage2Copy;
	glyphParts?: Stage2TreeGlyphParts;
	reserveTreeGlyphColumn?: boolean;
	wrapperClassName?: string;
	sourceLandingName?: string;
	isSource: boolean;
	canDeleteRow: boolean;
	deleteRowTitle?: string;
	rowNameInputId: string;
	onProxyNameChange: (rowKey: string, value: string) => void;
	onCloneRow: (rowKey: string) => void;
	onDeleteRow: (rowKey: string) => void;
	readOnlyLabel?: string;
	toolbarPlaceholder?: boolean;
}

const STAGE2_TREE_GLYPH_WIDTH = 24;
/** 归一化行高，配合 preserveAspectRatio="none" 随单元格拉伸。 */
const STAGE2_TREE_VIEW_HEIGHT = 100;
const STAGE2_TREE_SPINE_X = 8;
const STAGE2_TREE_DEPTH2_BRANCH_X = 20;
const STAGE2_TREE_BRANCH_Y = 50;
/** 所有层级横线统一延伸至导轨右缘，与节点名左缘对齐。 */
const STAGE2_TREE_BRANCH_END_X = STAGE2_TREE_GLYPH_WIDTH;
/** 向相邻行延伸，跨过单元格 padding / border 间隙。 */
const STAGE2_TREE_LINE_BLEED = 14;

function Stage2TreeGlyphLine({
	x1,
	y1,
	x2,
	y2,
}: {
	x1: number;
	y1: number;
	x2: number;
	y2: number;
}) {
	return (
		<line
			x1={x1}
			y1={y1}
			x2={x2}
			y2={y2}
			className="a-stage2-tree-glyph__line"
			strokeLinecap="round"
		/>
	);
}

function Stage2TreeBranchConnector({
	x,
	branch,
	extendDown = false,
	extendUp = false,
}: {
	x: number;
	branch: Stage2TreeGlyphParts["branch"];
	extendDown?: boolean;
	extendUp?: boolean;
}) {
	const verticalStart = extendUp ? -STAGE2_TREE_LINE_BLEED : 0;
	const verticalEnd =
		branch === "mid" ? STAGE2_TREE_VIEW_HEIGHT + (extendDown ? STAGE2_TREE_LINE_BLEED : 0) : STAGE2_TREE_BRANCH_Y;

	return (
		<>
			<Stage2TreeGlyphLine x1={x} y1={verticalStart} x2={x} y2={verticalEnd} />
			<Stage2TreeGlyphLine
				x1={x}
				y1={STAGE2_TREE_BRANCH_Y}
				x2={STAGE2_TREE_BRANCH_END_X}
				y2={STAGE2_TREE_BRANCH_Y}
			/>
		</>
	);
}

/** 父行：从统一高度的横线处向下引出子级竖线导轨。 */
function Stage2TreeChildGuideDescent() {
	return (
		<Stage2TreeGlyphLine
			x1={STAGE2_TREE_DEPTH2_BRANCH_X}
			y1={STAGE2_TREE_BRANCH_Y}
			x2={STAGE2_TREE_DEPTH2_BRANCH_X}
			y2={STAGE2_TREE_VIEW_HEIGHT + STAGE2_TREE_LINE_BLEED}
		/>
	);
}

export function Stage2TreeGlyph({
	parts,
	placeholder = false,
}: {
	parts: Stage2TreeGlyphParts;
	placeholder?: boolean;
}) {
	if (placeholder) {
		return <span className="a-stage2-tree-glyph a-stage2-tree-glyph--placeholder" aria-hidden="true" />;
	}

	const branchX = parts.depth === 1 ? STAGE2_TREE_SPINE_X : STAGE2_TREE_DEPTH2_BRANCH_X;
	const hasAncestorSpine = parts.depth === 2 && parts.continuation === "│";
	const ancestorSpineContinuesBelow = hasAncestorSpine;

	return (
		<svg
			className="a-stage2-tree-glyph"
			viewBox={`0 0 ${STAGE2_TREE_GLYPH_WIDTH} ${STAGE2_TREE_VIEW_HEIGHT}`}
			preserveAspectRatio="none"
			aria-hidden="true"
		>
			{hasAncestorSpine ? (
				<Stage2TreeGlyphLine
					x1={STAGE2_TREE_SPINE_X}
					y1={-STAGE2_TREE_LINE_BLEED}
					x2={STAGE2_TREE_SPINE_X}
					y2={
						ancestorSpineContinuesBelow
							? STAGE2_TREE_VIEW_HEIGHT + STAGE2_TREE_LINE_BLEED
							: STAGE2_TREE_BRANCH_Y
					}
				/>
			) : null}
			{parts.depth === 1 && parts.childGuide ? <Stage2TreeChildGuideDescent /> : null}
			<Stage2TreeBranchConnector
				x={branchX}
				branch={parts.branch}
				extendDown={parts.branch === "mid"}
				extendUp={parts.depth === 2}
			/>
		</svg>
	);
}

export function Stage2RowNameCell({
	row,
	rowKey,
	editable,
	nameValueOverride,
	rowErrors,
	copy,
	glyphParts,
	reserveTreeGlyphColumn = false,
	wrapperClassName = "a-stage2-tree-name",
	sourceLandingName,
	isSource,
	canDeleteRow,
	deleteRowTitle,
	rowNameInputId,
	onProxyNameChange,
	onCloneRow,
	onDeleteRow,
	readOnlyLabel,
	toolbarPlaceholder = false,
}: Stage2RowNameCellProps) {
	return (
		<div
			className={wrapperClassName}
			title={sourceLandingName && !isSource && !readOnlyLabel ? sourceLandingName : undefined}
		>
			{glyphParts || reserveTreeGlyphColumn ? (
				<Stage2TreeGlyph parts={glyphParts ?? { continuation: "", branch: "last", depth: 1 }} placeholder={reserveTreeGlyphColumn} />
			) : null}
			<div className="a-stage2-row-name-field">
				{readOnlyLabel !== undefined ? (
					<div className="a-input a-stage2-row-name-input a-stage2-tree-server-name" aria-readonly="true">
						{readOnlyLabel}
					</div>
				) : (
					<>
						<input
							id={rowNameInputId}
							className={`a-input a-stage2-row-name-input ${rowErrors.length > 0 ? "a-input--error" : ""}`}
							value={nameValueOverride ?? getStage2RowEditableName(row)}
							disabled={!editable}
							aria-label={copy.proxyNameLabel}
							onChange={(event) => onProxyNameChange(rowKey, event.target.value)}
						/>
						<label
							className="a-stage2-row-edit-hint"
							htmlFor={rowNameInputId}
							title={copy.proxyNameEditableHint}
							aria-label={copy.proxyNameEditableHint}
						>
							<PencilIcon className="a-icon" aria-hidden />
						</label>
					</>
				)}
			</div>
			<div
				className={`a-stage2-row-icon-actions a-stage2-row-icon-actions--toolbar${toolbarPlaceholder ? " a-stage2-row-icon-actions--placeholder" : ""}`}
				aria-hidden={toolbarPlaceholder ? true : undefined}
			>
				{toolbarPlaceholder ? null : isSource ? (
					<button
						type="button"
						className="a-btn a-btn--secondary a-btn--icon"
						disabled={!editable}
						aria-label={copy.cloneRow}
						title={copy.cloneRow}
						onClick={() => onCloneRow(rowKey)}
					>
						<CopyIcon className="a-icon" aria-hidden />
					</button>
				) : (
					<button
						type="button"
						className="a-btn a-btn--secondary a-btn--icon"
						disabled={!editable || !canDeleteRow}
						aria-label={deleteRowTitle ?? copy.deleteRow}
						title={deleteRowTitle ?? copy.deleteRow}
						onClick={() => onDeleteRow(rowKey)}
					>
						<TrashIcon className="a-icon" aria-hidden />
					</button>
				)}
			</div>
		</div>
	);
}

interface Stage2RowModeCellProps {
	row: Stage2Row;
	rowKey: string;
	editable: boolean;
	locale: Stage2Locale;
	copy: Stage2Copy & Record<string, string>;
	rowErrors: { code: string; message: string }[];
	stage2Init: AppWorkflowViewModel["state"]["stage2Init"];
	getStage2RowMeta: AppWorkflowViewModel["getStage2RowMeta"];
	onModeChange: AppWorkflowViewModel["handleModeChange"];
	modeWarnId: string;
	rowErrorId: string;
	strategyValue?: "fallback" | "url-test";
	strategyDisabled?: boolean;
	onStrategyChange?: (strategy: "fallback" | "url-test") => void;
	emptyPlaceholder?: boolean;
	openTargetMenuRow: string | null;
	setOpenTargetMenuRow: (rowKey: string | null) => void;
	chainTargetMenuTriggerRef: React.MutableRefObject<HTMLButtonElement | null>;
	chainTargetMenuPanelRef: React.MutableRefObject<HTMLDivElement | null>;
	chainTargetMenuPortalEl: HTMLDivElement | null;
}

export function Stage2RowModeCell({
	row,
	rowKey,
	editable,
	locale,
	copy,
	rowErrors,
	stage2Init,
	getStage2RowMeta,
	onModeChange,
	modeWarnId,
	rowErrorId,
	strategyValue,
	strategyDisabled = false,
	onStrategyChange,
	emptyPlaceholder = false,
	openTargetMenuRow,
	setOpenTargetMenuRow,
	chainTargetMenuTriggerRef,
	chainTargetMenuPanelRef,
	chainTargetMenuPortalEl,
}: Stage2RowModeCellProps) {
	if (emptyPlaceholder) {
		return <div className="a-cell-type">--</div>;
	}

	if (strategyValue !== undefined && onStrategyChange) {
		const strategyOptions = (["fallback", "url-test"] as const).map((value) => ({
			value,
			label: getAggregationStrategyLabel(value, copy),
		}));
		const strategyLabel = getAggregationStrategyLabel(strategyValue, copy);

		return (
			<div className="a-mode-cell">
				<Stage2FlatSelectMenu
					menuKey={getStage2StrategyMenuKey(rowKey)}
					value={strategyValue}
					displayLabel={strategyLabel}
					options={strategyOptions}
					disabled={!editable || strategyDisabled}
					ariaLabel={copy.aggregationStrategyLabel}
					onSelect={(value) => onStrategyChange(value as "fallback" | "url-test")}
					openTargetMenuRow={openTargetMenuRow}
					setOpenTargetMenuRow={setOpenTargetMenuRow}
					menuTriggerRef={chainTargetMenuTriggerRef}
					menuPanelRef={chainTargetMenuPanelRef}
					menuPortalEl={chainTargetMenuPortalEl}
				/>
				<span className="a-mode-warning-slot" aria-hidden="true" />
			</div>
		);
	}

	const meta = getStage2RowMeta(rowKey);
	const displayModeOptions = getStage2DisplayModeOptions(stage2Init, row.mode);
	const activeModeWarning = meta?.modeWarnings?.[row.mode];
	const modeSelectOptions = displayModeOptions.map((mode) => {
		const restriction = meta?.restrictedModes?.[mode];
		const modeWarn = meta?.modeWarnings?.[mode];
		const label = getModeLabel(mode, locale, copy);
		return {
			value: mode,
			label: restriction ? `${label}（${restriction.reasonText}）` : label,
			disabled: Boolean(restriction),
			title: modeWarn && !restriction ? modeWarn.reasonText : undefined,
		};
	});
	const modeDisplayLabel = getModeLabel(row.mode, locale, copy);

	return (
		<div className="a-mode-cell">
			<Stage2FlatSelectMenu
				menuKey={getStage2ModeMenuKey(rowKey)}
				value={row.mode}
				displayLabel={modeDisplayLabel}
				options={modeSelectOptions}
				disabled={!editable}
				ariaInvalid={rowErrors.length > 0}
				ariaDescribedBy={
					[activeModeWarning ? modeWarnId : null, rowErrors.length > 0 ? rowErrorId : null]
						.filter(Boolean)
						.join(" ") || undefined
				}
				onSelect={(value) => onModeChange(rowKey, value as typeof row.mode)}
				openTargetMenuRow={openTargetMenuRow}
				setOpenTargetMenuRow={setOpenTargetMenuRow}
				menuTriggerRef={chainTargetMenuTriggerRef}
				menuPanelRef={chainTargetMenuPanelRef}
				menuPortalEl={chainTargetMenuPortalEl}
			/>
			<span className="a-mode-warning-slot">
				{activeModeWarning ? (
					<>
						<span id={modeWarnId} className="a-sr-only">
							{activeModeWarning.reasonText}
						</span>
						<Tooltip content={activeModeWarning.reasonText} placement="top">
							<span className="a-mode-warning-hint" aria-hidden="true">
								<svg
									xmlns="http://www.w3.org/2000/svg"
									viewBox="0 0 24 24"
									width="18"
									height="18"
									fill="none"
									aria-hidden="true"
								>
									<circle cx="12" cy="12" r="10" stroke="var(--color-line)" strokeWidth="2" />
									<path
										d="M12 8v4M12 16h.01"
										stroke="currentColor"
										strokeWidth="2"
										strokeLinecap="round"
									/>
								</svg>
							</span>
						</Tooltip>
					</>
				) : null}
			</span>
		</div>
	);
}

interface Stage2RowTargetCellProps {
	row: Stage2Row;
	rowKey: string;
	editable: boolean;
	copy: Stage2Copy;
	rowErrors: { code: string; message: string }[];
	stage2Init: AppWorkflowViewModel["state"]["stage2Init"];
	stage2Rows: Stage2Row[];
	getChainTargetChoiceGroups: AppWorkflowViewModel["getChainTargetChoiceGroups"];
	getForwardRelayChoices: AppWorkflowViewModel["getForwardRelayChoices"];
	onTargetChange: AppWorkflowViewModel["handleTargetChange"];
	openTargetMenuRow: string | null;
	setOpenTargetMenuRow: (rowKey: string | null) => void;
	chainTargetMenuTriggerRef: React.MutableRefObject<HTMLButtonElement | null>;
	chainTargetMenuPanelRef: React.MutableRefObject<HTMLDivElement | null>;
	chainTargetMenuPortalEl: HTMLDivElement | null;
	primaryOpen: boolean;
	supplementOpen: boolean;
	setPrimaryOpen: (rowKey: string, open: boolean) => void;
	setSupplementOpen: (rowKey: string, open: boolean) => void;
	rowErrorId: string;
	emptyPlaceholder?: boolean;
}

export function Stage2RowTargetCell({
	row,
	rowKey,
	editable,
	copy,
	rowErrors,
	stage2Init,
	stage2Rows,
	getChainTargetChoiceGroups,
	getForwardRelayChoices,
	onTargetChange,
	openTargetMenuRow,
	setOpenTargetMenuRow,
	chainTargetMenuTriggerRef,
	chainTargetMenuPanelRef,
	chainTargetMenuPortalEl,
	primaryOpen,
	supplementOpen,
	setPrimaryOpen,
	setSupplementOpen,
	rowErrorId,
	emptyPlaceholder = false,
}: Stage2RowTargetCellProps) {
	if (emptyPlaceholder) {
		return <div className="a-cell-type">--</div>;
	}

	const chainTargetGroups = getChainTargetChoiceGroups();
	const primaryGroup = chainTargetGroups.find((group) => group.kind === "proxy-groups") ?? null;
	const supplementGroup = chainTargetGroups.find((group) => group.kind === "proxies") ?? null;
	const forwardRelayChoices = getForwardRelayChoices(rowKey);
	const displayForwardRelayChoices =
		!editable &&
		stage2Init === null &&
		row.mode === "port_forward" &&
		row.targetName !== null &&
		!forwardRelayChoices.some((choice) => choice.value === row.targetName)
			? [{ value: row.targetName, label: row.targetName, disabled: false }, ...forwardRelayChoices]
			: forwardRelayChoices;
	const selectedTargetLabel =
		getStage2TargetDisplayLabel(stage2Init, stage2Rows, row) ??
		(row.mode === "none" ? "--" : copy.selectTarget);

	if (row.mode === "chain") {
		return (
			<div className="a-target-picker">
				<div className="a-target-menu">
					<button
						type="button"
						className={`a-select a-target-menu__trigger ${editable ? "" : "a-target-menu__summary--disabled"}`}
						disabled={!editable}
						aria-expanded={openTargetMenuRow === rowKey}
						onClick={(event) => {
							const trigger = event.currentTarget;
							if (openTargetMenuRow === rowKey) {
								chainTargetMenuTriggerRef.current = null;
								setOpenTargetMenuRow(null);
								return;
							}
							chainTargetMenuTriggerRef.current = trigger;
							setOpenTargetMenuRow(rowKey);
						}}
					>
						{selectedTargetLabel}
					</button>
					{openTargetMenuRow === rowKey && chainTargetMenuPortalEl
						? createPortal(
								<div className="a-target-menu a-target-menu--portal">
									<div ref={chainTargetMenuPanelRef} className="a-target-menu__panel a-target-menu__panel--anchored">
										<div className="a-target-menu__section">
											<button
												type="button"
												className="a-target-menu__group-toggle"
												disabled={!editable}
												aria-expanded={primaryOpen}
												onClick={() => setPrimaryOpen(rowKey, !primaryOpen)}
											>
												<span className="a-target-menu__group-label">{copy.commonGroups}</span>
												<span className={`a-target-menu__group-icon ${primaryOpen ? "is-open" : ""}`} aria-hidden="true">
													▾
												</span>
											</button>
											{primaryOpen ? (
												primaryGroup?.choices.length ? (
													<ul className="a-target-menu__list">
														{primaryGroup.choices.map((choice) => (
															<li key={choice.value}>
																<button
																	type="button"
																	className={`a-target-menu__item ${row.targetName === choice.value ? "a-target-menu__item--active" : ""}`}
																	disabled={!editable || choice.disabled}
																	onClick={() => {
																		onTargetChange(rowKey, choice.value);
																		setOpenTargetMenuRow(null);
																	}}
																>
																	{choice.label}
																</button>
															</li>
														))}
													</ul>
												) : (
													<p className="a-picker-help">{primaryGroup?.emptyText ?? copy.noCommonChoices}</p>
												)
											) : null}
										</div>
										{supplementGroup ? (
											<div className="a-target-menu__section">
												<button
													type="button"
													className="a-target-menu__group-toggle"
													disabled={!editable}
													aria-expanded={supplementOpen}
													onClick={() => setSupplementOpen(rowKey, !supplementOpen)}
												>
													<span className="a-target-menu__group-label">{copy.fixedNodes}</span>
													<span className={`a-target-menu__group-icon ${supplementOpen ? "is-open" : ""}`} aria-hidden="true">
														▾
													</span>
												</button>
												{supplementOpen ? (
													<ul className="a-target-menu__list">
														{supplementGroup.choices.map((choice) => (
															<li key={choice.value}>
																<button
																	type="button"
																	className={`a-target-menu__item ${row.targetName === choice.value ? "a-target-menu__item--active" : ""}`}
																	disabled={!editable || choice.disabled}
																	onClick={() => {
																		onTargetChange(rowKey, choice.value);
																		setOpenTargetMenuRow(null);
																	}}
																>
																	{choice.label}
																</button>
															</li>
														))}
													</ul>
												) : null}
											</div>
										) : null}
									</div>
								</div>,
								chainTargetMenuPortalEl,
							)
						: null}
				</div>
				{rowErrors.length > 0 ? (
					<p id={rowErrorId} className="a-sr-only" role="status">
						{copy.localErrorAriaHint}
					</p>
				) : null}
			</div>
		);
	}

	const forwardTargetOptions = [
		{ value: "", label: row.mode === "none" ? "--" : copy.selectTarget },
		...displayForwardRelayChoices.map((choice) => ({
			value: choice.value,
			label: choice.label,
			disabled: choice.disabled,
		})),
	];
	const forwardTargetDisabled = !editable || row.mode === "none";

	return (
		<div className="a-target-picker">
			<Stage2FlatSelectMenu
				menuKey={getStage2ForwardTargetMenuKey(rowKey)}
				value={row.targetName ?? ""}
				displayLabel={selectedTargetLabel}
				options={forwardTargetOptions}
				disabled={forwardTargetDisabled}
				ariaInvalid={rowErrors.length > 0}
				ariaDescribedBy={rowErrors.length > 0 ? rowErrorId : undefined}
				onSelect={(value) => onTargetChange(rowKey, value === "" ? "" : value)}
				openTargetMenuRow={openTargetMenuRow}
				setOpenTargetMenuRow={setOpenTargetMenuRow}
				menuTriggerRef={chainTargetMenuTriggerRef}
				menuPanelRef={chainTargetMenuPanelRef}
				menuPortalEl={chainTargetMenuPortalEl}
			/>
			{rowErrors.length > 0 ? (
				<p id={rowErrorId} className="a-sr-only" role="status">
					{copy.localErrorAriaHint}
				</p>
			) : null}
		</div>
	);
}

interface Stage2ServerMemberOrderCellProps {
	anchorRowKey: string;
	editable: boolean;
	enabled: boolean;
	strategy: "fallback" | "url-test";
	copy: Stage2Copy;
	members: Array<{ rowId: string; displayName: string; isSource: boolean }>;
	onMemberMoveTo: (memberRowId: string, toIndex: number) => void;
	openTargetMenuRow: string | null;
	setOpenTargetMenuRow: (rowKey: string | null) => void;
	chainTargetMenuTriggerRef: React.MutableRefObject<HTMLButtonElement | null>;
	chainTargetMenuPanelRef: React.MutableRefObject<HTMLDivElement | null>;
	chainTargetMenuPortalEl: HTMLDivElement | null;
}

export function Stage2ServerMemberOrderCell({
	anchorRowKey,
	editable,
	enabled,
	strategy,
	copy,
	members,
	onMemberMoveTo,
	openTargetMenuRow,
	setOpenTargetMenuRow,
	chainTargetMenuTriggerRef,
	chainTargetMenuPanelRef,
	chainTargetMenuPortalEl,
}: Stage2ServerMemberOrderCellProps) {
	const menuKey = getServerMemberOrderMenuKey(anchorRowKey);
	const canManageOrder = editable && enabled && strategy === "fallback";
	const triggerLabel = copy.memberOrderManage;
	const triggerTitle = !enabled
		? undefined
		: strategy === "url-test"
			? copy.memberOrderUrlTestHint
			: undefined;

	return (
		<div className="a-target-picker">
			<div className="a-target-menu">
				<button
					type="button"
					className="a-select a-target-menu__trigger a-target-menu__trigger--member-order"
					disabled={!canManageOrder}
					title={triggerTitle}
					aria-expanded={openTargetMenuRow === menuKey}
					onClick={(event) => {
						if (!canManageOrder) {
							return;
						}
						const trigger = event.currentTarget;
						if (openTargetMenuRow === menuKey) {
							chainTargetMenuTriggerRef.current = null;
							setOpenTargetMenuRow(null);
							return;
						}
						chainTargetMenuTriggerRef.current = trigger;
						setOpenTargetMenuRow(menuKey);
					}}
				>
					<span className="a-member-order-trigger__body">
						<span className="a-member-order-trigger__wing" aria-hidden="true">
							‹‹
						</span>
						<span className="a-member-order-trigger__label">{triggerLabel}</span>
						<span className="a-member-order-trigger__wing" aria-hidden="true">
							››
						</span>
					</span>
				</button>
				{openTargetMenuRow === menuKey && chainTargetMenuPortalEl
					? createPortal(
							<div className="a-target-menu a-target-menu--portal">
								<div
									ref={chainTargetMenuPanelRef}
									className="a-target-menu__panel a-target-menu__panel--anchored a-target-menu__panel--member-order"
								>
									<div className="a-target-menu__section">
										<p className="a-target-menu__section-title">{copy.memberOrderFallbackHint}</p>
										{members.length > 0 ? (
											<Stage2MemberOrderList
												canManageOrder={canManageOrder}
												copy={copy}
												members={members}
												onMemberMoveTo={onMemberMoveTo}
											/>
										) : (
											<p className="a-picker-help">{copy.memberOrderEmpty}</p>
										)}
									</div>
								</div>
							</div>,
							chainTargetMenuPortalEl,
						)
					: null}
			</div>
		</div>
	);
}

interface Stage2AggregationCellProps {
	hint: string;
	checked: boolean;
	disabled?: boolean;
	onChange: (checked: boolean) => void;
}

export function Stage2AggregationCell({ hint, checked, disabled = false, onChange }: Stage2AggregationCellProps) {
	return (
		<div className="a-stage2-agg-cell">
			<label className="a-check a-check--solo" title={hint}>
				<input
					type="checkbox"
					checked={checked}
					disabled={disabled}
					aria-label={hint}
					onChange={(event) => onChange(event.target.checked)}
				/>
			</label>
		</div>
	);
}
