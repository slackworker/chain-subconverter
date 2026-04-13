package api

import (
	"bytes"
	"io"
	"net/http"
	"os"
	"path"
	"path/filepath"
	"strings"
)

// WithFrontendAssets serves the built SPA shell for non-API GET/HEAD requests
// while preserving the existing API, subscription, and template routes.
func WithFrontendAssets(next http.Handler, distDir string) http.Handler {
	if next == nil {
		return http.NotFoundHandler()
	}
	cleanDistDir := strings.TrimSpace(distDir)
	if cleanDistDir == "" {
		return next
	}

	indexPath := filepath.Join(cleanDistDir, "index.html")
	if _, err := os.Stat(indexPath); err != nil {
		return next
	}

	return &frontendAssetsHandler{
		next:      next,
		distDir:   cleanDistDir,
		indexPath: indexPath,
		files:     http.FileServer(http.Dir(cleanDistDir)),
	}
}

type frontendAssetsHandler struct {
	next      http.Handler
	distDir   string
	indexPath string
	files     http.Handler
}

func (handler *frontendAssetsHandler) ServeHTTP(writer http.ResponseWriter, request *http.Request) {
	if request.Method != http.MethodGet && request.Method != http.MethodHead {
		handler.next.ServeHTTP(writer, request)
		return
	}
	if shouldBypassFrontendFallback(request.URL.Path) {
		handler.next.ServeHTTP(writer, request)
		return
	}

	buffered := newBufferedResponseWriter()
	handler.next.ServeHTTP(buffered, request)
	if buffered.statusCode != http.StatusNotFound {
		buffered.FlushTo(writer)
		return
	}

	if handler.serveAssetOrIndex(writer, request) {
		return
	}
	buffered.FlushTo(writer)
}

func (handler *frontendAssetsHandler) serveAssetOrIndex(writer http.ResponseWriter, request *http.Request) bool {
	cleanPath := path.Clean("/" + request.URL.Path)
	if cleanPath == "/" {
		http.ServeFile(writer, request, handler.indexPath)
		return true
	}

	relPath := strings.TrimPrefix(cleanPath, "/")
	assetPath := filepath.Join(handler.distDir, filepath.FromSlash(relPath))
	if info, err := os.Stat(assetPath); err == nil && !info.IsDir() {
		handler.files.ServeHTTP(writer, request)
		return true
	}

	if path.Ext(cleanPath) != "" {
		return false
	}

	http.ServeFile(writer, request, handler.indexPath)
	return true
}

func shouldBypassFrontendFallback(requestPath string) bool {
	return requestPath == "/healthz" ||
		requestPath == "/api" ||
		strings.HasPrefix(requestPath, "/api/") ||
		strings.HasSuffix(requestPath, ".yaml") ||
		strings.HasSuffix(requestPath, ".ini")
}

type bufferedResponseWriter struct {
	header     http.Header
	body       bytes.Buffer
	statusCode int
	wrote      bool
}

func newBufferedResponseWriter() *bufferedResponseWriter {
	return &bufferedResponseWriter{
		header:     make(http.Header),
		statusCode: http.StatusOK,
	}
}

func (writer *bufferedResponseWriter) Header() http.Header {
	return writer.header
}

func (writer *bufferedResponseWriter) WriteHeader(statusCode int) {
	if writer.wrote {
		return
	}
	writer.statusCode = statusCode
	writer.wrote = true
}

func (writer *bufferedResponseWriter) Write(data []byte) (int, error) {
	if !writer.wrote {
		writer.WriteHeader(http.StatusOK)
	}
	return writer.body.Write(data)
}

func (writer *bufferedResponseWriter) FlushTo(target http.ResponseWriter) {
	copyHeader(target.Header(), writer.header)
	target.WriteHeader(writer.statusCode)
	_, _ = io.Copy(target, bytes.NewReader(writer.body.Bytes()))
}

func copyHeader(dst http.Header, src http.Header) {
	for key, values := range src {
		copiedValues := append([]string(nil), values...)
		dst[key] = copiedValues
	}
}
