package api

import (
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"path"
	"strings"

	"github.com/slackworker/chain-subconverter/internal/applog"
	"github.com/slackworker/chain-subconverter/internal/runtimestatus"
	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

const internalErrorUserMessage = "服务内部出现问题，请稍后重试。"

const (
	jsonContentType  = "application/json; charset=utf-8"
	yamlContentType  = "text/yaml; charset=utf-8"
	noStoreHeader    = "private, no-store"
	maxJSONBodyBytes = 256 * 1024
)

type Handler struct {
	source              service.ConversionSource
	templateStore       service.TemplateContentReader
	shortLinkStore      service.ShortLinkStore
	userFacingBaseURL   string
	defaultTemplateURL  string
	maxLongURLLength    int
	inputLimits         service.InputLimits
	writeRateLimiter    *ipRateLimiter
	readRateLimiter     *ipRateLimiter
	requestOrigin       *requestOriginResolver
	runtimeStatus       *runtimestatus.Service
	managedTemplatePath string
	shortSubPath        string
	subPath             string
	mux                 *http.ServeMux
}

type defaultTemplateURLProvider interface {
	DefaultTemplateURL() string
}

type runtimeConfigResponse struct {
	DefaultTemplateURL     string `json:"defaultTemplateURL"`
	MaxPublicLongURLLength int    `json:"maxPublicLongURLLength"`
}

func NewHandler(source service.ConversionSource, templateStore service.TemplateContentReader, shortLinkStore service.ShortLinkStore, userFacingBaseURL string, subconverterFacingBaseURL string, maxLongURLLength int, inputLimits service.InputLimits, options ...HandlerOption) (*Handler, error) {
	if source == nil {
		return nil, fmt.Errorf("conversion source must not be nil")
	}
	if templateStore == nil {
		return nil, fmt.Errorf("template store must not be nil")
	}
	managedTemplatePath, err := managedTemplateRoutePath(subconverterFacingBaseURL)
	if err != nil {
		return nil, err
	}
	subPath, shortSubPath, err := subRoutePaths(userFacingBaseURL)
	if err != nil {
		return nil, err
	}
	defaultTemplateURL := ""
	if provider, ok := source.(defaultTemplateURLProvider); ok {
		defaultTemplateURL = provider.DefaultTemplateURL()
	}

	handler := &Handler{
		source:              source,
		templateStore:       templateStore,
		shortLinkStore:      shortLinkStore,
		userFacingBaseURL:   userFacingBaseURL,
		defaultTemplateURL:  defaultTemplateURL,
		maxLongURLLength:    maxLongURLLength,
		inputLimits:         inputLimits,
		managedTemplatePath: managedTemplatePath,
		shortSubPath:        shortSubPath,
		subPath:             subPath,
	}
	for _, option := range options {
		if option != nil {
			if err := option(handler); err != nil {
				return nil, err
			}
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/stage1/convert", handler.rateLimitWrite(handler.handleStage1Convert))
	mux.HandleFunc("POST /api/generate", handler.rateLimitWrite(handler.handleGenerate))
	mux.HandleFunc("POST /api/short-links", handler.rateLimitWrite(handler.handleShortLinks))
	mux.HandleFunc("POST /api/resolve-url", handler.rateLimitWrite(handler.handleResolveURL))
	mux.HandleFunc("GET /api/runtime-config", handler.handleRuntimeConfig)
	mux.HandleFunc("GET /api/runtime-status", handler.handleRuntimeStatus)
	mux.HandleFunc(managedTemplatePath, handler.handleManagedTemplate)
	mux.HandleFunc("GET "+shortSubPath, handler.rateLimitRead(handler.handleShortSubscription))
	mux.HandleFunc("GET "+subPath, handler.rateLimitRead(handler.handleSubscription))
	mux.HandleFunc("GET /healthz", handler.handleHealthz)
	handler.mux = mux

	return handler, nil
}

func (handler *Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	handler.mux.ServeHTTP(writer, request)
}

func (handler *Handler) rateLimitWrite(next http.HandlerFunc) http.HandlerFunc {
	return handler.rateLimit(next, handler.writeRateLimiter)
}

func (handler *Handler) rateLimitRead(next http.HandlerFunc) http.HandlerFunc {
	return handler.rateLimit(next, handler.readRateLimiter)
}

func (handler *Handler) rateLimit(next http.HandlerFunc, limiter *ipRateLimiter) http.HandlerFunc {
	if limiter == nil {
		return next
	}

	return func(writer http.ResponseWriter, request *http.Request) {
		if limiter.allow(handler.requestOriginFor(request).clientIP) {
			next(writer, request)
			return
		}

		retryable := true
		writeBlockingError(writer, request, http.StatusTooManyRequests, "RATE_LIMITED", "rate limit exceeded", "global", nil, &retryable)
	}
}

func (handler *Handler) handleStage1Convert(writer http.ResponseWriter, request *http.Request) {
	var payload service.Stage1ConvertRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeBlockingError(writer, request, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), "global", nil, nil)
		return
	}

	response, err := service.BuildStage1ConvertResponseFromSource(request.Context(), handler.source, payload.Stage1Input, handler.inputLimits)
	if err != nil {
		writeOperationError(writer, request, "POST /api/stage1/convert", err)
		return
	}
	writeJSON(writer, http.StatusOK, response)
}

func (handler *Handler) handleRuntimeConfig(writer http.ResponseWriter, request *http.Request) {
	writeJSON(writer, http.StatusOK, runtimeConfigResponse{
		DefaultTemplateURL:     handler.defaultTemplateURL,
		MaxPublicLongURLLength: handler.maxLongURLLength,
	})
}


func (handler *Handler) handleGenerate(writer http.ResponseWriter, request *http.Request) {
	var payload service.GenerateRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeBlockingError(writer, request, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), "global", nil, nil)
		return
	}

	response, err := service.BuildGenerateResponseFromSource(
		request.Context(),
		handler.effectiveBaseURL(request),
		handler.source,
		payload,
		service.NoLongURLLengthLimit,
		handler.inputLimits,
	)
	if err != nil {
		writeOperationError(writer, request, "POST /api/generate", err)
		return
	}
	writeJSON(writer, http.StatusOK, response)
}

