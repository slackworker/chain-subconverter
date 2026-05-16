package api

import (
	"context"
	"errors"
	"net"
	"net/http"
	"strings"

	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

const (
	unavailableProblemServiceUnreachable      = "service_unreachable"
	unavailableProblemSourceFetchFailed       = "source_fetch_failed"
	unavailableProblemConversionResultInvalid = "conversion_result_invalid"

	unavailableInputSourceLanding         = "landing"
	unavailableInputSourceTransit         = "transit"
	unavailableInputSourceStage1Input     = "stage1_input"
	unavailableInputSourceManagedTemplate = "managed_template"
)

type unavailableClassification struct {
	problemClass    string
	userInputSource string
	timedOut        bool
}

func writeUnavailableBlockingError(writer http.ResponseWriter, err error) {
	blockingError := buildUnavailableBlockingError(err)
	writeBlockingError(
		writer,
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
	classification := unavailableClassification{problemClass: unavailableProblemServiceUnreachable}

	var unavailableErr *subconverter.Error
	if !errors.As(err, &unavailableErr) {
		return classification
	}

	op := strings.ToLower(strings.TrimSpace(unavailableErr.Op))
	cause := unavailableErr.Cause

	switch {
	case op == "acquire subconverter slot":
		classification.problemClass = unavailableProblemServiceUnreachable
	case strings.Contains(op, "landing-discovery pass"):
		classification.userInputSource = unavailableInputSourceLanding
		classifyPassFailure(&classification, cause)
	case strings.Contains(op, "transit-discovery pass"):
		classification.userInputSource = unavailableInputSourceTransit
		classifyPassFailure(&classification, cause)
	case strings.Contains(op, "full-base pass"):
		classification.userInputSource = unavailableInputSourceStage1Input
		classifyPassFailure(&classification, cause)
	case strings.Contains(op, "parse landing-discovery result") || strings.Contains(op, "validate landing-discovery names"):
		classification.problemClass = unavailableProblemConversionResultInvalid
		classification.userInputSource = unavailableInputSourceLanding
	case strings.Contains(op, "parse transit-discovery result") || strings.Contains(op, "validate transit-discovery names"):
		classification.problemClass = unavailableProblemConversionResultInvalid
		classification.userInputSource = unavailableInputSourceTransit
	case strings.Contains(op, "parse full-base") || strings.Contains(op, "validate full-base region proxy-groups"):
		classification.problemClass = unavailableProblemConversionResultInvalid
		classification.userInputSource = unavailableInputSourceManagedTemplate
	default:
		classifyPassFailure(&classification, cause)
	}

	return classification
}

func classifyPassFailure(classification *unavailableClassification, cause error) {
	if isUnavailableTimeout(cause) {
		classification.problemClass = unavailableProblemSourceFetchFailed
		classification.timedOut = true
		return
	}

	trimmedCause := strings.ToLower(strings.TrimSpace(errorMessage(cause)))
	switch {
	case strings.HasPrefix(trimmedCause, "unexpected http status "):
		classification.problemClass = unavailableProblemSourceFetchFailed
	case trimmedCause == "empty response body":
		classification.problemClass = unavailableProblemConversionResultInvalid
	default:
		classification.problemClass = unavailableProblemServiceUnreachable
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

func isUnavailableTimeout(err error) bool {
	if errors.Is(err, context.DeadlineExceeded) {
		return true
	}
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

func errorMessage(err error) string {
	if err == nil {
		return ""
	}
	return err.Error()
}
