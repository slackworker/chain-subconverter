import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from "react";

import type { AppWorkflowViewModel } from "../../hooks/useAppWorkflow";
import { Tooltip } from "../../lib/Tooltip";
import { ArrowRightIcon, ChevronDownIcon, ResetIcon } from "./Icons";
import { Stage2AggregationTree } from "./Stage2AggregationTree";
import { Stage2FlatTable } from "./Stage2FlatTable";
import {
	computeChainTargetMenuPanelLayout,
	MEMBER_ORDER_PANEL_MIN_WIDTH,
	measureTargetMenuPanelContentWidth,
} from "./stage2ChainTargetMenu";
import type { Stage2Copy, Stage2Locale } from "./Stage2RowCells";

function OriginAnchoredBlockingStrip({
	errors,
	stageLabel,
	currentStageLabel,
}: {
	errors: { code: string; message: string }[];
	stageLabel?: string;
	currentStageLabel: string;
}) {
	if (errors.length === 0) {
		return null;
	}
	return (
		<div className="a-stage-feedback-strip a-stage-feedback-strip--danger" role="status" aria-live="polite">
			<span className="a-stage-feedback-strip__stage">{stageLabel ?? currentStageLabel}</span>
			<span className="a-stage-feedback-strip__msg">
				{errors.map((error) => (
					<span key={`${error.code}:${error.message}`} className="a-stage-feedback-strip__line">
						{error.message}
					</span>
				))}
			</span>
		</div>
	);
}

function StageHeadline({
	id,
	step,
	stageLabel,
	title,
}: {
	id: string;
	step: 1 | 2 | 3;
	stageLabel: string;
	title: string;
}) {
	return (
		<h2 id={id} className="a-stage__headline" aria-label={`${stageLabel} — ${title}`}>
			<span className="a-stage-headline__visual" aria-hidden="true">
				<span className="a-stage-step" title={stageLabel}>
					{step}
				</span>
				<span className="a-stage__title">{title}</span>
			</span>
		</h2>
	);
}

function StatusPill({ label, tone }: { label: string; tone: "neutral" | "warning" | "success" }) {
	return <span className={`a-pill a-pill--${tone}`}>{label}</span>;
}

interface Stage2SectionProps {
	workflow: AppWorkflowViewModel;
	locale: Stage2Locale;
	copy: Stage2Copy & Record<string, string>;
	localizedStage2Status: string;
	stage2StatusTone: "neutral" | "warning" | "success";
	isConflictReadonly: boolean;
	stage2AggregationMode: boolean;
	setStage2AggregationMode: (value: boolean | ((current: boolean) => boolean)) => void;
	stage2AdvancedOpen: boolean;
	setStage2AdvancedOpen: (value: boolean | ((current: boolean) => boolean)) => void;
	stage2PrimaryBlockingErrors: { code: string; message: string }[];
	localizedOriginStageLabel?: string;
	isGenerating: boolean;
	canGenerate: boolean;
	handleGenerate: () => void;
	isStage2Editable: boolean;
	tableWrapRef: RefObject<HTMLDivElement | null>;
}

