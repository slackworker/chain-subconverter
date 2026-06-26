package service

import "strings"

func generateWorkflowMessages() []Message {
	return []Message{{
		Level:   "info",
		Code:    "GENERATE_METADATA_READY",
		Message: "已生成完整长链接。",
	}}
}

func shortLinkWorkflowMessages() []Message {
	return []Message{{
		Level:   "info",
		Code:    "SHORT_LINK_CREATED",
		Message: "已准备好短链接。",
	}}
}

func restoreWorkflowMessages(restoreStatus string) []Message {
	if restoreStatus != "replayable" {
		return nil
	}
	return []Message{{
		Level:   "info",
		Code:    "RESTORE_METADATA_READY",
		Message: "已读取恢复快照。",
	}}
}

func stage2ResetWorkflowMessage(scope string) Message {
	if strings.TrimSpace(scope) == "row" {
		return Message{
			Level:   "info",
			Code:    "STAGE2_ROW_RESET",
			Message: "已恢复该行为初始配置。",
		}
	}
	return Message{
		Level:   "info",
		Code:    "STAGE2_RESET",
		Message: "已恢复 Stage 2 初始配置。",
	}
}
