import { createPortal } from "react-dom";

export type Stage2FlatSelectOption = {
	value: string;
	label: string;
	disabled?: boolean;
	title?: string;
};

export function getStage2ModeMenuKey(rowKey: string) {
	return `mode:${rowKey}`;
}

export function getStage2ForwardTargetMenuKey(rowKey: string) {
	return `forward:${rowKey}`;
}

export function getStage2StrategyMenuKey(rowKey: string) {
	return `strategy:${rowKey}`;
}

interface Stage2FlatSelectMenuProps {
	menuKey: string;
	value: string;
	displayLabel: string;
	options: Stage2FlatSelectOption[];
	disabled?: boolean;
	onSelect: (value: string) => void;
	openTargetMenuRow: string | null;
	setOpenTargetMenuRow: (rowKey: string | null) => void;
	menuTriggerRef: React.MutableRefObject<HTMLButtonElement | null>;
	menuPanelRef: React.MutableRefObject<HTMLDivElement | null>;
	menuPortalEl: HTMLDivElement | null;
	ariaInvalid?: boolean;
	ariaDescribedBy?: string;
	ariaLabel?: string;
}

export function Stage2FlatSelectMenu({
	menuKey,
	value,
	displayLabel,
	options,
	disabled = false,
	onSelect,
	openTargetMenuRow,
	setOpenTargetMenuRow,
	menuTriggerRef,
	menuPanelRef,
	menuPortalEl,
	ariaInvalid,
	ariaDescribedBy,
	ariaLabel,
}: Stage2FlatSelectMenuProps) {
	const isOpen = openTargetMenuRow === menuKey;

	return (
		<div className="a-target-menu">
			<button
				type="button"
				className={`a-select a-target-menu__trigger ${disabled ? "a-target-menu__summary--disabled" : ""}`}
				disabled={disabled}
				aria-expanded={isOpen}
				aria-haspopup="listbox"
				aria-invalid={ariaInvalid ? true : undefined}
				aria-describedby={ariaDescribedBy}
				aria-label={ariaLabel}
				onClick={(event) => {
					const trigger = event.currentTarget;
					if (isOpen) {
						menuTriggerRef.current = null;
						setOpenTargetMenuRow(null);
						return;
					}
					menuTriggerRef.current = trigger;
					setOpenTargetMenuRow(menuKey);
				}}
			>
				{displayLabel}
			</button>
			{isOpen && menuPortalEl
				? createPortal(
						<div className="a-target-menu a-target-menu--portal">
							<div ref={menuPanelRef} className="a-target-menu__panel a-target-menu__panel--anchored" role="listbox">
								<ul className="a-target-menu__list">
									{options.map((option) => (
										<li key={option.value}>
											<button
												type="button"
												role="option"
												aria-selected={value === option.value}
												className={`a-target-menu__item ${value === option.value ? "a-target-menu__item--active" : ""}`}
												disabled={option.disabled}
												title={option.title}
												onClick={() => {
													onSelect(option.value);
													setOpenTargetMenuRow(null);
												}}
											>
												{option.label}
											</button>
										</li>
									))}
								</ul>
							</div>
						</div>,
						menuPortalEl,
					)
				: null}
		</div>
	);
}