export function Stage2Section({
	workflow,
	locale,
	copy,
	localizedStage2Status,
	stage2StatusTone,
	isConflictReadonly,
	stage2AggregationMode,
	setStage2AggregationMode,
	stage2AdvancedOpen,
	setStage2AdvancedOpen,
	stage2PrimaryBlockingErrors,
	localizedOriginStageLabel,
	isGenerating,
	canGenerate,
	handleGenerate,
	isStage2Editable,
	tableWrapRef,
}: Stage2SectionProps) {
	const { stage2Rows, state, isResettingStage2 } = workflow;
	const switchOptimizationEnabled = Boolean(
		state.stage2Snapshot.chainProxyTargetGroupSwitchOptimizationEnabled,
	);
	const [openTargetMenuRow, setOpenTargetMenuRow] = useState<string | null>(null);
	const [primaryOpenByRow, setPrimaryOpenByRow] = useState<Record<string, boolean>>({});
	const [supplementOpenByRow, setSupplementOpenByRow] = useState<Record<string, boolean>>({});
	const chainTargetMenuTriggerRef = useRef<HTMLButtonElement | null>(null);
	const chainTargetMenuPanelRef = useRef<HTMLDivElement | null>(null);
	const chainTargetMenuPortalRef = useRef<HTMLDivElement | null>(null);

	useEffect(() => {
		const hasEnabledAggregation = state.stage2Snapshot.serverAggregationGroups.some((group) => group.enabled);
		if (hasEnabledAggregation) {
			setStage2AggregationMode(true);
		}
	}, [state.stage2Snapshot.serverAggregationGroups, setStage2AggregationMode]);

	useEffect(() => {
		if (openTargetMenuRow === null) {
			chainTargetMenuTriggerRef.current = null;
		}
	}, [openTargetMenuRow]);

	useLayoutEffect(() => {
		if (!openTargetMenuRow) {
			return;
		}
		const syncPanelToTrigger = () => {
			const trigger = chainTargetMenuTriggerRef.current;
			const panel = chainTargetMenuPanelRef.current;
			if (!trigger || !panel) {
				return;
			}
			const isMemberOrder = openTargetMenuRow?.startsWith("server-order:");
			const contentWidth = measureTargetMenuPanelContentWidth(panel);
			const { top, left, width, maxHeight, contentOverflows } = computeChainTargetMenuPanelLayout(trigger, {
				minWidth: isMemberOrder ? MEMBER_ORDER_PANEL_MIN_WIDTH : undefined,
				contentWidth,
			});
			panel.style.top = `${top}px`;
			panel.style.left = `${left}px`;
			panel.style.width = `${width}px`;
			panel.style.maxHeight = `${maxHeight}px`;
			panel.style.overflowX = isMemberOrder && contentOverflows ? "auto" : "";
		};
		syncPanelToTrigger();
		const wrap = tableWrapRef.current;
		const windowScrollOpts: AddEventListenerOptions = { capture: true, passive: true };
		const passiveScrollOpts: AddEventListenerOptions = { passive: true };
		window.addEventListener("resize", syncPanelToTrigger);
		window.addEventListener("scroll", syncPanelToTrigger, windowScrollOpts);
		wrap?.addEventListener("scroll", syncPanelToTrigger, passiveScrollOpts);
		const vv = window.visualViewport;
		vv?.addEventListener("resize", syncPanelToTrigger);
		vv?.addEventListener("scroll", syncPanelToTrigger, passiveScrollOpts);
		return () => {
			window.removeEventListener("resize", syncPanelToTrigger);
			window.removeEventListener("scroll", syncPanelToTrigger, windowScrollOpts);
			wrap?.removeEventListener("scroll", syncPanelToTrigger, passiveScrollOpts);
			vv?.removeEventListener("resize", syncPanelToTrigger);
			vv?.removeEventListener("scroll", syncPanelToTrigger, passiveScrollOpts);
		};
	}, [openTargetMenuRow, primaryOpenByRow, supplementOpenByRow, tableWrapRef]);

	useEffect(() => {
		function handlePointerDown(event: PointerEvent) {
			const target = event.target;
			if (!(target instanceof Node)) {
				setOpenTargetMenuRow(null);
				return;
			}
			const element = target instanceof Element ? target : target.parentElement;
			if (element?.closest(".a-target-menu")) {
				return;
			}
			setOpenTargetMenuRow(null);
		}

		document.addEventListener("pointerdown", handlePointerDown, true);
		return () => {
			document.removeEventListener("pointerdown", handlePointerDown, true);
		};
	}, []);

	function setSupplementOpen(rowKey: string, open: boolean) {
		setSupplementOpenByRow((current) => ({
			...current,
			[rowKey]: open,
		}));
	}

	function setPrimaryOpen(rowKey: string, open: boolean) {
		setPrimaryOpenByRow((current) => ({
			...current,
			[rowKey]: open,
		}));
	}

	const sharedTableProps = {
		workflow,
		locale,
		copy,
		tableWrapRef,
		openTargetMenuRow,
		setOpenTargetMenuRow,
		chainTargetMenuTriggerRef,
		chainTargetMenuPanelRef,
		chainTargetMenuPortalEl: chainTargetMenuPortalRef.current,
		primaryOpenByRow,
		supplementOpenByRow,
		setPrimaryOpen,
		setSupplementOpen,
	};

	function handleAggregationModeToggle(checked: boolean) {
		setStage2AggregationMode(checked);
		if (!checked) {
			workflow.handleClearServerAggregationGroups();
		}
	}

	return (
		<section className="a-stage" aria-labelledby="a-stage2-h">
			<div ref={chainTargetMenuPortalRef} className="a-scheme-a-portal-mount" aria-hidden="true" />
			<div className="a-stage__head">
				<div>
					<StageHeadline id="a-stage2-h" step={2} stageLabel={copy.stage2Label} title={copy.stage2Title} />
					<p className="a-stage__desc">{copy.stage2Desc}</p>
				</div>
				<StatusPill label={localizedStage2Status} tone={stage2StatusTone} />
			</div>

			{isConflictReadonly ? <p className="a-conflict-banner">{copy.conflictReadonly}</p> : null}

			<div className="a-stage2-table-block">
				{stage2Rows.length > 0 ? (
					<div className="a-stage2-table-toolbar">
						<label className="a-check a-check--switch a-stage2-aggregation-toggle">
							<input
								className="a-switch__input"
								type="checkbox"
								checked={stage2AggregationMode}
								disabled={!isStage2Editable}
								aria-label={copy.stage2AggregationMode}
								onChange={(event) => handleAggregationModeToggle(event.target.checked)}
							/>
							<span className="a-switch" aria-hidden />
							<span className="a-stage2-aggregation-toggle__label">
								{copy.stage2AggregationMode}{" "}
								<Tooltip content={copy.stage2AggregationModeHint}>
									<span className="a-hint" aria-label={copy.stage2AggregationModeHintAria}>
										?
									</span>
								</Tooltip>
							</span>
						</label>
					</div>
				) : null}
				{stage2Rows.length === 0 ? (
					<div className="a-empty-state">{copy.stage2Empty}</div>
				) : stage2AggregationMode ? (
					<Stage2AggregationTree {...sharedTableProps} />
				) : (
					<Stage2FlatTable {...sharedTableProps} />
				)}
			</div>

			<div className="a-stage2-actions-wrap">
				{stage2Rows.length > 0 ? (
					<>
						<button
							type="button"
							className="a-advanced__toggle"
							onClick={() => setStage2AdvancedOpen((open) => !open)}
							aria-expanded={stage2AdvancedOpen}
						>
							<ChevronDownIcon
								className={`a-adv-chevron${stage2AdvancedOpen ? " a-adv-chevron--open" : ""}`}
								aria-hidden="true"
							/>
							{copy.advancedOptions}
						</button>
						{stage2AdvancedOpen ? (
							<div className="a-check-row a-check-row--stage2-advanced a-check-row--tail-reset">
								<label className="a-check a-check--switch">
									<input
										className="a-switch__input"
										type="checkbox"
										checked={switchOptimizationEnabled}
										disabled={!isStage2Editable}
										aria-label={copy.switchOptimizationLabel}
										onChange={(event) =>
											workflow.handleSwitchOptimizationChange(event.target.checked)}
									/>
									<span className="a-switch" aria-hidden />
									<span className="a-advanced__switch-label">
										{copy.switchOptimizationLabel}{" "}
										<Tooltip content={copy.switchOptimizationHint}>
											<span
												className="a-hint"
												aria-label={copy.switchOptimizationHintAria}
											>
												?
											</span>
										</Tooltip>
									</span>
								</label>
								<button
									type="button"
									className="a-stage-action-reset"
									disabled={!isStage2Editable || isResettingStage2 || isGenerating}
									aria-busy={isResettingStage2 || undefined}
									title={copy.stage2Reset}
									onClick={() => void workflow.handleStage2Reset()}
								>
									<ResetIcon className="a-icon" aria-hidden />
									<span>{copy.stage2Reset}</span>
								</button>
							</div>
						) : null}
					</>
				) : null}

				<div className="a-stage-actions a-stage-actions--primary-end">
					{stage2PrimaryBlockingErrors.length > 0 ? (
						<div className="a-stage-actions__feedback">
							<OriginAnchoredBlockingStrip
								errors={stage2PrimaryBlockingErrors}
								stageLabel={localizedOriginStageLabel}
								currentStageLabel={copy.currentStage}
							/>
						</div>
					) : null}
					<button type="button" className="a-btn a-btn--primary" disabled={!canGenerate || isGenerating || isResettingStage2} onClick={() => void handleGenerate()}>
						{isGenerating ? (
							copy.generating
						) : (
							<>
								{copy.generateLink}
								<ArrowRightIcon className="a-icon" aria-hidden />
							</>
						)}
					</button>
				</div>
			</div>
		</section>
	);
}
