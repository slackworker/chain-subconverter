package api

import (
	"context"
	"errors"
	"reflect"
	"testing"

	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

func TestBuildUnavailableBlockingError(t *testing.T) {
	tests := []struct {
		name string
		err  error
		want service.BlockingError
	}{
		{
			name: "structured transit timeout",
			err: subconverter.NewUnavailableError(
				"transit request",
				context.DeadlineExceeded,
				subconverter.WithUnavailableUserInputSource(subconverter.UnavailableInputSourceTransit),
			),
			want: service.BlockingError{
				Code:      subconverter.CodeUnavailable,
				Message:   "1、转换服务未就绪或无法连接。请确认 subconverter 已部署、已启动，且地址和端口配置正确。 2、若转换服务状态正常，请检查「中转信息」中的订阅链接或节点内容是否可访问且有效。",
				Scope:     "global",
				Retryable: boolPtr(true),
				Context: map[string]any{"diagnostic": map[string]any{
					"problemClass":    unavailableProblemSourceFetchFailed,
					"userInputSource": unavailableInputSourceTransit,
				}},
			},
		},
		{
			name: "structured managed template validation",
			err: subconverter.NewUnavailableError(
				"template validation",
				errors.New("missing recognized region proxy-group"),
				subconverter.WithUnavailableClassification(subconverter.UnavailableProblemConversionResultInvalid, subconverter.UnavailableInputSourceManagedTemplate),
			),
			want: service.BlockingError{
				Code:      subconverter.CodeUnavailable,
				Message:   "转换服务已响应，但返回结果不完整或未成功应用所需规则。请检查模板设置后重试。",
				Scope:     "global",
				Retryable: boolPtr(true),
				Context: map[string]any{"diagnostic": map[string]any{
					"problemClass":    unavailableProblemConversionResultInvalid,
					"userInputSource": unavailableInputSourceManagedTemplate,
				}},
			},
		},
		{
			name: "legacy op fallback still works",
			err:  subconverter.NewUnavailableError("landing-discovery pass", errors.New("dial tcp 127.0.0.1:25500: connect: connection refused")),
			want: service.BlockingError{
				Code:      subconverter.CodeUnavailable,
				Message:   "转换服务未就绪或无法连接。请确认 subconverter 已部署、已启动，且地址和端口配置正确。",
				Scope:     "global",
				Retryable: boolPtr(true),
				Context: map[string]any{"diagnostic": map[string]any{
					"problemClass":    unavailableProblemServiceUnreachable,
					"userInputSource": unavailableInputSourceLanding,
				}},
			},
		},
		{
			name: "structured transit group validation ignores op wording",
			err: subconverter.NewUnavailableError(
				"grouped transit output mismatch",
				errors.New("missing recognized region proxy-group"),
				subconverter.WithUnavailableClassification(subconverter.UnavailableProblemConversionResultInvalid, subconverter.UnavailableInputSourceTransit),
			),
			want: service.BlockingError{
				Code:      subconverter.CodeUnavailable,
				Message:   "转换服务已响应，但返回结果不完整或未成功应用所需规则。请检查阶段 1 输入和模板设置后重试。",
				Scope:     "global",
				Retryable: boolPtr(true),
				Context: map[string]any{"diagnostic": map[string]any{
					"problemClass":    unavailableProblemConversionResultInvalid,
					"userInputSource": unavailableInputSourceTransit,
				}},
			},
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			got := buildUnavailableBlockingError(tt.err)
			if !reflect.DeepEqual(got, tt.want) {
				t.Fatalf("buildUnavailableBlockingError() = %#v, want %#v", got, tt.want)
			}
		})
	}
}