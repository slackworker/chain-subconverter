export type ColorMode = "dark" | "light";

export function isDark(colorMode: ColorMode): boolean {
	return colorMode === "dark";
}

/** Stage 卡片外框（与 b1 一致） */
export function cardShell(colorMode: ColorMode, extra = ""): string {
	const dark = isDark(colorMode);
	return [
		"flex flex-col gap-6 backdrop-blur-xl border p-6 rounded-2xl shadow-xl transition-all duration-300",
		dark ? "bg-zinc-900/50 border-zinc-800/80" : "bg-white border-slate-200/80 shadow-slate-100",
		extra,
	]
		.filter(Boolean)
		.join(" ");
}

export function cardTitle(colorMode: ColorMode): string {
	return `text-2xl font-bold tracking-tight ${isDark(colorMode) ? "text-zinc-100" : "text-slate-800"}`;
}

export function cardSubtitle(colorMode: ColorMode): string {
	return `text-sm mt-1 ${isDark(colorMode) ? "text-zinc-400" : "text-slate-500"}`;
}

export function fieldLabel(colorMode: ColorMode): string {
	return `text-sm font-semibold ${isDark(colorMode) ? "text-zinc-300" : "text-slate-700"}`;
}

export function sectionLabel(): string {
	return "text-xs font-semibold text-zinc-500 uppercase tracking-wider";
}

export function advancedPanel(colorMode: ColorMode): string {
	const dark = isDark(colorMode);
	return `flex flex-col gap-3 border rounded-xl p-4 transition-all duration-300 ${dark ? "bg-zinc-950/50 border-zinc-800/50" : "bg-slate-50 border-slate-200/50"}`;
}

export function advancedToggle(colorMode: ColorMode): string {
	const dark = isDark(colorMode);
	return `flex items-center gap-2 text-sm font-semibold transition-colors w-full text-left ${dark ? "text-zinc-300 hover:text-white" : "text-slate-700 hover:text-slate-900"}`;
}

export function advancedDivider(colorMode: ColorMode): string {
	return `flex flex-col gap-5 pt-3 border-t ${isDark(colorMode) ? "border-zinc-800/50" : "border-slate-200/50"}`;
}

export function textInput(colorMode: ColorMode, hasError = false): string {
	const dark = isDark(colorMode);
	const border = hasError ? "border-red-500/70" : dark ? "border-zinc-800" : "border-slate-200";
	return `flex-1 border rounded-lg p-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all ${border} ${
		dark
			? "bg-zinc-950 text-zinc-200 focus:border-indigo-500/50"
			: "bg-white text-slate-800 focus:border-indigo-500/50"
	}`;
}

export function monoFieldShell(colorMode: ColorMode, hasError = false): string {
	const dark = isDark(colorMode);
	const border = hasError ? "border-red-500/70" : dark ? "border-zinc-800" : "border-slate-200";
	return `grid w-full min-w-0 grid-cols-[auto_minmax(0,1fr)] overflow-x-auto overflow-y-hidden rounded-xl border font-mono text-sm ${border} ${dark ? "bg-zinc-950/80" : "bg-slate-50"}`;
}

export function monoGutter(colorMode: ColorMode): string {
	return `sticky left-0 z-10 select-none overflow-hidden self-stretch border-r px-3 py-3 text-right text-xs leading-5 ${isDark(colorMode) ? "border-zinc-800 bg-zinc-950/80 text-zinc-600" : "border-slate-200 bg-slate-50 text-slate-400"}`;
}

export function monoTextarea(colorMode: ColorMode): string {
	return `block min-h-[10rem] resize-none overflow-hidden border-0 bg-transparent px-3 py-3 leading-5 outline-none disabled:opacity-50 whitespace-pre ${isDark(colorMode) ? "text-zinc-200" : "text-slate-800"}`;
}

export function selectField(colorMode: ColorMode, hasError = false): string {
	const dark = isDark(colorMode);
	const border = hasError ? "border-red-500/70 focus:border-red-500" : dark ? "border-zinc-800 focus:border-indigo-500/50" : "border-slate-200 focus:border-indigo-500/50";
	return `w-full border rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/20 transition-all appearance-none disabled:opacity-50 ${
		dark ? `bg-zinc-950 text-zinc-200 ${border}` : `bg-white text-slate-800 ${border}`
	}`;
}

export function secondaryButton(colorMode: ColorMode): string {
	const dark = isDark(colorMode);
	return `rounded-md border px-2.5 py-1 text-xs font-semibold transition-all hover:scale-[1.02] active:scale-[0.98] disabled:opacity-40 disabled:scale-100 ${
		dark
			? "border-zinc-800 bg-zinc-900 text-zinc-300 hover:border-zinc-600 hover:text-zinc-100"
			: "border-slate-200 bg-slate-100 text-slate-700 hover:border-slate-300 hover:text-slate-900"
	}`;
}

export function outlineButton(colorMode: ColorMode): string {
	const dark = isDark(colorMode);
	return `px-3.5 py-2.5 rounded-lg border text-xs font-semibold transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 ${
		dark
			? "border-zinc-800 hover:border-zinc-700 bg-zinc-900 text-zinc-300"
			: "border-slate-200 hover:border-slate-300 bg-slate-100 text-slate-700"
	}`;
}

export function actionButton(colorMode: ColorMode): string {
	const dark = isDark(colorMode);
	return `flex-1 min-w-[120px] flex items-center justify-center gap-2 px-4 py-3 active:scale-[0.98] rounded-xl font-bold transition-all disabled:opacity-50 disabled:scale-100 ${
		dark ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-200" : "bg-slate-200 hover:bg-slate-300 text-slate-700"
	}`;
}

export function emptyState(colorMode: ColorMode): string {
	const dark = isDark(colorMode);
	return `py-12 flex items-center justify-center text-sm border border-dashed rounded-xl ${dark ? "text-zinc-500 border-zinc-800" : "text-slate-400 border-slate-200"}`;
}

export function tableHead(colorMode: ColorMode): string {
	const dark = isDark(colorMode);
	return `border-b text-xs font-bold uppercase tracking-wider ${dark ? "text-zinc-500 border-zinc-800/50" : "text-slate-400 border-slate-200/50"}`;
}

export function tableBodyDivide(colorMode: ColorMode): string {
	return `divide-y ${isDark(colorMode) ? "divide-zinc-800/40" : "divide-slate-200/40"}`;
}

export function mutedText(colorMode: ColorMode): string {
	return isDark(colorMode) ? "text-zinc-500" : "text-slate-400";
}

export function neutralBadge(colorMode: ColorMode): string {
	const dark = isDark(colorMode);
	return dark ? "bg-zinc-800/80 text-zinc-400 border-zinc-700/50" : "bg-slate-100 text-slate-500 border-slate-200";
}

export function verticalRule(colorMode: ColorMode): string {
	return `w-px mx-2 ${isDark(colorMode) ? "bg-zinc-800" : "bg-slate-200"}`;
}

export function checkboxLabel(colorMode: ColorMode): string {
	return `text-sm font-medium group-hover:text-indigo-400 transition-colors ${isDark(colorMode) ? "text-zinc-300" : "text-slate-700"}`;
}

export function tagListShell(colorMode: ColorMode): string {
	const dark = isDark(colorMode);
	return `flex flex-wrap gap-2 p-2.5 border rounded-lg ${dark ? "bg-zinc-950 border-zinc-800" : "bg-slate-50 border-slate-200"}`;
}

export function accentLink(): string {
	return "text-xs font-semibold text-indigo-500 hover:text-indigo-600 transition-colors";
}
