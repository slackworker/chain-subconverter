package service

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"strings"
	"sync"
	"time"

	"github.com/slackworker/chain-subconverter/internal/config"
	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

type ManagedConversionSourceOptions struct {
	DefaultTemplateURL           string
	DefaultTemplateFetchCacheTTL time.Duration
	TemplateFetchCacheTTL        time.Duration
	AllowPrivateNetworks         bool
}

type ManagedConversionSource struct {
	client                    *subconverter.Client
	templateStore             TemplateContentStore
	managedTemplateBaseURL    *url.URL
	httpClient                *http.Client
	defaultTemplateURL        string
	defaultTemplateFetchCache *templateFetchCache
	templateFetchCache        *templateFetchCache
	allowPrivateNetworks      bool
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
	defaultTemplateURL := strings.TrimSpace(options.DefaultTemplateURL)
	if defaultTemplateURL == "" {
		defaultTemplateURL = config.DefaultDefaultTemplateURL
	}
	parsedDefaultTemplateURL, err := url.Parse(defaultTemplateURL)
	if err != nil {
		return nil, fmt.Errorf("parse default template URL: %w", err)
	}
	if parsedDefaultTemplateURL.Scheme != "http" && parsedDefaultTemplateURL.Scheme != "https" {
		return nil, fmt.Errorf("default template URL must be HTTP(S)")
	}
	if parsedDefaultTemplateURL.Host == "" {
		return nil, fmt.Errorf("default template URL must include host")
	}

	return &ManagedConversionSource{
		client:                    client,
		templateStore:             templateStore,
		managedTemplateBaseURL:    parsedBaseURL,
		httpClient:                newTemplateFetchHTTPClient(templateTimeout, options.AllowPrivateNetworks),
		defaultTemplateURL:        parsedDefaultTemplateURL.String(),
		defaultTemplateFetchCache: newTemplateFetchCache(options.DefaultTemplateFetchCacheTTL),
		templateFetchCache:        newTemplateFetchCache(options.TemplateFetchCacheTTL),
		allowPrivateNetworks:      options.AllowPrivateNetworks,
	}, nil
}

func (source *ManagedConversionSource) Convert(ctx context.Context, request subconverter.Request) (subconverter.ThreePassResult, error) {
	return source.client.Convert(ctx, request)
}

func (source *ManagedConversionSource) DefaultTemplateURL() string {
	return source.defaultTemplateURL
}

func (source *ManagedConversionSource) PrepareConversion(ctx context.Context, stage1Input Stage1Input) (PreparedConversion, error) {
	effectiveTemplateURL, isDefaultTemplate, err := source.resolveEffectiveTemplateURL(stage1Input)
	if err != nil {
		return PreparedConversion{}, err
	}

	templateConfig, usedStaleTemplate, err := source.fetchTemplateConfig(ctx, effectiveTemplateURL, isDefaultTemplate)
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
		Messages:                   templateFetchMessages(usedStaleTemplate),
		Cleanup: func() {
			source.templateStore.Delete(id)
		},
	}, nil
}

func (source *ManagedConversionSource) resolveEffectiveTemplateURL(stage1Input Stage1Input) (string, bool, error) {
	if stage1Input.AdvancedOptions.Config == nil {
		return "", false, newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", fmt.Errorf("missing template URL"))
	}

	rawURL := strings.TrimSpace(*stage1Input.AdvancedOptions.Config)
	if rawURL == "" {
		return "", false, newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", fmt.Errorf("empty template URL"))
	}
	parsedURL, err := url.Parse(rawURL)
	if err != nil {
		return "", false, newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", err)
	}
	if parsedURL.Scheme != "http" && parsedURL.Scheme != "https" {
		return "", false, newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", fmt.Errorf("unsupported scheme %q", parsedURL.Scheme))
	}
	if parsedURL.Host == "" {
		return "", false, newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", fmt.Errorf("missing host"))
	}
	effectiveTemplateURL := parsedURL.String()
	return effectiveTemplateURL, effectiveTemplateURL == source.defaultTemplateURL, nil
}

