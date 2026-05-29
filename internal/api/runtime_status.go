package api

import (
	"net/http"

	"github.com/slackworker/chain-subconverter/internal/runtimestatus"
)

func WithRuntimeStatus(service *runtimestatus.Service) HandlerOption {
	return func(handler *Handler) error {
		handler.runtimeStatus = service
		return nil
	}
}

func (handler *Handler) handleRuntimeStatus(writer http.ResponseWriter, request *http.Request) {
	if handler.runtimeStatus == nil {
		writeBlockingError(writer, http.StatusServiceUnavailable, "INTERNAL_ERROR", "runtime status unavailable", "global", nil, nil)
		return
	}

	refresh := request.URL.Query().Get("refresh") == "1" || request.URL.Query().Get("refresh") == "true"
	snapshot, err := handler.runtimeStatus.Snapshot(request.Context(), refresh)
	if err != nil {
		writeBlockingError(writer, http.StatusInternalServerError, "INTERNAL_ERROR", "runtime status unavailable", "global", nil, nil)
		return
	}

	writeJSON(writer, http.StatusOK, snapshot)
}
