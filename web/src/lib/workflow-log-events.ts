import type { ResponseOriginStage } from "./state";
import type { WorkflowLogLevel } from "./state";

export interface WorkflowEventDefinition {
	level: WorkflowLogLevel;
	message: string;
	originStage: ResponseOriginStage;
}

/** 前端本地 workflow 事件目录（用户可读；不含调试噪声）。 */
export const WORKFLOW_EVENTS = {
	ACTION_STAGE1_CONVERT: {
		level: "info",
		message: "── 转换并自动填充 ──",
		originStage: "stage1",
	},
	STAGE1_CONVERT_FAILED: {
		level: "error",
		message: "转换并自动填充未成功",
		originStage: "stage1",
	},
	ACTION_RESTORE: {
		level: "info",
		message: "── 反向解析并恢复 ──",
		originStage: "stage3",
	},
	RESTORE_CONFLICTED: {
		level: "warning",
		message: "恢复结果进入只读冲突态，请重新执行转换并自动填充。",
		originStage: "stage3",
	},
	RESTORE_REINIT_FAILED: {
		level: "error",
		message: "恢复后的转换并自动填充未成功",
		originStage: "stage3",
	},
	RESTORE_FAILED: {
		level: "error",
		message: "反向解析未成功",
		originStage: "stage3",
	},
	ACTION_GENERATE: {
		level: "info",
		message: "── 生成链接 ──",
		originStage: "stage2",
	},
	GENERATE_FAILED: {
		level: "error",
		message: "生成链接未成功",
		originStage: "stage2",
	},
	ACTION_SHORT_URL: {
		level: "info",
		message: "── 创建短链接 ──",
		originStage: "stage3",
	},
	SHORT_URL_REQUIRED: {
		level: "warning",
		message: "当前状态的长链接超过公开长度上限，不能切回长链接展示。",
		originStage: "stage3",
	},
	SHORT_URL_FAILED: {
		level: "error",
		message: "创建短链接未成功",
		originStage: "stage3",
	},
	SHORT_URL_REQUIRED_FAILED: {
		level: "error",
		message: "长链接超过公开长度上限，自动短链接未成功",
		originStage: "stage3",
	},
	OPEN_PREVIEW_INVALID_URL: {
		level: "warning",
		message: "请输入完整的 HTTP(S) 订阅链接后再打开或下载。",
		originStage: "stage3",
	},
	COPY_LINK_FAILED: {
		level: "error",
		message: "复制当前链接失败。",
		originStage: "stage3",
	},
	DOWNLOAD_INVALID_URL: {
		level: "warning",
		message: "请输入完整的 HTTP(S) 订阅链接后再打开或下载。",
		originStage: "stage3",
	},
} as const satisfies Record<string, WorkflowEventDefinition>;

export type WorkflowEventCode = keyof typeof WORKFLOW_EVENTS;