func (source *ManagedConversionSource) fetchTemplateConfig(ctx context.Context, templateURL string, isDefaultTemplate bool) (string, bool, error) {
	fetch := func(ctx context.Context) (string, error) {
		content, err := source.fetchTemplateConfigFromUpstream(ctx, templateURL, isDefaultTemplate)
		if err != nil {
			return "", err
		}
		if _, err := parseRegionMatchers(content); err != nil {
			return "", newStage1FieldValidationError("INVALID_TEMPLATE_CONFIG", "template content is invalid", "config", err)
		}
		return content, nil
	}

	if cache := source.templateFetchCacheForURL(isDefaultTemplate); cache != nil {
		if isDefaultTemplate {
			return cache.LoadOrFetchStaleOnError(ctx, templateURL, fetch)
		}
		content, err := cache.LoadOrFetch(ctx, templateURL, fetch)
		return content, false, err
	}

	content, err := fetch(ctx)
	return content, false, err
}

func (source *ManagedConversionSource) templateFetchCacheForURL(isDefaultTemplate bool) *templateFetchCache {
	if isDefaultTemplate && source.defaultTemplateFetchCache != nil {
		return source.defaultTemplateFetchCache
	}
	return source.templateFetchCache
}

func templateFetchMessages(usedStaleTemplate bool) []Message {
	if !usedStaleTemplate {
		return nil
	}
	return []Message{
		{
			Level:   "warning",
			Code:    "DEFAULT_TEMPLATE_CACHE_USED",
			Message: "默认模板暂时无法从上游刷新，已使用本服务此前验证通过的缓存模板",
		},
	}
}

func (source *ManagedConversionSource) fetchTemplateConfigFromUpstream(ctx context.Context, templateURL string, isDefaultTemplate bool) (string, error) {
	parsedURL, err := url.Parse(templateURL)
	if err != nil {
		return "", newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", err)
	}
	if err := validateTemplateFetchTarget(ctx, parsedURL.Hostname(), source.allowPrivateNetworks); err != nil {
		return "", newStage1FieldInvalidRequestError("config must not target private or loopback addresses", "config", err)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, templateURL, nil)
	if err != nil {
		return "", newStage1FieldInvalidRequestError("config must be a valid HTTP(S) template URL", "config", err)
	}

	resp, err := source.httpClient.Do(req)
	if err != nil {
		return "", newTemplateConfigUnavailableError(templateURL, isDefaultTemplate, err)
	}
	defer resp.Body.Close()

	if resp.StatusCode < http.StatusOK || resp.StatusCode >= http.StatusMultipleChoices {
		return "", newTemplateConfigUnavailableError(templateURL, isDefaultTemplate, fmt.Errorf("unexpected HTTP status %d", resp.StatusCode))
	}

	body, err := io.ReadAll(resp.Body)
	if err != nil {
		return "", newTemplateConfigUnavailableError(templateURL, isDefaultTemplate, err)
	}
	trimmed := strings.TrimSpace(string(body))
	if trimmed == "" {
		return "", newStage1FieldValidationError("INVALID_TEMPLATE_CONFIG", "template content is empty", "config", fmt.Errorf("empty response body"))
	}
	return trimmed, nil
}

func newTemplateConfigUnavailableError(templateURL string, isDefaultTemplate bool, cause error) error {
	retryable := true
	return newResponseError(
		http.StatusServiceUnavailable,
		"TEMPLATE_CONFIG_UNAVAILABLE",
		buildTemplateConfigUnavailableMessage(templateURL, isDefaultTemplate, cause),
		"global",
		nil,
		&retryable,
		cause,
	)
}

func buildTemplateConfigUnavailableMessage(templateURL string, isDefaultTemplate bool, cause error) string {
	host := templateURL
	if parsedURL, err := url.Parse(templateURL); err == nil {
		if parsedHost := strings.TrimSpace(parsedURL.Hostname()); parsedHost != "" {
			host = parsedHost
		}
	}

	if isNetworkTimeout(cause) {
		if isDefaultTemplate {
			return fmt.Sprintf("默认模板 URL 当前不可用：访问 %s 超时。当前环境对模板相关公网 URL 的连通性可能存在波动，请稍后重试，或改用当前环境更稳定的模板 URL。", host)
		}
		return fmt.Sprintf("模板 URL 当前不可用：访问 %s 超时。当前环境到该上游的连通性可能存在波动，请稍后重试。", host)
	}

	if isDefaultTemplate {
		return fmt.Sprintf("默认模板 URL 当前不可用：无法从 %s 拉取模板内容。", host)
	}
	return fmt.Sprintf("模板 URL 当前不可用：无法从 %s 拉取模板内容。", host)
}

func isNetworkTimeout(err error) bool {
	var netErr net.Error
	return errors.As(err, &netErr) && netErr.Timeout()
}

