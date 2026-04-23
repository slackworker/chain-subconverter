package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

const defaultTemplateConfigURL = "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini"

type ManagedConversionSourceOptions struct {
	TemplateFetchCacheTTL time.Duration
}

type ManagedConversionSource struct {
	client                 *subconverter.Client
	templateStore          TemplateContentStore
	managedTemplateBaseURL *url.URL
	httpClient             *http.Client
	templateFetchCache     *templateFetchCache
}

func NewManagedConversionSource(client *subconverter.Client, templateStore TemplateContentStore, managedTemplateBaseURL string, templateTimeout time.Duration, options ManagedConversionSourceOptions) (*ManagedConversionSource, error) {
	if client == nil {
		return nil, fmt.Errorf("conversion client must not be nil")
	}
	if templateStore == nil {
		return nil, fmt.Errorf("template store must not be nil")
	}
	parsedBaseURL, err := url.Parse(strings.TrimSpace(managedTemplateBaseURL))
	if err != nil {
		return nil, fmt.Errorf("parse managed template base URL: %w", err)
	}
	if parsedBaseURL.Scheme == "" || parsedBaseURL.Host == "" {
		return nil, fmt.Errorf("managed template base URL must include scheme and host")
	}
	if templateTimeout <= 0 {
		templateTimeout = 15 * time.Second
	}

	return &ManagedConversionSource{
		client:                 client,
		templateStore:          templateStore,
		managedTemplateBaseURL: parsedBaseURL,
		httpClient:             &http.Client{Timeout: templateTimeout},
		templateFetchCache:     newTemplateFetchCache(options.TemplateFetchCacheTTL),
	}, nil
}

func (source *ManagedConversionSource) Convert(ctx context.Context, request subconverter.Request) (subconverter.ThreePassResult, error) {
	return source.client.Convert(ctx, request)
}

func (source *ManagedConversionSource) PrepareConversion(ctx context.Context, stage1Input Stage1Input) (PreparedConversion, error) {
	effectiveTemplateURL, err := resolveEffectiveTemplateURL(stage1Input)
	if err != nil {
		return PreparedConversion{}, err
	}

	templateConfig, err := source.fetchTemplateConfig(ctx, effectiveTemplateURL)
	if err != nil {
		return PreparedConversion{}, err
	}
	regionMatchers, err := parseRegionMatchers(templateConfig)
	if err != nil {
		return PreparedConversion{}, newStage1FieldValidationError("INVALID_TEMPLATE_CONFIG", "template content is invalid", "config", err)
	}

	id, err := source.templateStore.Save(templateConfig)
	if err != nil {
		return PreparedConversion{}, newInternalResponseError("failed to persist managed template", err)
	}
	managedTemplateURL, err := source.buildManagedTemplateURL(id)
	if err != nil {
		source.templateStore.Delete(id)
		return PreparedConversion{}, newInternalResponseError("failed to build managed template URL", err)
	}

	request := toSubconverterRequest(stage1Input)
	request.Options.Config = stringPtr(managedTemplateURL)
	recognizedRegionGroupNames := make([]string, 0, len(regionMatchers))
	for _, matcher := range regionMatchers {
		recognizedRegionGroupNames = append(recognizedRegionGroupNames, matcher.TargetName)
	}

	return PreparedConversion{
		Request:                    request,
		TemplateConfig:             templateConfig,
		EffectiveTemplateURL:       effectiveTemplateURL,
		ManagedTemplateURL:         managedTemplateURL,
		RecognizedRegionGroupNames: recognizedRegionGroupNames,
		Cleanup: func() {
			source.templateStore.Delete(id)
		},
	}, nil
}

func resolveEffectiveTemplateURL(stage1Input Stage1Input) (string, error) {
	if stage1Input.AdvancedOptions.Config == nil {
		return defaultTemplateConfigURL, nil
	}

	rawURL := strings.TrimSpace(*stage1Input.AdvancedOptions.Config)
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return "", newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", err)
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return "", newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", fmt.Errorf("unsupported scheme %q", parsedURL.Scheme))
	}
	if parsedURL.Host == "" {
		return "", newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", fmt.Errorf("missing host"))
	}
	return parsedURL.String(), nil
}

