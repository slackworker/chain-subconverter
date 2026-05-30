package api

import (
	"net/http"
	"strings"
	"time"

	"github.com/slackworker/chain-subconverter/internal/applog"
	"github.com/slackworker/chain-subconverter/internal/service"
)

type accessLogOriginProvider interface {
	requestOriginFor(request *http.Request) requestOrigin
}

type accessLogResponseWriter struct {
	http.ResponseWriter
	statusCode   int
	wrote        bool
	errorCode    string
	warningCodes []string
}

func (writer *accessLogResponseWriter) WriteHeader(statusCode int) {
	if !writer.wrote {
		writer.statusCode = statusCode
		writer.wrote = true
	}
	writer.ResponseWriter.WriteHeader(statusCode)
}

func (writer *accessLogResponseWriter) Write(data []byte) (int, error) {
	if !writer.wrote {
		writer.WriteHeader(http.StatusOK)
	}
	return writer.ResponseWriter.Write(data)
}

// WithAccessLog logs request metadata to stderr without sensitive query/body values.
func WithAccessLog(next http.Handler) http.Handler {
	if next == nil {
		return http.NotFoundHandler()
	}

	return http.HandlerFunc(func(writer http.ResponseWriter, request *http.Request) {
		start := time.Now()
		wrapped := &accessLogResponseWriter{ResponseWriter: writer, statusCode: http.StatusOK}
		next.ServeHTTP(wrapped, request)

		statusCode := wrapped.statusCode
		requestInfo, ok := RequestContextFrom(request.Context())
		operation := operationForRequest(request.Method, request.URL.Path)
		requestID := ""
		if ok {
			requestID = requestInfo.RequestID
			if requestInfo.Operation != "" {
				operation = requestInfo.Operation
			}
			if wrapped.errorCode == "" {
				wrapped.errorCode = requestInfo.ErrorCode
			}
		}
		if !shouldLogAccessRequest(request, statusCode, operation, wrapped.warningCodes) {
			return
		}

		duration := time.Since(start)
		origin := accessLogOrigin(next, request)

		path := redactRequestPath(request.URL.Path, request.URL.RawQuery)
		applog.Access(applog.AccessMeta{
			Method:       request.Method,
			Path:         path,
			Status:       statusCode,
			Duration:     duration.Milliseconds(),
			ClientIP:     origin.clientIP,
			RequestID:    requestID,
			Operation:    operation,
			ErrorCode:    wrapped.errorCode,
			WarningCodes: wrapped.warningCodes,
			OriginScheme: origin.scheme,
			OriginHost:   origin.host,
			TrustedProxy: origin.trustedProxyUsed,
		})
	})
}

func (writer *accessLogResponseWriter) SetAccessLogErrorCode(code string) {
	if writer == nil || writer.errorCode != "" {
		return
	}
	writer.errorCode = strings.TrimSpace(code)
}

func (writer *accessLogResponseWriter) SetAccessLogMessages(messages []service.Message) {
	if writer == nil {
		return
	}

	codes := make([]string, 0, len(messages))
	seen := make(map[string]struct{}, len(messages))
	for _, message := range messages {
		if strings.TrimSpace(message.Level) != "warning" {
			continue
		}
		code := strings.TrimSpace(message.Code)
		if code == "" {
			continue
		}
		if _, ok := seen[code]; ok {
			continue
		}
		seen[code] = struct{}{}
		codes = append(codes, code)
	}
	writer.warningCodes = codes
}

func accessLogOrigin(next http.Handler, request *http.Request) requestOrigin {
	if provider, ok := next.(accessLogOriginProvider); ok {
		return provider.requestOriginFor(request)
	}

	return requestOrigin{
		clientIP: clientIPAddress(request.RemoteAddr),
		scheme:   requestScheme(request),
		host:     requestHost(request),
	}
}

func redactRequestPath(requestPath string, rawQuery string) string {
	if rawQuery == "" {
		return requestPath
	}
	if strings.Contains(rawQuery, "data=") || strings.Contains(strings.ToLower(rawQuery), "token=") {
		return requestPath + "?[redacted]"
	}
	if strings.HasPrefix(requestPath, "/sub") {
		return requestPath + "?[redacted]"
	}
	return requestPath
}

func shouldLogAccessRequest(request *http.Request, statusCode int, operation string, warningCodes []string) bool {
	if statusCode >= http.StatusBadRequest || len(warningCodes) > 0 {
		return true
	}

	switch operation {
	case "stage1_convert", "generate", "short_link_create", "resolve_url", "render_subscription", "render_short_subscription":
		return true
	default:
		return false
	}
}
