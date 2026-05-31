import {
	cloneElement,
	isValidElement,
	useCallback,
	useEffect,
	useId,
	useLayoutEffect,
	useRef,
	useState,
	type CSSProperties,
	type FocusEvent,
	type MouseEvent,
	type ReactElement,
	type ReactNode,
	type Ref,
} from "react";
import { createPortal } from "react-dom";

import "./tooltip.css";

export type TooltipPlacement = "top" | "bottom";

export interface TooltipProps {
	content: ReactNode;
	placement?: TooltipPlacement;
	/** Hover/focus 后延迟显示（毫秒）；0 表示立即显示 */
	showDelay?: number;
	children: ReactElement;
}

const VIEWPORT_EDGE = 8;
const TRIGGER_GAP = 6;
const DEFAULT_SHOW_DELAY = 120;
const HIDE_DELAY = 80;

function mergeRefs<T>(...refs: Array<Ref<T> | undefined>): (value: T | null) => void {
	return (value) => {
		for (const ref of refs) {
			if (typeof ref === "function") {
				ref(value);
			} else if (ref && typeof ref === "object") {
				(ref as { current: T | null }).current = value;
			}
		}
	};
}

function resolvePortalContainer(trigger: HTMLElement | null): HTMLElement {
	const shell = trigger?.closest(".a-shell");
	if (shell instanceof HTMLElement) {
		return shell;
	}
	return document.body;
}

function computeTooltipStyle(
	trigger: HTMLElement,
	tooltip: HTMLElement,
	preferredPlacement: TooltipPlacement,
): CSSProperties {
	const triggerRect = trigger.getBoundingClientRect();
	const tooltipRect = tooltip.getBoundingClientRect();
	const maxLeft = window.innerWidth - tooltipRect.width - VIEWPORT_EDGE;
	let left = triggerRect.left + triggerRect.width / 2 - tooltipRect.width / 2;
	left = Math.max(VIEWPORT_EDGE, Math.min(left, maxLeft));

	let placement = preferredPlacement;
	let top =
		placement === "top"
			? triggerRect.top - tooltipRect.height - TRIGGER_GAP
			: triggerRect.bottom + TRIGGER_GAP;

	if (placement === "top" && top < VIEWPORT_EDGE) {
		placement = "bottom";
		top = triggerRect.bottom + TRIGGER_GAP;
	} else if (
		placement === "bottom" &&
		top + tooltipRect.height > window.innerHeight - VIEWPORT_EDGE
	) {
		placement = "top";
		top = triggerRect.top - tooltipRect.height - TRIGGER_GAP;
	}

	top = Math.max(
		VIEWPORT_EDGE,
		Math.min(top, window.innerHeight - tooltipRect.height - VIEWPORT_EDGE),
	);

	return {
		position: "fixed",
		top,
		left,
		zIndex: 61,
	};
}

export function Tooltip({
	content,
	placement = "top",
	showDelay = DEFAULT_SHOW_DELAY,
	children,
}: TooltipProps) {
	const tooltipId = useId();
	const triggerRef = useRef<HTMLElement | null>(null);
	const tooltipRef = useRef<HTMLDivElement | null>(null);
	const showTimerRef = useRef<number | undefined>(undefined);
	const hideTimerRef = useRef<number | undefined>(undefined);
	const [open, setOpen] = useState(false);
	const [portalContainer, setPortalContainer] = useState<HTMLElement | null>(null);
	const [tooltipStyle, setTooltipStyle] = useState<CSSProperties>({
		position: "fixed",
		top: 0,
		left: 0,
		visibility: "hidden",
		zIndex: 61,
	});

	const clearTimers = useCallback(() => {
		if (showTimerRef.current !== undefined) {
			window.clearTimeout(showTimerRef.current);
			showTimerRef.current = undefined;
		}
		if (hideTimerRef.current !== undefined) {
			window.clearTimeout(hideTimerRef.current);
			hideTimerRef.current = undefined;
		}
	}, []);

	const reposition = useCallback(() => {
		const trigger = triggerRef.current;
		const tooltip = tooltipRef.current;
		if (!trigger || !tooltip) {
			return;
		}
		setTooltipStyle({
			...computeTooltipStyle(trigger, tooltip, placement),
			visibility: "visible",
		});
	}, [placement]);

	const scheduleShow = useCallback(() => {
		clearTimers();
		if (content === null || content === undefined || content === "") {
			return;
		}
		if (showDelay <= 0) {
			setPortalContainer(resolvePortalContainer(triggerRef.current));
			setOpen(true);
			return;
		}
		showTimerRef.current = window.setTimeout(() => {
			setPortalContainer(resolvePortalContainer(triggerRef.current));
			setOpen(true);
		}, showDelay);
	}, [clearTimers, content, showDelay]);

	const scheduleHide = useCallback(() => {
		clearTimers();
		hideTimerRef.current = window.setTimeout(() => {
			setOpen(false);
		}, HIDE_DELAY);
	}, [clearTimers]);

	useLayoutEffect(() => {
		if (!open) {
			return;
		}
		reposition();
	}, [open, content, placement, reposition]);

	useEffect(() => {
		if (!open) {
			return undefined;
		}

		const handleReposition = () => {
			reposition();
		};

		window.addEventListener("resize", handleReposition);
		window.addEventListener("scroll", handleReposition, true);
		return () => {
			window.removeEventListener("resize", handleReposition);
			window.removeEventListener("scroll", handleReposition, true);
		};
	}, [open, reposition]);

	useEffect(() => clearTimers, [clearTimers]);

	if (!isValidElement(children)) {
		return children;
	}

	const childProps = children.props as {
		className?: string;
		onMouseEnter?: (event: React.MouseEvent<HTMLElement>) => void;
		onMouseLeave?: (event: React.MouseEvent<HTMLElement>) => void;
		onFocus?: (event: React.FocusEvent<HTMLElement>) => void;
		onBlur?: (event: React.FocusEvent<HTMLElement>) => void;
		ref?: Ref<HTMLElement>;
	};

	const trigger = cloneElement(children, {
		ref: mergeRefs(childProps.ref, triggerRef),
		onMouseEnter: (event: MouseEvent<HTMLElement>) => {
			childProps.onMouseEnter?.(event);
			scheduleShow();
		},
		onMouseLeave: (event: MouseEvent<HTMLElement>) => {
			childProps.onMouseLeave?.(event);
			scheduleHide();
		},
		onFocus: (event: FocusEvent<HTMLElement>) => {
			childProps.onFocus?.(event);
			scheduleShow();
		},
		onBlur: (event: FocusEvent<HTMLElement>) => {
			childProps.onBlur?.(event);
			scheduleHide();
		},
	} as Record<string, unknown>);

	const tooltipNode =
		open && portalContainer && content !== null && content !== undefined && content !== ""
			? createPortal(
					<div
						ref={tooltipRef}
						id={tooltipId}
						role="tooltip"
						className="cs-tooltip"
						style={tooltipStyle}
						onMouseEnter={scheduleShow}
						onMouseLeave={scheduleHide}
					>
						{content}
					</div>,
					portalContainer,
				)
			: null;

	return (
		<>
			{trigger}
			{tooltipNode}
		</>
	);
}
