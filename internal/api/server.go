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

	"github.com/slackworker/chain-subconverter/internal/service"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

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
	publicBaseURL       string
	defaultTemplateURL  string
	maxLongURLLength    int
	inputLimits         service.InputLimits
	writeRateLimiter    *ipRateLimiter
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

func NewHandler(source service.ConversionSource, templateStore service.TemplateContentReader, shortLinkStore service.ShortLinkStore, publicBaseURL string, managedTemplateBaseURL string, maxLongURLLength int, inputLimits service.InputLimits, options ...HandlerOption) (*Handler, error) {
	if source == nil {
		return nil, fmt.Errorf("conversion source must not be nil")
	}
	if templateStore == nil {
		return nil, fmt.Errorf("template store must not be nil")
	}
	managedTemplatePath, err := managedTemplateRoutePath(managedTemplateBaseURL)
	if err != nil {
		return nil, err
	}
	subPath, shortSubPath, err := subRoutePaths(publicBaseURL)
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
		publicBaseURL:       publicBaseURL,
		defaultTemplateURL:  defaultTemplateURL,
		maxLongURLLength:    maxLongURLLength,
		inputLimits:         inputLimits,
		managedTemplatePath: managedTemplatePath,
		shortSubPath:        shortSubPath,
		subPath:             subPath,
	}
	for _, option := range options {
		if option != nil {
			option(handler)
		}
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/stage1/convert", handler.rateLimitWrite(handler.handleStage1Convert))
	mux.HandleFunc("POST /api/generate", handler.rateLimitWrite(handler.handleGenerate))
	mux.HandleFunc("POST /api/short-links", handler.rateLimitWrite(handler.handleShortLinks))
	mux.HandleFunc("POST /api/resolve-url", handler.rateLimitWrite(handler.handleResolveURL))
	mux.HandleFunc("GET /api/runtime-config", handler.handleRuntimeConfig)
	mux.HandleFunc(managedTemplatePath, handler.handleManagedTemplate)
	mux.HandleFunc("GET "+shortSubPath, handler.handleShortSubscription)
	mux.HandleFunc("GET "+subPath, handler.handleSubscription)
	mux.HandleFunc("GET /healthz", handler.handleHealthz)
	handler.mux = mux

	return handler, nil
}

func (handler *Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	handler.mux.ServeHTTP(writer, request)
}

func (handler *Handler) rateLimitWrite(next http.HandlerFunc) http.HandlerFunc {
	if handler.writeRateLimiter == nil {
		return next
	}

	return func(writer http.ResponseWriter, request *http.Request) {
		if handler.writeRateLimiter.allow(clientIPAddress(request.RemoteAddr)) {
			next(writer, request)
			return
		}

		retryable := true
		writeBlockingError(writer, http.StatusTooManyRequests, "RATE_LIMITED", "rate limit exceeded", "global", nil, &retryable)
	}
}

func (handler *Handler) handleStage1Convert(writer http.ResponseWriter, request *http.Request) {
	var payload service.Stage1ConvertRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeBlockingError(writer, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), "global", nil, nil)
		return
	}

	response, err := service.BuildStage1ConvertResponseFromSource(request.Context(), handler.source, payload.Stage1Input, handler.inputLimits)
	if err != nil {
		writeOperationError(writer, err)
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
		writeBlockingError(writer, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), "global", nil, nil)
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
		writeOperationError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, response)
}

func (handler *Handler) handleShortLinks(writer http.ResponseWriter, request *http.Request) {
	var payload service.ShortLinkRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeStage3DecodeError(writer, err)
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
		writeOperationError(writer, err)
		return
	}
	writeJSON(writer, http.StatusOK, response)
}

