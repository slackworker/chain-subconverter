package service

import (
	"context"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"

	"github.com/slackworker/chain-subconverter/internal/subconverter"
)

const defaultTemplateConfigURL = "https://raw.githubusercontent.com/Aethersailor/Custom_OpenClash_Rules/refs/heads/main/cfg/Custom_Clash.ini"

type ManagedConversionSource struct {
	client                 *subconverter.Client
	templateStore          TemplateContentStore
	managedTemplateBaseURL *url.URL
	httpClient             *http.Client
}

func NewManagedConversionSource(client *subconverter.Client, templateStore TemplateContentStore, managedTemplateBaseURL string, templateTimeout time.Duration) (*ManagedConversionSource, error) {
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
	if _, err := parseRegionMatchers(templateConfig); err != nil {
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

	return PreparedConversion{
		Request:        request,
		TemplateConfig: templateConfig,
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
