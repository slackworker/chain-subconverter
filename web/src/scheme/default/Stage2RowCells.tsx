import { createPortal } from "react-dom";

import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import { Tooltip } from "../../lib/Tooltip";
import { formatModeReason } from "../../lib/mode-reason";
import {
	getStage2DisplayModeOptions,
	getStage2RowEditableName,
	getStage2TargetDisplayLabel,
} from "../../lib/stage2";
import type { ServerAggregationGroup, Stage2Row } from "../../types/api";
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
	serverGroupNameEditableHint: string;
	cloneRow: string;
	deleteRow: string;
	keepOneInstance: string;
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
	memberOrderDefaultInstanceBadge: string;
	memberOrderDuplicateBadge: string;
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
	strategy: ServerAggregationGroup["strategy"],
	copy: Stage2Copy & Record<string, string>,
) {
	const labels: Record<ServerAggregationGroup["strategy"], string> = {
		fallback: copy.strategy_fallback as string,
		"url-test": copy.strategy_url_test as string,
		select: copy.strategy_select as string,
		"load-balance": copy.strategy_load_balance as string,
	};
	return labels[strategy] ?? strategy;
}

interface Stage2RowNameCellProps {
	row: Stage2Row;
	rowKey: string;
	editable: boolean;
	nameValueOverride?: string;
	nameEditableHint?: string;
	rowErrors: { code: string; message: string }[];
	copy: Stage2Copy;
	wrapperClassName?: string;
	sourceLandingName?: string;
	isDefaultInstance: boolean;
	canDeleteRow: boolean;
	deleteRowTitle?: string;
	rowNameInputId: string;
	onProxyNameChange: (rowKey: string, value: string) => void;
	onProxyNameBlur?: (rowKey: string) => void;
	onNameChange?: (rowKey: string, value: string) => void;
	onCloneRow: (rowKey: string) => void;
	onDeleteRow: (rowKey: string) => void;
	readOnlyLabel?: string;
	toolbarPlaceholder?: boolean;
}

export function Stage2RowNameCell({
	row,
	rowKey,
	editable,
	nameValueOverride,
	nameEditableHint,
	rowErrors,
	copy,
	wrapperClassName = "a-stage2-tree-name",
	sourceLandingName,
	isDefaultInstance,
	canDeleteRow,
	deleteRowTitle,
	rowNameInputId,
	onProxyNameChange,
	onProxyNameBlur,
	onNameChange,
	onCloneRow,
	onDeleteRow,
	readOnlyLabel,
	toolbarPlaceholder = false,
}: Stage2RowNameCellProps) {
	return (
		<div
			className={wrapperClassName}
			title={sourceLandingName && !isDefaultInstance && !readOnlyLabel ? sourceLandingName : undefined}
		>
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
							onChange={(event) => (onNameChange ?? onProxyNameChange)(rowKey, event.target.value)}
							onBlur={() => {
								if (onNameChange === undefined) {
									onProxyNameBlur?.(rowKey);
								}
							}}
						/>
						<label
							className="a-stage2-row-edit-hint"
							htmlFor={rowNameInputId}
							title={nameEditableHint ?? copy.proxyNameEditableHint}
							aria-label={nameEditableHint ?? copy.proxyNameEditableHint}
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
				{toolbarPlaceholder ? null : isDefaultInstance ? (
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
	strategyValue?: ServerAggregationGroup["strategy"];
	strategyDisabled?: boolean;
	onStrategyChange?: (strategy: ServerAggregationGroup["strategy"]) => void;
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
		const strategyOptions = (["fallback", "url-test", "select", "load-balance"] as const).map((value) => ({
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
					onSelect={(value) => onStrategyChange(value as ServerAggregationGroup["strategy"])}
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
	const activeModeWarningText = activeModeWarning ? formatModeReason(activeModeWarning, locale) : "";
	const modeSelectOptions = displayModeOptions.map((mode) => {
		const restriction = meta?.restrictedModes?.[mode];
		const modeWarn = meta?.modeWarnings?.[mode];
		const label = getModeLabel(mode, locale, copy);
		return {
			value: mode,
			label: restriction ? `${label}（${formatModeReason(restriction, locale)}）` : label,
			disabled: Boolean(restriction),
			title: modeWarn && !restriction ? formatModeReason(modeWarn, locale) : undefined,
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
							{activeModeWarningText}
						</span>
						<Tooltip content={activeModeWarningText} placement="top">
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
	strategy: ServerAggregationGroup["strategy"];
	copy: Stage2Copy;
	members: Array<{ instanceId: string; displayName: string; isDefaultInstance: boolean }>;
	onMemberMoveTo: (memberInstanceId: string, toIndex: number) => void;
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
