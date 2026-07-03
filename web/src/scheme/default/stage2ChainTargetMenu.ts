export const MEMBER_ORDER_PANEL_MIN_WIDTH = 240;

export type ChainTargetMenuPanelLayoutOptions = {
	minWidth?: number;
	/** 面板内容自然宽度（如 panel.scrollWidth），用于顺序管理等需完整展示节点名的场景 */
	contentWidth?: number;
};

/** 链式目标自定义菜单：Portal + fixed，避免落在 .a-table-wrap（overflow-x: auto → y 为 auto）内撑出纵向滚动条 */
export function computeChainTargetMenuPanelLayout(
	trigger: HTMLButtonElement,
	options?: ChainTargetMenuPanelLayoutOptions,
) {
	const rect = trigger.getBoundingClientRect();
	const gap = 5;
	const top = rect.bottom + gap;
	const edge = 12;
	const maxHeight = Math.min(
		window.innerHeight * 0.65,
		Math.max(120, window.innerHeight - top - edge),
		32 * 16,
	);
	const maxPanelWidth = window.innerWidth - edge * 2;
	const minWidth = options?.minWidth ?? 8;
	const contentWidth = options?.contentWidth ?? 0;
	const desiredWidth = Math.max(rect.width, minWidth, contentWidth);
	const width = Math.min(desiredWidth, maxPanelWidth);
	const left = Math.min(Math.max(edge, rect.left), window.innerWidth - width - edge);
	return {
		top,
		left,
		width,
		maxHeight,
		maxPanelWidth,
		contentOverflows: desiredWidth > width,
	};
}

/** 在已挂载的目标菜单面板上测量内容自然宽度，供 {@link computeChainTargetMenuPanelLayout} 使用 */
export function measureTargetMenuPanelContentWidth(panel: HTMLElement): number {
	const previousWidth = panel.style.width;
	const previousMinWidth = panel.style.minWidth;
	panel.style.width = "max-content";
	panel.style.minWidth = "0";
	const contentWidth = panel.scrollWidth;
	panel.style.width = previousWidth;
	panel.style.minWidth = previousMinWidth;
	return contentWidth;
}

/** @deprecated 使用 {@link measureTargetMenuPanelContentWidth} */
export function measureMemberOrderPanelContentWidth(panel: HTMLElement): number {
	return measureTargetMenuPanelContentWidth(panel);
}
