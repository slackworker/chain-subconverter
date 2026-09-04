package api

import (
	"net/http"

	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

const (
	unavailableProblemServiceUnreachable      = string(subconverter.UnavailableProblemServiceUnreachable)
	unavailableProblemSourceFetchFailed       = string(subconverter.UnavailableProblemSourceFetchFailed)
	unavailableProblemConversionResultInvalid = string(subconverter.UnavailableProblemConversionResultInvalid)

	unavailableInputSourceLanding         = string(subconverter.UnavailableInputSourceLanding)
	unavailableInputSourceTransit         = string(subconverter.UnavailableInputSourceTransit)
	unavailableInputSourceManagedTemplate = string(subconverter.UnavailableInputSourceManagedTemplate)
)

type unavailableClassification struct {
	problemClass    string
	userInputSource string
	timedOut        bool
}

func writeUnavailableBlockingError(writer http.ResponseWriter, request *http.Request, err error) {
	blockingError := buildUnavailableBlockingError(err)
	writeBlockingError(
		writer,
		request,
		http.StatusServiceUnavailable,
		blockingError.Code,
		blockingError.Message,
		blockingError.Scope,
		blockingError.Context,
		blockingError.Retryable,
	)
}

func buildUnavailableBlockingError(err error) service.BlockingError {
	classification := classifyUnavailableError(err)
	retryable := true
	return service.BlockingError{
		Code:      subconverter.CodeUnavailable,
		Message:   buildUnavailableMessage(classification),
		Scope:     "global",
		Retryable: &retryable,
		Context:   buildUnavailableContext(classification),
	}
}

func classifyUnavailableError(err error) unavailableClassification {
	classified := subconverter.ClassifyUnavailable(err)
	return unavailableClassification{
		problemClass:    string(classified.ProblemClass),
		userInputSource: string(classified.UserInputSource),
		timedOut:        classified.TimedOut,
	}
}

func buildUnavailableContext(classification unavailableClassification) map[string]any {
	diagnostic := map[string]any{}
	if classification.problemClass != "" {
		diagnostic["problemClass"] = classification.problemClass
	}
	if classification.userInputSource != "" {
		diagnostic["userInputSource"] = classification.userInputSource
	}
	if len(diagnostic) == 0 {
		return nil
	}
	return map[string]any{"diagnostic": diagnostic}
}

func buildUnavailableMessage(classification unavailableClassification) string {
	switch classification.problemClass {
	case unavailableProblemSourceFetchFailed:
		return buildSourceFetchUnavailableMessage(classification)
	case unavailableProblemConversionResultInvalid:
		if classification.userInputSource == unavailableInputSourceManagedTemplate {
			return "转换服务已响应，但返回结果不完整或未成功应用所需规则。请检查模板设置后重试。"
		}
		return "转换服务已响应，但返回结果不完整或未成功应用所需规则。请检查阶段 1 输入和模板设置后重试。"
	default:
		return "转换服务未就绪或无法连接。请确认 subconverter 已部署、已启动，且地址和端口配置正确。"
	}
}

func buildSourceFetchUnavailableMessage(classification unavailableClassification) string {
	sourceLabel := unavailableSourceLabel(classification.userInputSource)
	if classification.timedOut {
		return "1、转换服务未就绪或无法连接。请确认 subconverter 已部署、已启动，且地址和端口配置正确。 2、若转换服务状态正常，请检查" + sourceLabel + "中的订阅链接或节点内容是否可访问且有效。"
	}
	return "转换服务已响应，但无法处理" + sourceLabel + "中的订阅链接或节点内容。请检查输入内容是否可访问且有效。"
}

func unavailableSourceLabel(userInputSource string) string {
	switch userInputSource {
	case unavailableInputSourceLanding:
		return "「落地信息」"
	case unavailableInputSourceTransit:
		return "「中转信息」"
	case unavailableInputSourceManagedTemplate:
		return "模板设置"
	default:
		return "阶段 1 输入"
	}
}
