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
	jsonContentType = "application/json; charset=utf-8"
	yamlContentType = "text/yaml; charset=utf-8"
	noStoreHeader   = "private, no-store"
)

type Handler struct {
	source              service.ConversionSource
	templateStore       service.TemplateContentReader
	shortLinkStore      service.ShortLinkStore
	publicBaseURL       string
	maxLongURLLength    int
	inputLimits         service.InputLimits
	managedTemplatePath string
	shortSubPath        string
	subPath             string
	mux                 *http.ServeMux
}

func NewHandler(source service.ConversionSource, templateStore service.TemplateContentReader, shortLinkStore service.ShortLinkStore, publicBaseURL string, managedTemplateBaseURL string, maxLongURLLength int, inputLimits service.InputLimits) (*Handler, error) {
	if source == nil {
		return nil, fmt.Errorf("conversion source must not be nil")
	}
	if templateStore == nil {
		return nil, fmt.Errorf("template store must not be nil")
	}
	if strings.TrimSpace(publicBaseURL) == "" {
		return nil, fmt.Errorf("public base URL must not be empty")
	}
	managedTemplatePath, err := managedTemplateRoutePath(managedTemplateBaseURL)
	if err != nil {
		return nil, err
	}
	subPath, shortSubPath, err := subRoutePaths(publicBaseURL)
	if err != nil {
		return nil, err
	}

	handler := &Handler{
		source:              source,
		templateStore:       templateStore,
		shortLinkStore:      shortLinkStore,
		publicBaseURL:       publicBaseURL,
		maxLongURLLength:    maxLongURLLength,
		inputLimits:         inputLimits,
		managedTemplatePath: managedTemplatePath,
		shortSubPath:        shortSubPath,
		subPath:             subPath,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/stage1/convert", handler.handleStage1Convert)
	mux.HandleFunc("POST /api/generate", handler.handleGenerate)
	mux.HandleFunc("POST /api/short-links", handler.handleShortLinks)
	mux.HandleFunc("POST /api/resolve-url", handler.handleResolveURL)
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

func (handler *Handler) handleStage1Convert(writer http.ResponseWriter, request *http.Request) {
	var payload service.Stage1ConvertRequest
	if err := decodeJSONBody(request, &payload); err != nil {
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

func (handler *Handler) handleGenerate(writer http.ResponseWriter, request *http.Request) {
	var payload service.GenerateRequest
	if err := decodeJSONBody(request, &payload); err != nil {
		writeBlockingError(writer, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), "global", nil, nil)
		return
	}

	response, err := service.BuildGenerateResponseFromSource(
		request.Context(),
		handler.publicBaseURL,
		handler.source,
		payload,
		handler.maxLongURLLength,
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
	if err := decodeJSONBody(request, &payload); err != nil {
		writeStage3DecodeError(writer, err)
		return
	}

	response, err := service.BuildShortLinkResponse(
		request.Context(),
		handler.publicBaseURL,
		handler.shortLinkStore,
		payload.LongURL,
		handler.maxLongURLLength,
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
	if err := decodeJSONBody(request, &payload); err != nil {
		writeStage3DecodeError(writer, err)
		return
	}

	response, err := service.ResolveURLFromSource(
		request.Context(),
		handler.publicBaseURL,
		handler.source,
		handler.shortLinkStore,
		payload.URL,
		handler.maxLongURLLength,
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
	parsedURL, err := url.Parse(strings.TrimSpace(publicBaseURL))
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

func decodeJSONBody(request *http.Request, target any) error {
	decoder := json.NewDecoder(request.Body)
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
