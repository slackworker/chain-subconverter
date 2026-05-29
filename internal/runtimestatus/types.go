package runtimestatus

// Snapshot is the JSON body for GET /api/runtime-status.
type Snapshot struct {
	App          AppStatus          `json:"app"`
	Subconverter SubconverterStatus `json:"subconverter"`
	Storage      StorageStatus      `json:"storage"`
}

type AppStatus struct {
	Version string `json:"version"`
}

type SubconverterStatus struct {
	Healthy       bool   `json:"healthy"`
	LatencyMs     *int64 `json:"latencyMs,omitempty"`
	Version       string `json:"version,omitempty"`
	LastCheckedAt string `json:"lastCheckedAt,omitempty"`
	Error         string `json:"error,omitempty"`
}

type StorageStatus struct {
	Mode     string `json:"mode"`
	Used     int    `json:"used"`
	Capacity int    `json:"capacity"`
}
