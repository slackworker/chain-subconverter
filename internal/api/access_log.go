package api

import (
	"fmt"
	"log"
	"net/http"
	"strings"
	"time"
)

type accessLogOriginProvider interface {
	requestOriginFor(request *http.Request) requestOrigin
}

type accessLogResponseWriter struct {
	http.ResponseWriter
	statusCode int
	wrote      bool
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
		duration := time.Since(start)
		clientIP := accessLogClientIP(next, request)

		path := redactRequestPath(request.URL.Path, request.URL.RawQuery)
		message := fmt.Sprintf(
			"access method=%s path=%s status=%d duration_ms=%d client_ip=%s",
			request.Method,
			path,
			statusCode,
			duration.Milliseconds(),
			clientIP,
		)

		switch {
		case statusCode == http.StatusTooManyRequests:
			log.Printf("WARN %s", message)
		case statusCode >= 500:
			log.Printf("ERROR %s", message)
		case statusCode >= 400:
			log.Printf("WARN %s", message)
		default:
			log.Printf("INFO %s", message)
		}
	})
}

func accessLogClientIP(next http.Handler, request *http.Request) string {
	if provider, ok := next.(accessLogOriginProvider); ok {
		return provider.requestOriginFor(request).clientIP
	}

	return clientIPAddress(request.RemoteAddr)
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
