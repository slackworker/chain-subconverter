/** 链式目标自定义菜单：Portal + fixed，避免落在 .a-table-wrap（overflow-x: auto → y 为 auto）内撑出纵向滚动条 */
export function computeChainTargetMenuPanelLayout(trigger: HTMLButtonElement) {
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
	const width = Math.min(Math.max(rect.width, 8), maxPanelWidth);
	const left = Math.min(Math.max(edge, rect.left), window.innerWidth - width - edge);
	return { top, left, width, maxHeight };
}
