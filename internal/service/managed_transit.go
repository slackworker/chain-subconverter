package service

import (
	"fmt"
	"strings"
)

func buildManagedTransitProxiesYAML(transitDiscoveryYAML string, processor chainEmojiProcessor) (string, error) {
	linesByName, err := indexInlineProxyLinesByName(transitDiscoveryYAML)
	if err != nil {
		return "", fmt.Errorf("index transit discovery proxies: %w", err)
	}

	proxies, err := parseInlineProxyList(transitDiscoveryYAML)
	if err != nil {
		return "", fmt.Errorf("parse transit discovery proxies: %w", err)
	}

	var builder strings.Builder
	builder.WriteString("proxies:\n")
	for _, proxy := range proxies {
		line, ok := linesByName[proxy.Name]
		if !ok {
			return "", fmt.Errorf("transit discovery proxy %q not found", proxy.Name)
		}
		renderedLine, err := renameInlineProxyLineName(line, proxy.Name, processor)
		if err != nil {
			return "", fmt.Errorf("apply emoji to transit proxy %q: %w", proxy.Name, err)
		}
		builder.WriteString(renderedLine)
		builder.WriteString("\n")
	}

	return builder.String(), nil
}

func transitProxyDisplayName(originalName string, processor chainEmojiProcessor) (string, error) {
	if !processor.enabled {
		return originalName, nil
	}
	return processor.Apply(originalName)
}

func renameInlineProxyLineName(line string, originalName string, processor chainEmojiProcessor) (string, error) {
	displayName, err := transitProxyDisplayName(originalName, processor)
	if err != nil {
		return "", err
	}
	if displayName == originalName {
		return line, nil
	}

	prefix, fields, err := parseInlineProxyLine(line)
	if err != nil {
		return "", err
	}
	fields = upsertInlineProxyField(fields, "name", displayName)
	return renderInlineProxyLine(prefix, fields), nil
}
