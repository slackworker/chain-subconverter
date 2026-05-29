package runtimestatus

import (
	"context"

	"github.com/slackworker/chain-subconverter/internal/version"
)

// StorageStatsProvider reports short-link store usage for runtime status.
type StorageStatsProvider interface {
	StorageStats(ctx context.Context) (StorageStatus, error)
}

// Service assembles the runtime status snapshot.
type Service struct {
	appVersion     string
	storage        StorageStatsProvider
	subconverter   *UpstreamProber
}

func NewService(appVersion string, storage StorageStatsProvider, subconverter *UpstreamProber) *Service {
	if appVersion == "" {
		appVersion = version.Version
	}
	return &Service{
		appVersion:   appVersion,
		storage:      storage,
		subconverter: subconverter,
	}
}

func (service *Service) Snapshot(ctx context.Context, refresh bool) (Snapshot, error) {
	storage, err := service.storage.StorageStats(ctx)
	if err != nil {
		return Snapshot{}, err
	}

	subconverterStatus := service.subconverter.Status(ctx, refresh)

	return Snapshot{
		App: AppStatus{
			Version: service.appVersion,
		},
		Subconverter: subconverterStatus,
		Storage:      storage,
	}, nil
}
