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
	app          AppStatus
	storage      StorageStatsProvider
	subconverter *UpstreamProber
}

func NewService(app AppStatus, storage StorageStatsProvider, subconverter *UpstreamProber) *Service {
	app = normalizeAppStatus(app)
	return &Service{
		app:          app,
		storage:      storage,
		subconverter: subconverter,
	}
}

func normalizeAppStatus(app AppStatus) AppStatus {
	if app.Version == "" {
		app.Version = version.DisplayVersion()
	}
	if app.ReleaseTag == "" {
		app.ReleaseTag = version.ReleaseTag
	}
	if app.ImageTag == "" {
		app.ImageTag = version.ImageTag
	}
	if app.Revision == "" {
		app.Revision = version.Revision
	}
	if app.ImageDigest == "" {
		app.ImageDigest = version.ImageDigest
	}
	return app
}

func (service *Service) Snapshot(ctx context.Context, refresh bool) (Snapshot, error) {
	storage, err := service.storage.StorageStats(ctx)
	if err != nil {
		return Snapshot{}, err
	}

	subconverterStatus := service.subconverter.Status(ctx, refresh)

	return Snapshot{
		App:          service.app,
		Subconverter: subconverterStatus,
		Storage:      storage,
	}, nil
}
