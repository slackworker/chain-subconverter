import { describe, expect, it } from "vitest";

import {
	appendWorkflowLogEntries,
	backendMessagesToWorkflowLog,
	frontendWorkflowEvent,
	frontendWorkflowFailureEvent,
	resetWorkflowLogSequenceForTests,
	workflowActionSeparator,
} from "./workflow-log";

describe("workflow-log", () => {
	it("appends action separators", () => {
		resetWorkflowLogSequenceForTests();
		const entry = workflowActionSeparator("ACTION_STAGE1_CONVERT");
		expect(entry.code).toBe("ACTION_STAGE1_CONVERT");
		expect(entry.kind).toBe("separator");
	});

	it("formats failure events with detail", () => {
		resetWorkflowLogSequenceForTests();
		const entry = frontendWorkflowFailureEvent("GENERATE_FAILED", "节点未配置完成。");
		expect(entry.message).toBe("生成链接未成功：节点未配置完成。");
	});

	it("filters routine lifecycle noise", () => {
		resetWorkflowLogSequenceForTests();
		const log = appendWorkflowLogEntries([], [
			workflowActionSeparator("ACTION_STAGE1_CONVERT"),
			frontendWorkflowEvent("STAGE1_CONVERT_FAILED"),
		]);
		expect(log.map((entry) => entry.code)).toEqual([
			"ACTION_STAGE1_CONVERT",
			"STAGE1_CONVERT_FAILED",
		]);
	});

	it("deduplicates restore conflict frontend echo", () => {
		resetWorkflowLogSequenceForTests();
		const log = appendWorkflowLogEntries(
			backendMessagesToWorkflowLog([
				{ level: "warning", code: "RESTORE_CONFLICT", message: "恢复的配置引用了当前模板中不存在的目标策略组。" },
			], "stage3"),
			[frontendWorkflowEvent("RESTORE_CONFLICTED")],
		);
		expect(log.map((entry) => entry.code)).toEqual(["RESTORE_CONFLICT"]);
	});

	it("caps retained workflow history", () => {
		resetWorkflowLogSequenceForTests();
		let log: ReturnType<typeof backendMessagesToWorkflowLog> = [];
		for (let index = 0; index < 205; index += 1) {
			log = appendWorkflowLogEntries(log, backendMessagesToWorkflowLog([
				{ level: "info", code: "RESTORE_METADATA_READY", message: `条目 ${index}` },
			], "stage3"));
		}
		expect(log).toHaveLength(200);
	});
});