func (handler *Handler) handleResolveURL(writer http.ResponseWriter, request *http.Request) {
	var payload service.ResolveURLRequest
	if err := decodeJSONBody(writer, request, &payload); err != nil {
		writeStage3DecodeError(writer, err)
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
		writeOperationError(writer, err)
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

func subRoutePaths(publicBaseURL string) (string, string, error) {
	trimmed := strings.TrimSpace(publicBaseURL)
	if trimmed == "" {
		return "/sub", "/sub/", nil
	}
	parsedURL, err := url.Parse(trimmed)
	if err != nil {
		return "", "", fmt.Errorf("parse public base URL: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return "", "", fmt.Errorf("public base URL must include scheme and host")
	}

	basePath := strings.TrimRight(parsedURL.EscapedPath(), "/")
	if basePath == "" {
		return "/sub", "/sub/", nil
	}
	cleanBasePath := path.Clean(basePath)
	return cleanBasePath + "/sub", cleanBasePath + "/sub/", nil
}

// effectiveBaseURL returns the public base URL to use for link generation.
// If an explicit PUBLIC_BASE_URL is configured it is used as-is (highest priority).
// Otherwise the URL is inferred from the incoming request: scheme from TLS state,
// host from the Host header. This covers the common single-entry-point deployment
// where frontend and backend are served from the same origin.
func (handler *Handler) effectiveBaseURL(request *http.Request) string {
	if handler.publicBaseURL != "" {
		return handler.publicBaseURL
	}
	scheme := "http"
	if request.TLS != nil {
		scheme = "https"
	}
	host := request.Host
	if host == "" {
		host = "localhost"
	}
	return scheme + "://" + host
}

func managedTemplateRoutePath(managedTemplateBaseURL string) (string, error) {
	parsedURL, err := url.Parse(strings.TrimSpace(managedTemplateBaseURL))
	if err != nil {
		return "", fmt.Errorf("parse managed template base URL: %w", err)
	}
	if parsedURL.Scheme == "" || parsedURL.Host == "" {
		return "", fmt.Errorf("managed template base URL must include scheme and host")
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
		writeBlockingError(writer, http.StatusBadRequest, "INVALID_REQUEST", "missing data query parameter", "global", nil, nil)
		return
	}
	handler.renderSubscription(writer, request, request.URL.String(), "subscription.yaml")
}

func (handler *Handler) handleShortSubscription(writer http.ResponseWriter, request *http.Request) {
	if handler.shortLinkStore == nil {
		retryable := true
		writeBlockingError(writer, http.StatusServiceUnavailable, "SHORT_LINK_STORE_UNAVAILABLE", "short link store is unavailable", "global", nil, &retryable)
		return
	}

	requestPath := request.URL.Path
	if !strings.HasPrefix(requestPath, handler.shortSubPath) {
		writeBlockingError(writer, http.StatusBadRequest, "INVALID_REQUEST", "short URL path is invalid", "global", nil, nil)
		return
	}

	shortID := strings.TrimSpace(strings.TrimPrefix(requestPath, handler.shortSubPath))
	if shortID == "" || strings.Contains(shortID, "/") {
		writeBlockingError(writer, http.StatusBadRequest, "INVALID_REQUEST", "short URL path is invalid", "global", nil, nil)
		return
	}

	longURL, err := handler.shortLinkStore.ResolveShortID(request.Context(), shortID)
	if err != nil {
		if errors.Is(err, service.ErrShortURLNotFound) {
			writeBlockingError(writer, http.StatusUnprocessableEntity, "SHORT_URL_NOT_FOUND", "short URL not found", "global", nil, nil)
			return
		}
		retryable := true
		writeBlockingError(writer, http.StatusServiceUnavailable, "SHORT_LINK_STORE_UNAVAILABLE", "short link store is unavailable", "global", nil, &retryable)
		return
	}

	handler.renderSubscription(writer, request, longURL, shortID+".yaml")
}

func (handler *Handler) renderSubscription(writer http.ResponseWriter, request *http.Request, longURL string, filename string) {

	payload, err := service.DecodeLongURLPayload(longURL, handler.inputLimits)
	if err != nil {
		writeBlockingError(writer, http.StatusUnprocessableEntity, "INVALID_LONG_URL", err.Error(), "global", nil, nil)
		return
	}
	payload.Stage1Input, err = service.ApplyLongURLCompatibleQueryOverrides(payload.Stage1Input, request.URL.Query())
	if err != nil {
		writeBlockingError(writer, http.StatusUnprocessableEntity, "INVALID_LONG_URL", err.Error(), "global", nil, nil)
		return
	}

	renderedConfig, err := service.RenderCompleteConfigFromSourceWithExtraQuery(
		request.Context(),
		handler.source,
		payload.Stage1Input,
		payload.Stage2Snapshot,
		handler.inputLimits,
		service.ExtractSubscriptionPassthroughQuery(request.URL.Query()),
	)
	if err != nil {
		if subconverter.IsUnavailable(err) {
			retryable := true
			writeBlockingError(writer, http.StatusServiceUnavailable, "SUBCONVERTER_UNAVAILABLE", err.Error(), "global", nil, &retryable)
			return
		}
		writeBlockingError(writer, http.StatusInternalServerError, "RENDER_FAILED", err.Error(), "global", nil, nil)
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

func writeStage3DecodeError(writer http.ResponseWriter, err error) {
	writeBlockingError(
		writer,
		http.StatusBadRequest,
		"INVALID_REQUEST",
		err.Error(),
		"stage3_field",
		map[string]any{"field": "currentLinkInput"},
		nil,
	)
}

func writeJSON(writer http.ResponseWriter, statusCode int, value any) {
	writer.Header().Set("Content-Type", jsonContentType)
	writer.WriteHeader(statusCode)
	_ = json.NewEncoder(writer).Encode(value)
}

func writeOperationError(writer http.ResponseWriter, err error) {
	if subconverter.IsUnavailable(err) {
		retryable := true
		writeBlockingError(writer, http.StatusServiceUnavailable, "SUBCONVERTER_UNAVAILABLE", err.Error(), "global", nil, &retryable)
		return
	}

	if responseErr, ok := service.AsResponseError(err); ok {
		blockingError := responseErr.BlockingError()
		writeBlockingError(
			writer,
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
		writeBlockingError(writer, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), "global", nil, nil)
		return
	}

	writeBlockingError(writer, http.StatusInternalServerError, "INTERNAL_ERROR", err.Error(), "global", nil, nil)
}

func writeBlockingError(writer http.ResponseWriter, statusCode int, code string, message string, scope string, context map[string]any, retryable *bool) {
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