func (source *ManagedConversionSource) fetchTemplateConfig(ctx context.Context, templateURL string) (string, error) {
	if source.templateFetchCache != nil {
		return source.templateFetchCache.LoadOrFetch(ctx, templateURL, func(ctx context.Context) (string, error) {
			return source.fetchTemplateConfigFromUpstream(ctx, templateURL)
		})
	}

	return source.fetchTemplateConfigFromUpstream(ctx, templateURL)
}

func (source *ManagedConversionSource) fetchTemplateConfigFromUpstream(ctx context.Context, templateURL string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, templateURL, nil)
	if err != nil {
		return "", newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", err)
	}

	resp, err := source.httpClient.Do(req)
	if err != nil {
		retryable := true
		return "", newResponseError(http.StatusServiceUnavailable, "TEMPLATE_CONFIG_UNAVAILABLE", "template content is unavailable", "global", nil, &retryable, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		retryable := true
		return "", newResponseError(http.StatusServiceUnavailable, "TEMPLATE_CONFIG_UNAVAILABLE", "template content is unavailable", "global", nil, &retryable, fmt.Errorf("unexpected HTTP status %d", resp.StatusCode))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", newResponseError(http.StatusServiceUnavailable, "TEMPLATE_CONFIG_UNAVAILABLE", "template content is unavailable", "global", nil, nil, err)
	}
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return "", newStage1FieldValidationError("INVALID_TEMPLATE_CONFIG", "template content is empty", "config", fmt.Errorf("empty response body"))
	}
	return trimmed, nil
}

func (source *ManagedConversionSource) buildManagedTemplateURL(id string) (string, error) {
	templateURL := *source.managedTemplateBaseURL
	templateURL.Path = strings.TrimRight(templateURL.Path, "/") + "/internal/templates/" + id + ".ini"
	templateURL.RawQuery = ""
	templateURL.Fragment = ""
	return templateURL.String(), nil
}

type templateFetchCache struct {
	ttl      time.Duration
	now      func() time.Time
	mu       sync.Mutex
	entries  map[string]templateFetchCacheEntry
	inflight map[string]*templateFetchCall
}

type templateFetchCacheEntry struct {
	content   string
	expiresAt time.Time
}

type templateFetchCall struct {
	done    chan struct{}
	content string
	err     error
}

func newTemplateFetchCache(ttl time.Duration) *templateFetchCache {
	if ttl <= 0 {
		return nil
	}

	return &templateFetchCache{
		ttl: ttl,
		now: time.Now,
	}
}

func (cache *templateFetchCache) LoadOrFetch(ctx context.Context, key string, fetch func(context.Context) (string, error)) (string, error) {
	cache.mu.Lock()
	if cache.entries != nil {
		if entry, ok := cache.entries[key]; ok {
			if cache.now().Before(entry.expiresAt) {
				cache.mu.Unlock()
				return entry.content, nil
			}
			delete(cache.entries, key)
		}
	}
	if cache.inflight != nil {
		if call, ok := cache.inflight[key]; ok {
			cache.mu.Unlock()
			select {
			case <-call.done:
				return call.content, call.err
			case <-ctx.Done():
				return "", ctx.Err()
			}
		}
	} else {
		cache.inflight = make(map[string]*templateFetchCall)
	}

	call := &templateFetchCall{done: make(chan struct{})}
	cache.inflight[key] = call
	cache.mu.Unlock()

	content, err := fetch(ctx)

	cache.mu.Lock()
	delete(cache.inflight, key)
	if err == nil {
		if cache.entries == nil {
			cache.entries = make(map[string]templateFetchCacheEntry)
		}
		cache.entries[key] = templateFetchCacheEntry{
			content:   content,
			expiresAt: cache.now().Add(cache.ttl),
		}
	}
	call.content = content
	call.err = err
	close(call.done)
	cache.mu.Unlock()

	return content, err
}
