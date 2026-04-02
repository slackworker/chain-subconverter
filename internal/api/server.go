package api

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
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
	source           service.ConversionSource
	publicBaseURL    string
	maxLongURLLength int
	mux              *http.ServeMux
}

func NewHandler(source service.ConversionSource, publicBaseURL string, maxLongURLLength int) (*Handler, error) {
	if source == nil {
		return nil, fmt.Errorf("conversion source must not be nil")
	}
	if strings.TrimSpace(publicBaseURL) == "" {
		return nil, fmt.Errorf("public base URL must not be empty")
	}

	handler := &Handler{
		source:           source,
		publicBaseURL:    publicBaseURL,
		maxLongURLLength: maxLongURLLength,
	}

	mux := http.NewServeMux()
	mux.HandleFunc("POST /api/stage1/convert", handler.handleStage1Convert)
	mux.HandleFunc("POST /api/generate", handler.handleGenerate)
	mux.HandleFunc("GET /subscription", handler.handleSubscription)
	handler.mux = mux

	return handler, nil
}

func (handler *Handler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	handler.mux.ServeHTTP(writer, request)
}

func (handler *Handler) handleStage1Convert(writer http.ResponseWriter, request *http.Request) {
	var payload service.Stage1ConvertRequest
	if err := decodeJSONBody(request, &payload); err != nil {
		writeBlockingError(writer, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), "global", nil)
		return
	}

	response, err := service.BuildStage1ConvertResponseFromSource(request.Context(), handler.source, payload.Stage1Input)
	if err != nil {
		writeServiceError(writer, err, "REQUEST_VALIDATION_FAILED")
		return
	}
	writeJSON(writer, http.StatusOK, response)
}

func (handler *Handler) handleGenerate(writer http.ResponseWriter, request *http.Request) {
	var payload service.GenerateRequest
	if err := decodeJSONBody(request, &payload); err != nil {
		writeBlockingError(writer, http.StatusBadRequest, "INVALID_REQUEST", err.Error(), "global", nil)
		return
	}

	response, err := service.BuildGenerateResponseFromSource(
		request.Context(),
		handler.publicBaseURL,
		handler.source,
		payload,
		handler.maxLongURLLength,
	)
	if err != nil {
		writeServiceError(writer, err, "REQUEST_VALIDATION_FAILED")
		return
	}
	writeJSON(writer, http.StatusOK, response)
}

func (handler *Handler) handleSubscription(writer http.ResponseWriter, request *http.Request) {
	data := strings.TrimSpace(request.URL.Query().Get("data"))
	if data == "" {
		writeBlockingError(writer, http.StatusBadRequest, "INVALID_REQUEST", "missing data query parameter", "global", nil)
		return
	}

	payload, err := service.DecodeLongURLPayload(request.URL.String())
	if err != nil {
		writeBlockingError(writer, http.StatusUnprocessableEntity, "INVALID_LONG_URL", err.Error(), "global", nil)
		return
	}

	renderedConfig, err := service.RenderCompleteConfigFromSource(
		request.Context(),
		handler.source,
		payload.Stage1Input,
		payload.Stage2Snapshot,
	)
	if err != nil {
		if subconverter.IsUnavailable(err) {
			retryable := true
			writeBlockingError(writer, http.StatusServiceUnavailable, "SUBCONVERTER_UNAVAILABLE", err.Error(), "global", &retryable)
			return
		}
		writeBlockingError(writer, http.StatusUnprocessableEntity, "INVALID_LONG_URL", err.Error(), "global", nil)
		return
	}

	dispositionType := "inline"
	if request.URL.Query().Get("download") == "1" {
		dispositionType = "attachment"
	}

	writer.Header().Set("Content-Type", yamlContentType)
	writer.Header().Set("Cache-Control", noStoreHeader)
	writer.Header().Set("Content-Disposition", dispositionType+`; filename="subscription.yaml"`)
	writer.WriteHeader(http.StatusOK)
	_, _ = writer.Write([]byte(renderedConfig))
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

func writeJSON(writer http.ResponseWriter, statusCode int, value any) {
	writer.Header().Set("Content-Type", jsonContentType)
	writer.WriteHeader(statusCode)
	_ = json.NewEncoder(writer).Encode(value)
}

func writeServiceError(writer http.ResponseWriter, err error, defaultCode string) {
	if subconverter.IsUnavailable(err) {
		retryable := true
		writeBlockingError(writer, http.StatusServiceUnavailable, "SUBCONVERTER_UNAVAILABLE", err.Error(), "global", &retryable)
		return
	}
	writeBlockingError(writer, http.StatusUnprocessableEntity, defaultCode, err.Error(), "global", nil)
}

func writeBlockingError(writer http.ResponseWriter, statusCode int, code string, message string, scope string, retryable *bool) {
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
				Retryable: retryable,
			},
		},
	})
}
