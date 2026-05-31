package runtimestatus

type SubconverterNetworkScope string

const (
	SubconverterNetworkScopeInternal     SubconverterNetworkScope = "internal"
	SubconverterNetworkScopeCrossNetwork SubconverterNetworkScope = "cross_network"
)

// Snapshot is the JSON body for GET /api/runtime-status.
type Snapshot struct {
	App          AppStatus          `json:"app"`
	Subconverter SubconverterStatus `json:"subconverter"`
	Storage      StorageStatus      `json:"storage"`
}

type AppStatus struct {
	Version    string `json:"version"`
	ReleaseTag string `json:"releaseTag,omitempty"`
	ImageTag     string `json:"imageTag,omitempty"`
	Revision     string `json:"revision,omitempty"`
	ImageDigest  string `json:"imageDigest,omitempty"`
}

type SubconverterStatus struct {
	Healthy       bool                     `json:"healthy"`
	NetworkScope  SubconverterNetworkScope `json:"networkScope"`
	LatencyMs     *int64                   `json:"latencyMs,omitempty"`
	Version       string                   `json:"version,omitempty"`
	LastCheckedAt string                   `json:"lastCheckedAt,omitempty"`
	Error         string                   `json:"error,omitempty"`
}

type StorageStatus struct {
	Mode     string `json:"mode"`
	Used     int    `json:"used"`
	Capacity int    `json:"capacity"`
}