func (handler *Handler) handleShortLinks(writer http.ResponseWriter, request *http.Request) {
	var payload service.ShortLinkRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeStage3DecodeError(writer, request, err)
		return
	}

	response, err := service.BuildShortLinkResponse(
		request.Context(),
		handler.effectiveBaseURL(request),
		handler.shortLinkStore,
		payload.LongURL,
		service.NoLongURLLengthLimit,
		handler.inputLimits,
	)
	if err != nil {
		writeOperationError(writer, request, "POST /api/short-links", err)
		return
	}
	writeJSON(writer, http.StatusOK, response)
}

func (handler *Handler) handleResolveURL(writer http.ResponseWriter, request *http.Request) {
	var payload service.ResolveURLRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeStage3DecodeError(writer, request, err)
		return
	}

	response, err := service.ResolveURLFromSource(
		request.Context(),
		handler.effectiveBaseURL(request),
		handler.source,
		handler.shortLinkStore,
		payload.URL,
		service.NoLongURLLengthLimit,
		handler.inputLimits,
	)
	if err != nil {
		writeOperationError(writer, request, "POST /api/resolve-url", err)
		return
	}
	writeJSON(writer, http.StatusOK, response)
}

func (handler *Handler) handleManagedTemplate(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		http.Error(writer, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	id := strings.TrimPrefix(request.URL.Path, handler.managedTemplatePath)
	id = strings.TrimSuffix(id, ".ini")
	id = strings.TrimSpace(id)
	if id == "" || strings.Contains(id, "/") {
		http.NotFound(writer, request)
		return
	}

	content, ok := handler.templateStore.Load(id)
	if !ok {
		http.NotFound(writer, request)
		return
	}

	writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
	writer.Header().Set("Cache-Control", noStoreHeader)
	writer.WriteHeader(http.StatusOK)
	if request.Method == http.MethodHead {
		return
	}
	_, _ = writer.Write([]byte(content))
}

func subRoutePaths(userFacingBaseURL string) (string, string, error) {
	trimmed := strings.TrimSpace(userFacingBaseURL)
	if trimmed == "" {
		return "/sub", "/sub/", nil
	}
	parsedURL, err := url.Parse(trimmed)
	if err != nil {
		return "", "", fmt.Errorf("parse user-facing base URL: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return "", "", fmt.Errorf("user-facing base URL must include scheme and host")
	}

	basePath := strings.TrimRight(parsedURL.EscapedPath(), "/")
	if basePath == "" {
		return "/sub", "/sub/", nil
	}
	cleanBasePath := path.Clean(basePath)
	return cleanBasePath + "/sub", cleanBasePath + "/sub/", nil
}

// effectiveBaseURL returns the user-facing base URL to use for link generation.
// If an explicit USER_FACING_BASE_URL is configured it is used as-is (highest priority).
// Otherwise the URL is inferred from the incoming request: scheme from TLS state,
// host from the Host header. This covers the common single-entry-point deployment
// where frontend and backend are served from the same origin.
func (handler *Handler) effectiveBaseURL(request *http.Request) string {
	if handler.userFacingBaseURL != "" {
		return handler.userFacingBaseURL
	}
	origin := handler.requestOriginFor(request)
	scheme := origin.scheme
	host := origin.host
	return scheme + "://" + host
}

func (handler *Handler) requestOriginFor(request *http.Request) requestOrigin {
	if handler.requestOrigin == nil {
		return requestOrigin{
			clientIP: clientIPAddress(request.RemoteAddr),
			scheme:   requestScheme(request),
			host:     requestHost(request),
		}
	}
	return handler.requestOrigin.resolve(request)
}

func managedTemplateRoutePath(subconverterFacingBaseURL string) (string, error) {
	parsedURL, err := url.Parse(strings.TrimSpace(subconverterFacingBaseURL))
	if err != nil {
		return "", fmt.Errorf("parse subconverter-facing base URL: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return "", fmt.Errorf("subconverter-facing base URL must include scheme and host")
	}
	basePath := strings.TrimRight(parsedURL.EscapedPath(), "/")
	if basePath == "" {
		return "/internal/templates/", nil
	}
	return path.Clean(basePath) + "/internal/templates/", nil
}

func (handler *Handler) handleSubscription(writer http.ResponseWriter, request *http.Request) {
	dataValue := strings.TrimSpace(request.URL.Query().Get("data"))
	if dataValue == "" {
		writeBlockingError(writer, request, http.StatusBadRequest, "INVALID_REQUEST", "missing data query parameter", "global", nil, nil)
		return
	}
	handler.renderSubscription(writer, request, request.URL.String(), "subscription.yaml")
}

func (handler *Handler) handleShortSubscription(writer http.ResponseWriter, request *http.Request) {
	if handler.shortLinkStore == nil {
		retryable := true
		writeBlockingError(writer, request, http.StatusServiceUnavailable, "SHORT_LINK_STORE_UNAVAILABLE", "short link store is unavailable", "global", nil, &retryable)
		return
	}

	requestPath := request.URL.Path
	if !strings.HasPrefix(requestPath, handler.shortSubPath) {
		writeBlockingError(writer, request, http.StatusBadRequest, "INVALID_REQUEST", "short URL path is invalid", "global", nil, nil)
		return
	}

	shortID := strings.TrimSpace(strings.TrimPrefix(requestPath, handler.shortSubPath))
	if shortID == "" || strings.Contains(shortID, "/") {
		writeBlockingError(writer, request, http.StatusBadRequest, "INVALID_REQUEST", "short URL path is invalid", "global", nil, nil)
		return
	}

	longURL, err := handler.shortLinkStore.ResolveShortID(request.Context(), shortID)
	if err != nil {
		if errors.Is(err, service.ErrShortURLNotFound) {
			writeBlockingError(writer, request, http.StatusUnprocessableEntity, "SHORT_URL_NOT_FOUND", "short URL not found", "global", nil, nil)
			return
		}
		retryable := true
		writeBlockingError(writer, request, http.StatusServiceUnavailable, "SHORT_LINK_STORE_UNAVAILABLE", "short link store is unavailable", "global", nil, &retryable)
		return
	}

	handler.renderSubscription(writer, request, longURL, shortID+".yaml")
}

func (handler *Handler) renderSubscription(writer http.ResponseWriter, request *http.Request, longURL string, filename string) {

	payload, err := service.DecodeLongURLPayload(longURL, handler.inputLimits)
	if err != nil {
		writeBlockingError(writer, request, http.StatusUnprocessableEntity, "INVALID_LONG_URL", err.Error(), "global", nil, nil)
		return
	}

	renderedConfig, err := service.RenderCompleteConfigFromSource(
		request.Context(),
		handler.source,
		payload.Stage1Input,
		payload.Stage2Snapshot,
		handler.inputLimits,
	)
	if err != nil {
		if subconverter.IsUnavailable(err) {
			writeUnavailableBlockingError(writer, request, err)
			return
		}
		logOperationFailure(request, http.StatusInternalServerError, "RENDER_FAILED", "global", nil, err)
		writeBlockingError(writer, request, http.StatusInternalServerError, "RENDER_FAILED", internalErrorUserMessage, "global", nil, nil)
		return
	}

	dispositionType := "inline"
	if request.URL.Query().Get("download") == "1" {
		dispositionType = "attachment"
	}

	writer.Header().Set("Content-Type", yamlContentType)
	writer.Header().Set("Cache-Control", noStoreHeader)
	writer.Header().Set("Content-Disposition", dispositionType+`; filename="`+filename+`"`)
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(renderedConfig))
}

func (handler *Handler) handleHealthz(writer http.ResponseWriter, _ *http.Request) {
	writer.Header().Set("Content-Type", "text/plain; charset=utf-8")
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte("ok\n"))
}

func decodeJSONBody(writer http.ResponseWriter, request *http.Request, target any) error {
	decoder := json.NewDecoder(http.MaxBytesReader(writer, request.Body, maxJSONBodyBytes))
	decoder.DisallowUnknownFields()
	if err := decoder.Decode(target); err != nil {
		return fmt.Errorf("decode JSON body: %w", err)
	}
	var extra json.RawMessage
	if err := decoder.Decode(&extra); err != io.EOF {
		return fmt.Errorf("decode JSON body: unexpected extra data")
	}
	return nil
}

func writeStage3DecodeError(writer http.ResponseWriter, request *http.Request, err error) {
	writeBlockingError(
		writer,
		request,
		http.StatusBadRequest,
		"INVALID_REQUEST",
		err.Error(),
		"stage3_field",
		map[string]any{"field": "currentLinkInput"},
		nil,
	)
}

func writeJSON(writer http.ResponseWriter, statusCode int, value any) {
	setAccessLogMessages(writer, value)
	writer.Header().Set("Content-Type", jsonContentType)
	writer.WriteHeader(statusCode)
	_ = json.NewEncoder(writer).Encode(value)
}

func writeOperationError(writer http.ResponseWriter, request *http.Request, operation string, err error) {
	if subconverter.IsUnavailable(err) {
		requestInfo, _ := RequestContextFrom(request.Context())
		classification := classifyUnavailableError(err)
		applog.UpstreamUnavailable(applog.UpstreamUnavailableMeta{
			RequestID:       requestInfo.RequestID,
			Operation:       operation,
			ProblemClass:    classification.problemClass,
			UserInputSource: classification.userInputSource,
			Cause:           sanitizeLogValue(err),
		})
		writeUnavailableBlockingError(writer, request, err)
		return
	}

	if responseErr, ok := service.AsResponseError(err); ok {
		blockingError := responseErr.BlockingError()
		logOperationFailure(request, responseErr.StatusCode(), blockingError.Code, blockingError.Scope, blockingError.Retryable, err)
		writeBlockingError(
			writer,
			request,
			responseErr.StatusCode(),
			blockingError.Code,
			blockingError.Message,
			blockingError.Scope,
			blockingError.Context,
			blockingError.Retryable,
		)
		return
	}

	var syntaxErr *json.SyntaxError
	if errors.As(err, &syntaxErr) {
		logOperationFailure(request, http.StatusBadRequest, "INVALID_REQUEST", "global", nil, err)
		writeBlockingError(writer, request, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), "global", nil, nil)
		return
	}

	logOperationFailure(request, http.StatusInternalServerError, "INTERNAL_ERROR", "global", nil, err)
	writeBlockingError(writer, request, http.StatusInternalServerError, "INTERNAL_ERROR", internalErrorUserMessage, "global", nil, nil)
}