var blockedTemplateFetchCIDRs = mustParseCIDRs(
	"127.0.0.0/8",
	"::1/128",
	"169.254.0.0/16",
	"fe80::/10",
	"10.0.0.0/8",
	"172.16.0.0/12",
	"192.168.0.0/16",
	"fc00::/7",
	"0.0.0.0/8",
	"224.0.0.0/4",
)

func newTemplateFetchHTTPClient(timeout time.Duration, allowPrivateNetworks bool) *http.Client {
	transport := http.DefaultTransport.(*http.Transport).Clone()
	dialer := &net.Dialer{Timeout: timeout}

	if !allowPrivateNetworks {
		transport.DialContext = func(ctx context.Context, network string, addr string) (net.Conn, error) {
			host, port, err := net.SplitHostPort(addr)
			if err != nil {
				return nil, err
			}

			targets, err := resolveAllowedTemplateFetchTargets(ctx, host, port)
			if err != nil {
				return nil, err
			}

			var lastErr error
			for _, target := range targets {
				conn, err := dialer.DialContext(ctx, network, target)
				if err == nil {
					return conn, nil
				}
				lastErr = err
			}

			if lastErr != nil {
				return nil, lastErr
			}
			return nil, fmt.Errorf("template fetch target is unavailable")
		}
	}

	return &http.Client{Timeout: timeout, Transport: transport}
}

func validateTemplateFetchTarget(ctx context.Context, hostname string, allowPrivateNetworks bool) error {
	if allowPrivateNetworks {
		return nil
	}

	trimmedHost := strings.TrimSpace(hostname)
	if trimmedHost == "" {
		return fmt.Errorf("missing host")
	}

	_, err := resolveAllowedTemplateFetchTargets(ctx, trimmedHost, "80")
	return err
}

func resolveAllowedTemplateFetchTargets(ctx context.Context, hostname string, port string) ([]string, error) {
	resolvedIPs, err := net.DefaultResolver.LookupIPAddr(ctx, hostname)
	if err != nil {
		return nil, err
	}

	allowedTargets := make([]string, 0, len(resolvedIPs))
	for _, resolvedIP := range resolvedIPs {
		if isBlockedTemplateFetchIP(resolvedIP.IP) {
			continue
		}
		allowedTargets = append(allowedTargets, net.JoinHostPort(resolvedIP.IP.String(), port))
	}

	if len(allowedTargets) == 0 {
		return nil, fmt.Errorf("template URL host %q resolves only to blocked addresses", hostname)
	}

	return allowedTargets, nil
}

func isBlockedTemplateFetchIP(ip net.IP) bool {
	for _, blockedNetwork := range blockedTemplateFetchCIDRs {
		if blockedNetwork.Contains(ip) {
			return true
		}
	}
	return false
}

func mustParseCIDRs(values ...string) []*net.IPNet {
	networks := make([]*net.IPNet, 0, len(values))
	for _, value := range values {
		_, network, err := net.ParseCIDR(value)
		if err != nil {
			panic(err)
		}
		networks = append(networks, network)
	}
	return networks
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
	cache.finishFetch(key, call, content, err)

	return content, err
}

func (cache *templateFetchCache) LoadOrFetchStaleOnError(ctx context.Context, key string, fetch func(context.Context) (string, error)) (string, bool, error) {
	cache.mu.Lock()
	var staleEntry *templateFetchCacheEntry
	if cache.entries != nil {
		if entry, ok := cache.entries[key]; ok {
			if cache.now().Before(entry.expiresAt) {
				cache.mu.Unlock()
				return entry.content, false, nil
			}
			entryCopy := entry
			staleEntry = &entryCopy
		}
	}
	if cache.inflight != nil {
		if call, ok := cache.inflight[key]; ok {
			cache.mu.Unlock()
			select {
			case <-call.done:
				if call.err != nil && staleEntry != nil {
					return staleEntry.content, true, nil
				}
				return call.content, false, call.err
			case <-ctx.Done():
				return "", false, ctx.Err()
			}
		}
	} else {
		cache.inflight = make(map[string]*templateFetchCall)
	}

	call := &templateFetchCall{done: make(chan struct{})}
	cache.inflight[key] = call
	cache.mu.Unlock()

	content, err := fetch(ctx)
	cache.finishFetch(key, call, content, err)

	if err != nil && staleEntry != nil {
		return staleEntry.content, true, nil
	}
	return content, false, err
}

func (cache *templateFetchCache) finishFetch(key string, call *templateFetchCall, content string, err error) {
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
}
