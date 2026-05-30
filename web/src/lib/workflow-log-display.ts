import type { WorkflowLogEntry } from "./state";
import type { ResponseOriginStage } from "./state";

export type WorkflowLogLocale = "zh" | "en";

const LEVEL_LABELS: Record<WorkflowLogLocale, Record<WorkflowLogEntry["level"], string>> = {
	zh: {
		info: "提示",
		warning: "警告",
		success: "成功",
		error: "失败",
	},
	en: {
		info: "Info",
		warning: "Warning",
		success: "Success",
		error: "Error",
	},
};

const STAGE_LABELS: Record<WorkflowLogLocale, Record<Exclude<ResponseOriginStage, never>, string>> = {
	zh: {
		stage1: "阶段 1",
		stage2: "阶段 2",
		stage3: "阶段 3",
	},
	en: {
		stage1: "Stage 1",
		stage2: "Stage 2",
		stage3: "Stage 3",
	},
};

/** b1 等方案使用的短标签 */
const STAGE_SHORT_LABELS: Record<WorkflowLogLocale, Record<Exclude<ResponseOriginStage, never>, string>> = {
	zh: {
		stage1: "输入",
		stage2: "配置",
		stage3: "输出",
	},
	en: {
		stage1: "Stage 1",
		stage2: "Stage 2",
		stage3: "Stage 3",
	},
};

export function getWorkflowLogLevelLabel(level: WorkflowLogEntry["level"], locale: WorkflowLogLocale = "zh") {
	return LEVEL_LABELS[locale][level] ?? level;
}

export function getWorkflowStageLabel(stage: ResponseOriginStage | null, locale: WorkflowLogLocale = "zh", style: "full" | "short" = "full") {
	if (stage === null) {
		return null;
	}
	const table = style === "short" ? STAGE_SHORT_LABELS : STAGE_LABELS;
	return table[locale][stage] ?? stage;
}

export function formatWorkflowLogTime(createdAt: string, locale: WorkflowLogLocale = "zh") {
	return new Intl.DateTimeFormat(locale === "zh" ? "zh-CN" : "en-US", {
		hour: "2-digit",
		minute: "2-digit",
		second: "2-digit",
		hour12: false,
	}).format(new Date(createdAt));
}

const SOURCE_LABELS: Record<WorkflowLogLocale, Record<"backend" | "frontend", string>> = {
	zh: {
		backend: "后端",
		frontend: "前端",
	},
	en: {
		backend: "Backend",
		frontend: "Frontend",
	},
};

export function getWorkflowSourceLabel(source: "backend" | "frontend", locale: WorkflowLogLocale = "zh") {
	return SOURCE_LABELS[locale][source] ?? source;
}