func writeBlockingError(writer http.ResponseWriter, request *http.Request, statusCode int, code string, message string, scope string, context map[string]any, retryable *bool) {
	if request != nil {
		SetRequestErrorCode(request.Context(), code)
	}
	if recorder, ok := writer.(interface{ SetAccessLogErrorCode(string) }); ok {
		recorder.SetAccessLogErrorCode(code)
	}
	writeJSON(writer, statusCode, struct {
		Messages       []service.Message       `json:"messages"`
		BlockingErrors []service.BlockingError `json:"blockingErrors"`
	}{
		Messages: []service.Message{},
		BlockingErrors: []service.BlockingError{
			{
				Code:      code,
				Message:   message,
				Scope:     scope,
				Context:   context,
				Retryable: retryable,
			},
		},
	})
}

func setAccessLogMessages(writer http.ResponseWriter, value any) {
	recorder, ok := writer.(interface{ SetAccessLogMessages([]service.Message) })
	if !ok {
		return
	}

	switch response := value.(type) {
	case service.Stage1ConvertResponse:
		recorder.SetAccessLogMessages(response.Messages)
	case *service.Stage1ConvertResponse:
		recorder.SetAccessLogMessages(response.Messages)
	case service.GenerateResponse:
		recorder.SetAccessLogMessages(response.Messages)
	case *service.GenerateResponse:
		recorder.SetAccessLogMessages(response.Messages)
	case service.ResolveURLResponse:
		recorder.SetAccessLogMessages(response.Messages)
	case *service.ResolveURLResponse:
		recorder.SetAccessLogMessages(response.Messages)
	case service.ShortLinkResponse:
		recorder.SetAccessLogMessages(response.Messages)
	case *service.ShortLinkResponse:
		recorder.SetAccessLogMessages(response.Messages)
	}
}

