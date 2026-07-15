package main

import (
	"strings"

	"github.com/slackworker/chain-subconverter/internal/service"
)

func normalizeStage2SnapshotSourceLandingNames(snapshot *service.Stage2Snapshot, catalogSources []service.Stage2CatalogSource) bool {
	sourceByProxyName := catalogSourceIDByDefaultProxyName(catalogSources)
	if len(sourceByProxyName) == 0 {
		return false
	}

	changed := false
	for si := range snapshot.Servers {
		for so := range snapshot.Servers[si].Sources {
			source := &snapshot.Servers[si].Sources[so]
			oldSourceID := strings.TrimSpace(source.SourceID)
			newSourceID := resolveNormalizedSourceID(source, sourceByProxyName)
			if newSourceID == oldSourceID {
				continue
			}
			source.SourceID = newSourceID
			changed = true
		}
	}
	return changed
}

func catalogSourceIDByDefaultProxyName(catalogSources []service.Stage2CatalogSource) map[string]string {
	sourceByProxyName := make(map[string]string, len(catalogSources))
	for _, row := range catalogSources {
		proxyName := strings.TrimSpace(row.DefaultProxyName)
		sourceName := strings.TrimSpace(row.SourceID)
		if proxyName == "" || sourceName == "" {
			continue
		}
		sourceByProxyName[proxyName] = sourceName
	}
	return sourceByProxyName
}

func resolveNormalizedSourceID(source *service.Stage2SnapshotSource, sourceByProxyName map[string]string) string {
	oldSourceID := strings.TrimSpace(source.SourceID)
	if mapped, ok := sourceByProxyName[oldSourceID]; ok && mapped != "" {
		return mapped
	}
	for _, inst := range source.Instances {
		proxyName := strings.TrimSpace(inst.ProxyName)
		if mapped, ok := sourceByProxyName[proxyName]; ok && mapped != "" {
			return mapped
		}
	}
	return oldSourceID
}
