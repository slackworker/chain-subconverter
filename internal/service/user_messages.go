package service

import (
	"fmt"
	"strings"
)

func buildStage1ConvertMessages(catalog Stage2Catalog, existing []Message) []Message {
	messages := append([]Message{}, existing...)

	landingCount := 0
	chainAutoCount := 0
	for _, server := range catalog.Servers {
		for _, source := range server.Sources {
			landingCount++
			if source.DefaultMode != "chain" || source.DefaultTargetName == nil {
				continue
			}
			chainAutoCount++
			targetName := strings.TrimSpace(*source.DefaultTargetName)
			if targetName == "" {
				continue
			}
			messages = append(messages, Message{
				Level:   "info",
				Code:    "AUTO_CHAIN_TARGET_SELECTED",
				Message: fmt.Sprintf("已为「%s」自动填入 %s", source.DefaultProxyName, targetName),
			})
		}
	}
	relayCount := len(catalog.ForwardRelays)

	summary := fmt.Sprintf("已识别 %d 个落地节点", landingCount)
	if relayCount > 0 {
		summary += fmt.Sprintf("、%d 个中继", relayCount)
	}
	summary += fmt.Sprintf("，Stage 2 已初始化 %d 个默认实例", landingCount)
	if chainAutoCount > 0 {
		summary += fmt.Sprintf("，其中 %d 个已自动填入链式目标", chainAutoCount)
	}
	summary += "。"

	result := append([]Message{{
		Level:   "info",
		Code:    "STAGE1_CONVERT_SUMMARY",
		Message: summary,
	}}, messages...)

	chainReviewCount := 0
	for _, server := range catalog.Servers {
		for _, source := range server.Sources {
			if _, ok := source.ModeWarnings["chain"]; ok {
				chainReviewCount++
			}
		}
	}
	if chainReviewCount > 0 {
		result = append(result, Message{
			Level:   "warning",
			Code:    "CHAIN_TARGET_REVIEW",
			Message: fmt.Sprintf("有 %d 个落地节点的链式代理配置需要人工确认", chainReviewCount),
		})
	}

	return result
}

func restoreConflictMessage(err error) string {
	responseErr, ok := AsResponseError(err)
	if !ok {
		return "恢复的配置与当前模板或节点环境不一致，请重新执行转换并自动填充。"
	}

	switch responseErr.BlockingError().Code {
	case "TARGET_NOT_FOUND":
		return "恢复的配置引用了当前模板中不存在的目标策略组，页面已进入只读冲突态。请重新执行转换并自动填充。"
	case "LANDING_NODE_NOT_FOUND":
		return "恢复的配置引用了当前环境中已不存在的落地节点，页面已进入只读冲突态。请重新执行转换并自动填充。"
	case "SERVER_AGGREGATION_MEMBER_NOT_FOUND":
		return "恢复的配置引用了当前环境中不存在的聚合成员行，页面已进入只读冲突态。请重新执行转换并自动填充。"
	case "SERVER_AGGREGATION_GROUP_TOO_SMALL":
		return "恢复的配置引用的聚合组已不满足最小成员数量，页面已进入只读冲突态。请重新执行转换并自动填充。"
	case "SERVER_AGGREGATION_SERVER_MISMATCH":
		return "恢复的配置存在跨 server 聚合成员不一致，页面已进入只读冲突态。请重新执行转换并自动填充。"
	case "EMPTY_CHAIN_TARGET":
		return "恢复的配置引用了当前不可用的链式目标，页面已进入只读冲突态。请重新执行转换并自动填充。"
	case "STAGE2_ROWSET_MISMATCH":
		return "恢复的配置与当前可生成的 Stage 2 行集合不一致，页面已进入只读冲突态。请重新执行转换并自动填充。"
	default:
		return "恢复的配置已无法直接复用，页面已进入只读冲突态。请重新执行转换并自动填充。"
	}
}

func legacyPayloadVersionRestoreMessage(payloadVersion int) string {
	return fmt.Sprintf(
		"链接载荷版本 v%d 与当前 v%d 不兼容：已还原阶段 1 输入，阶段 2 及之后配置无法恢复。请重新执行转换并自动填充。",
		payloadVersion,
		longURLSchemaVersion,
	)
}