func logOperationFailure(request *http.Request, statusCode int, code string, scope string, retryable *bool, err error) {
	if request == nil {
		return
	}
	if statusCode < http.StatusInternalServerError && statusCode != http.StatusTooManyRequests {
		return
	}

	requestInfo, _ := RequestContextFrom(request.Context())
	if requestInfo.Operation == "" {
		requestInfo.Operation = operationForRequest(request.Method, request.URL.Path)
	}
	meta := applog.APIErrorMeta{
		RequestID: requestInfo.RequestID,
		Operation: requestInfo.Operation,
		Status:    statusCode,
		Code:      strings.TrimSpace(code),
		Scope:     scope,
		Retryable: retryable,
		Cause:     sanitizeLogValue(err),
	}
	var unavailableErr *subconverter.Error
	if errors.As(err, &unavailableErr) && strings.TrimSpace(unavailableErr.Op) != "" {
		meta.UpstreamOp = sanitizeLogValue(unavailableErr.Op)
	}
	applog.APIError(meta)
}

func sanitizeLogValue(value any) string {
	if value == nil {
		return ""
	}
	text := strings.TrimSpace(fmt.Sprint(value))
	text = strings.ReplaceAll(text, "\n", " ")
	text = strings.ReplaceAll(text, "\r", " ")
	text = strings.Join(strings.Fields(text), " ")
	if len(text) > 240 {
		return text[:240]
	}
	return text
}

func boolPointer(value bool) *bool {
	return &value
}
