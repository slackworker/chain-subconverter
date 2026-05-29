package store

import (
	"context"
	"fmt"

	"github.com/slackworker/chain-subconverter/internal/runtimestatus"
)

// StorageStats returns usage and mode for runtime status reporting.
func (s *SQLiteShortLinkStore) StorageStats(ctx context.Context) (runtimestatus.StorageStatus, error) {
	var used int
	if err := s.db.QueryRowContext(ctx, `SELECT COUNT(*) FROM short_links`).Scan(&used); err != nil {
		return runtimestatus.StorageStatus{}, fmt.Errorf("count short links: %w", err)
	}

	return runtimestatus.StorageStatus{
		Mode:     runtimestatus.InferStorageMode(s.dbPath),
		Used:     used,
		Capacity: s.maxCapacity,
	}, nil
}
