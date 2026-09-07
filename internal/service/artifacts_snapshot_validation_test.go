package service

import (
	"strings"
	"testing"
)

func TestValidateGenerateSnapshot_RejectsRowsetMismatch(t *testing.T) {
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(Stage1Input{}, Stage2Snapshot{
		Servers: []Stage2SnapshotServer{},
	}, fixtures)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want rowset mismatch")
	}
	if !strings.Contains(err.Error(), `missing stage2 instance for landing node "HK Landing"`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	blockingErrors := requireBlockingErrors(t, err)
	if len(blockingErrors) != 1 || blockingErrors[0].Code != "STAGE2_ROWSET_MISMATCH" {
		t.Fatalf("BlockingErrors() = %#v, want one STAGE2_ROWSET_MISMATCH", blockingErrors)
	}
	if blockingErrors[0].Context["sourceId"] != "HK Landing" {
		t.Fatalf("STAGE2_ROWSET_MISMATCH sourceId = %#v, want HK Landing", blockingErrors[0].Context["sourceId"])
	}
}

func TestValidateGenerateSnapshot_RejectsTargetForNoneMode(t *testing.T) {
	targetName := "relay.example.com:80"
	fixtures := singleLandingFixture("HK Landing", "ss", "")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "none",
					TargetName:            &targetName,

					Server: "landing.example.com",
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want targetName validation")
	}
	if !strings.Contains(err.Error(), "targetName must be empty") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_AllowsChainForReality(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Reality", "vless-reality", "🇭🇰 香港节点")

	resolved, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "hk-reality-1",
					SourceLandingNodeName: "HK Reality",
					ProxyName:             "HK Reality",
					Mode:                  "chain",
					TargetName:            &targetName,

					Server: "landing.example.com",
				},
			},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	if len(resolved) != 1 || resolved[0].ProtocolType != "vless-reality" {
		t.Fatalf("resolved landing proxies = %#v, want one vless-reality entry", resolved)
	}
}

func TestValidateGenerateSnapshot_RejectsEmptyChainTarget(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("Unknown Landing", "ss", "")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "unknown-1",
					SourceLandingNodeName: "Unknown Landing",
					ProxyName:             "Unknown Landing",
					Mode:                  "chain",
					TargetName:            &targetName,

					Server: "landing.example.com",
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want empty chain target rejection")
	}
	if !strings.Contains(err.Error(), `chain target "🇭🇰 香港节点"`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T: %v", err, err)
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code != "EMPTY_CHAIN_TARGET" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", blockingError.Code, "EMPTY_CHAIN_TARGET")
	}
}

func TestValidateGenerateSnapshot_RejectsEmptyChainTargetFromValidationFullBaseYAML(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")
	fixtures.FullBaseYAML = ""
	fixtures.TemplateConfig = "custom_proxy_group=🇭🇰 香港节点`select`HK\n"
	fixtures.LandingDiscoveryYAML = strings.Join([]string{
		"proxies:",
		"  - {name: HK Landing, type: ss, server: landing.example.com, port: 443}",
		"",
	}, "\n")
	fixtures.ValidationFullBaseYAML = strings.Join([]string{
		"proxies:",
		"  - {name: HK Landing, type: ss, server: landing.example.com, port: 443, dialer-proxy: 🇭🇰 香港节点}",
		"proxy-groups:",
		"  - name: 🇭🇰 香港节点",
		"    type: select",
		"    proxies:",
		"      - HK Landing",
		"",
	}, "\n")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "chain",
				TargetName:            &targetName,

				Server: "landing.example.com",
			}},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want empty chain target rejection from validation full-base")
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T: %v", err, err)
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code != "EMPTY_CHAIN_TARGET" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", blockingError.Code, "EMPTY_CHAIN_TARGET")
	}
}

func TestValidateGenerateSnapshot_RejectsDuplicateForwardRelayTarget(t *testing.T) {
	targetName := "relay.example.com:80"
	fixtures := dualLandingFixture("HK Landing", "US Landing")

	_, err := validateGenerateSnapshot(
		Stage1Input{
			ForwardRelayItems: []string{targetName},
		},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "port_forward",
					TargetName:            &targetName,

					Server: "landing.example.com",
				},
				{
					RowID:                 "us-1",
					SourceLandingNodeName: "US Landing",
					ProxyName:             "US Landing",
					Mode:                  "port_forward",
					TargetName:            &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want duplicate forward relay target rejection")
	}
	if !strings.Contains(err.Error(), `forward relay "relay.example.com:80"`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code != "DUPLICATE_FORWARD_RELAY_TARGET" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", blockingError.Code, "DUPLICATE_FORWARD_RELAY_TARGET")
	}
}

func TestValidateGenerateSnapshot_AllowsGlobalSwitchOptimization(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			ChainProxyTargetGroupSwitchOptimizationEnabled: true,
			Rows: []Stage2Row{{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "chain",
				TargetName:            &targetName,

				Server: "landing.example.com",
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
}

func TestValidateGenerateSnapshot_AllowsMultipleRowsForSameSourceLanding(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	resolved, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "chain",
					TargetName:            &targetName,

					Server: "landing.example.com",
				},
				{
					RowID:                 "hk-2",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing 2",
					Mode:                  "none",
				},
			},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	if len(resolved) != 1 || resolved[0].Name != "HK Landing" {
		t.Fatalf("resolved landing proxies = %#v, want one HK Landing entry", resolved)
	}
}

func TestValidateGenerateSnapshot_AllowsServerAggregationGroupForSameServerRows(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	resolved, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "chain",
					TargetName:            &targetName,

					Server: "landing.example.com",
				},
				{
					RowID:                 "hk-2",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing 2",
					Mode:                  "none",
				},
			},
			ServerAggregationGroups: []ServerAggregationGroup{{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1", "hk-2"},
			}},
		},
		fixtures,
	)
	if err != nil {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	if len(resolved) != 1 || resolved[0].Name != "HK Landing" {
		t.Fatalf("resolved landing proxies = %#v, want one HK Landing entry", resolved)
	}
}

func TestValidateGenerateSnapshot_AllowsServerAggregationGroupWithExtendedStrategies(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	strategies := []string{"select", "load-balance"}
	for _, strategy := range strategies {
		t.Run(strategy, func(t *testing.T) {
			resolved, err := validateGenerateSnapshot(
				Stage1Input{},
				Stage2Snapshot{
					Rows: []Stage2Row{
						{
							RowID:                 "hk-1",
							SourceLandingNodeName: "HK Landing",
							ProxyName:             "HK Landing",
							Mode:                  "chain",
							TargetName:            &targetName,
						},
						{
							RowID:                 "hk-2",
							SourceLandingNodeName: "HK Landing",
							ProxyName:             "HK Landing 2",
							Mode:                  "none",
						},
					},
					ServerAggregationGroups: []ServerAggregationGroup{{
						Server:       "landing.example.com",
						Enabled:      true,
						Strategy:     strategy,
						MemberRowIDs: []string{"hk-1", "hk-2"},
					}},
				},
				fixtures,
			)
			if err != nil {
				t.Fatalf("validateGenerateSnapshot() error = %v", err)
			}
			if len(resolved) != 1 || resolved[0].Name != "HK Landing" {
				t.Fatalf("resolved landing proxies = %#v, want one HK Landing entry", resolved)
			}
		})
	}
}

func TestValidateGenerateSnapshot_RejectsServerAggregationGroupWithUnknownMember(t *testing.T) {
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "none",
			}},
			ServerAggregationGroups: []ServerAggregationGroup{{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1", "missing-row"},
			}},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want server aggregation member rejection")
	}
	if !strings.Contains(err.Error(), "requires at least 2 members") && !strings.Contains(err.Error(), "unknown") && !strings.Contains(err.Error(), "missing-row") {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	code := responseErr.BlockingError().Code
	if code != "SERVER_AGGREGATION_MEMBER_NOT_FOUND" && code != "SERVER_AGGREGATION_GROUP_TOO_SMALL" && code != "INVALID_REQUEST" {
		t.Fatalf("BlockingError.Code mismatch: got %q", code)
	}
}

func TestValidateGenerateSnapshot_RejectsServerAggregationGroupWithOnlyOneMember(t *testing.T) {
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "none",
			}},
			ServerAggregationGroups: []ServerAggregationGroup{{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1"},
			}},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want server aggregation group size rejection")
	}
	if !strings.Contains(err.Error(), `requires at least 2 members`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	if responseErr.BlockingError().Code != "SERVER_AGGREGATION_GROUP_TOO_SMALL" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", responseErr.BlockingError().Code, "SERVER_AGGREGATION_GROUP_TOO_SMALL")
	}
}

func TestValidateGenerateSnapshot_RejectsServerAggregationGroupWithDuplicateMembers(t *testing.T) {
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "none",
			}},
			ServerAggregationGroups: []ServerAggregationGroup{{
				Server:       "landing.example.com",
				Enabled:      true,
				Strategy:     "fallback",
				MemberRowIDs: []string{"hk-1", "hk-1"},
			}},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want duplicated server aggregation group members rejection")
	}
	if !strings.Contains(err.Error(), `requires at least 2`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	if responseErr.BlockingError().Code != "SERVER_AGGREGATION_GROUP_TOO_SMALL" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", responseErr.BlockingError().Code, "SERVER_AGGREGATION_GROUP_TOO_SMALL")
	}
}

func TestValidateGenerateSnapshot_RejectsDuplicateProxyName(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "chain",
					TargetName:            &targetName,
				},
				{
					RowID:                 "hk-2",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "none",
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want duplicate proxy name rejection")
	}
	if !strings.Contains(err.Error(), `duplicate proxy name "HK Landing"`) {
		t.Fatalf("validateGenerateSnapshot() error = %v", err)
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code != "DUPLICATE_PROXY_NAME" {
		t.Fatalf("BlockingError.Code mismatch: got %q", blockingError.Code)
	}
	wantContext := map[string]any{
		"sourceId":  "HK Landing",
		"proxyName": "HK Landing",
		"field":     "proxyName",
	}
	if !mapsEqual(blockingError.Context, wantContext) {
		t.Fatalf("BlockingError.Context mismatch: got %#v want %#v", blockingError.Context, wantContext)
	}

	status, _, conflicts, restoreErr := DetermineRestoreStatus(Stage1Input{}, Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "chain",
				TargetName:            &targetName,
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "none",
			},
		},
	}, fixtures)
	if restoreErr != nil {
		t.Fatalf("DetermineRestoreStatus() error = %v", restoreErr)
	}
	if status != "conflicted" {
		t.Fatalf("restoreStatus = %q, want conflicted", status)
	}
	if len(conflicts) != 1 || conflicts[0].ReasonCode != "DUPLICATE_PROXY_NAME" {
		t.Fatalf("restoreConflicts = %#v, want DUPLICATE_PROXY_NAME", conflicts)
	}
}

func TestValidateGenerateSnapshot_RejectsUnknownSourceLandingWithDerivedRowContext(t *testing.T) {
	targetName := "🇭🇰 香港节点"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "chain",
					TargetName:            &targetName,
				},
				{
					RowID:                 "hk-derived-1",
					SourceLandingNodeName: "Missing Landing",
					ProxyName:             "HK Landing Copy",
					Mode:                  "chain",
					TargetName:            &targetName,
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want unknown source landing rejection")
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T", err)
	}
	blockingError := responseErr.BlockingError()
	if blockingError.Code != "LANDING_NODE_NOT_FOUND" {
		t.Fatalf("BlockingError.Code mismatch: got %q want %q", blockingError.Code, "LANDING_NODE_NOT_FOUND")
	}
	wantContext := map[string]any{
		"sourceId":  "Missing Landing",
		"proxyName": "HK Landing Copy",
	}
	if !mapsEqual(blockingError.Context, wantContext) {
		t.Fatalf("BlockingError.Context mismatch: got %#v want %#v", blockingError.Context, wantContext)
	}
}

func TestValidateGenerateSnapshot_CollectsAllTargetNotFound(t *testing.T) {
	missingTarget := "missing-group"
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "chain",
					TargetName:            &missingTarget,
					Server:                "landing.example.com",
				},
				{
					RowID:                 "hk-2",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing 2",
					Mode:                  "chain",
					TargetName:            &missingTarget,
					Server:                "landing.example.com",
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want target not found")
	}
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected response error, got %T: %v", err, err)
	}
	blockingErrors := responseErr.BlockingErrors()
	if len(blockingErrors) != 2 {
		t.Fatalf("BlockingErrors() len = %d, want 2: %#v", len(blockingErrors), blockingErrors)
	}
	for i, blockingError := range blockingErrors {
		if blockingError.Code != "TARGET_NOT_FOUND" {
			t.Fatalf("BlockingErrors()[%d].Code = %q, want TARGET_NOT_FOUND", i, blockingError.Code)
		}
	}
	if blockingErrors[0].Context["proxyName"] != "HK Landing" {
		t.Fatalf("first proxyName = %#v, want HK Landing", blockingErrors[0].Context["proxyName"])
	}
	if blockingErrors[1].Context["proxyName"] != "HK Landing 2" {
		t.Fatalf("second proxyName = %#v, want HK Landing 2", blockingErrors[1].Context["proxyName"])
	}

	status, _, conflicts, restoreErr := DetermineRestoreStatus(Stage1Input{}, Stage2Snapshot{
		Rows: []Stage2Row{
			{
				RowID:                 "hk-1",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing",
				Mode:                  "chain",
				TargetName:            &missingTarget,
			},
			{
				RowID:                 "hk-2",
				SourceLandingNodeName: "HK Landing",
				ProxyName:             "HK Landing 2",
				Mode:                  "chain",
				TargetName:            &missingTarget,
			},
		},
	}, fixtures)
	if restoreErr != nil {
		t.Fatalf("DetermineRestoreStatus() error = %v", restoreErr)
	}
	if status != "conflicted" {
		t.Fatalf("restoreStatus = %q, want conflicted", status)
	}
	if len(conflicts) != 2 {
		t.Fatalf("restoreConflicts len = %d, want 2: %#v", len(conflicts), conflicts)
	}
	if conflicts[0].ReasonArgs["proxyName"] != "HK Landing" || conflicts[1].ReasonArgs["proxyName"] != "HK Landing 2" {
		t.Fatalf("restoreConflicts proxyName = (%#v, %#v)", conflicts[0].ReasonArgs["proxyName"], conflicts[1].ReasonArgs["proxyName"])
	}
}

func TestValidateGenerateSnapshot_CollectsRowsetMismatchPerLanding(t *testing.T) {
	fixtures := dualLandingFixture("HK Landing", "US Landing")

	_, err := validateGenerateSnapshot(Stage1Input{}, Stage2Snapshot{
		Servers: []Stage2SnapshotServer{},
	}, fixtures)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want rowset mismatch")
	}
	blockingErrors := requireBlockingErrors(t, err)
	sourceIDs := map[string]struct{}{}
	for _, blockingError := range blockingErrors {
		if blockingError.Code != "STAGE2_ROWSET_MISMATCH" {
			t.Fatalf("unexpected code %q in %#v", blockingError.Code, blockingErrors)
		}
		sourceID, _ := blockingError.Context["sourceId"].(string)
		sourceIDs[sourceID] = struct{}{}
	}
	if _, ok := sourceIDs["HK Landing"]; !ok {
		t.Fatalf("missing HK Landing rowset mismatch: %#v", blockingErrors)
	}
	if _, ok := sourceIDs["US Landing"]; !ok {
		t.Fatalf("missing US Landing rowset mismatch: %#v", blockingErrors)
	}
}

func TestValidateGenerateSnapshot_CollectsLandingNotFoundPerInstance(t *testing.T) {
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Rows: []Stage2Row{
				{
					RowID:                 "hk-1",
					SourceLandingNodeName: "HK Landing",
					ProxyName:             "HK Landing",
					Mode:                  "none",
					Server:                "landing.example.com",
				},
				{
					RowID:                 "missing-1",
					SourceLandingNodeName: "Missing Landing",
					ProxyName:             "Missing 1",
					Mode:                  "none",
					Server:                "missing.example.com",
				},
				{
					RowID:                 "missing-2",
					SourceLandingNodeName: "Missing Landing",
					ProxyName:             "Missing 2",
					Mode:                  "none",
					Server:                "missing.example.com",
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want landing not found")
	}
	blockingErrors := requireBlockingErrors(t, err)
	proxyNames := map[string]struct{}{}
	for _, blockingError := range blockingErrors {
		if blockingError.Code != "LANDING_NODE_NOT_FOUND" {
			t.Fatalf("unexpected code %q in %#v", blockingError.Code, blockingErrors)
		}
		proxyName, _ := blockingError.Context["proxyName"].(string)
		proxyNames[proxyName] = struct{}{}
	}
	if _, ok := proxyNames["Missing 1"]; !ok {
		t.Fatalf("missing instance Missing 1: %#v", blockingErrors)
	}
	if _, ok := proxyNames["Missing 2"]; !ok {
		t.Fatalf("missing instance Missing 2: %#v", blockingErrors)
	}
}

func TestValidateGenerateSnapshot_CollectsAllServerAggregationErrors(t *testing.T) {
	fixtures := dualLandingFixture("HK Landing", "US Landing")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Servers: []Stage2SnapshotServer{
				{
					ServerKey: "hk.example.com",
					Aggregation: Stage2Aggregation{
						Enabled:          true,
						Strategy:         "fallback",
						MemberProxyNames: []string{"HK Landing"},
					},
					Sources: []Stage2SnapshotSource{{
						SourceID: "HK Landing",
						Instances: []Stage2Instance{{
							ProxyName: "HK Landing",
							Mode:      "none",
						}},
					}},
				},
				{
					ServerKey: "us.example.com",
					Aggregation: Stage2Aggregation{
						Enabled:          true,
						Strategy:         "fallback",
						MemberProxyNames: []string{"US Landing"},
					},
					Sources: []Stage2SnapshotSource{{
						SourceID: "US Landing",
						Instances: []Stage2Instance{{
							ProxyName: "US Landing",
							Mode:      "none",
						}},
					}},
				},
			},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want aggregation group too small")
	}
	blockingErrors := requireBlockingErrors(t, err)
	serverKeys := map[string]struct{}{}
	for _, blockingError := range blockingErrors {
		if blockingError.Code != "SERVER_AGGREGATION_GROUP_TOO_SMALL" {
			t.Fatalf("unexpected code %q in %#v", blockingError.Code, blockingErrors)
		}
		serverKey, _ := blockingError.Context["serverKey"].(string)
		serverKeys[serverKey] = struct{}{}
	}
	if _, ok := serverKeys["hk.example.com"]; !ok {
		t.Fatalf("missing hk aggregation error: %#v", blockingErrors)
	}
	if _, ok := serverKeys["us.example.com"]; !ok {
		t.Fatalf("missing us aggregation error: %#v", blockingErrors)
	}
}

func TestValidateGenerateSnapshot_CollectsAllMissingAggregationMembers(t *testing.T) {
	fixtures := singleLandingFixture("HK Landing", "ss", "🇭🇰 香港节点")

	_, err := validateGenerateSnapshot(
		Stage1Input{},
		Stage2Snapshot{
			Servers: []Stage2SnapshotServer{{
				ServerKey: "landing.example.com",
				Aggregation: Stage2Aggregation{
					Enabled:          true,
					Strategy:         "fallback",
					MemberProxyNames: []string{"HK Landing", "ghost-a", "ghost-b"},
				},
				Sources: []Stage2SnapshotSource{{
					SourceID: "HK Landing",
					Instances: []Stage2Instance{{
						ProxyName: "HK Landing",
						Mode:      "none",
					}},
				}},
			}},
		},
		fixtures,
	)
	if err == nil {
		t.Fatal("validateGenerateSnapshot() error = nil, want missing aggregation members")
	}
	blockingErrors := requireBlockingErrors(t, err)
	proxyNames := map[string]struct{}{}
	for _, blockingError := range blockingErrors {
		if blockingError.Code != "SERVER_AGGREGATION_MEMBER_NOT_FOUND" {
			t.Fatalf("unexpected code %q in %#v", blockingError.Code, blockingErrors)
		}
		proxyName, _ := blockingError.Context["proxyName"].(string)
		proxyNames[proxyName] = struct{}{}
	}
	if _, ok := proxyNames["ghost-a"]; !ok {
		t.Fatalf("missing member ghost-a: %#v", blockingErrors)
	}
	if _, ok := proxyNames["ghost-b"]; !ok {
		t.Fatalf("missing member ghost-b: %#v", blockingErrors)
	}
}

func requireBlockingErrors(t *testing.T, err error) []BlockingError {
	t.Helper()
	responseErr, ok := AsResponseError(err)
	if !ok {
		t.Fatalf("expected ResponseError, got %T: %v", err, err)
	}
	return responseErr.BlockingErrors()
}

func mapsEqual(got map[string]any, want map[string]any) bool {
	if len(got) != len(want) {
		return false
	}
	for key, wantValue := range want {
		gotValue, ok := got[key]
		if !ok || gotValue != wantValue {
			return false
		}
	}
	return true
}

func dualLandingFixture(firstLandingName string, secondLandingName string) ConversionFixtures {
	groupLines := []string{"proxy-groups:"}
	for _, groupName := range []string{"🇭🇰 香港节点", "🇺🇸 美国节点", "🇯🇵 日本节点", "🇸🇬 新加坡节点", "🇼🇸 台湾节点", "🇰🇷 韩国节点"} {
		groupLines = append(groupLines,
			"  - name: "+groupName,
			"    type: url-test",
			"    proxies:",
			"      - DIRECT",
		)
	}

	return ConversionFixtures{
		LandingDiscoveryYAML: strings.Join([]string{
			"proxies:",
			inlineLandingFixtureLine(firstLandingName, "ss", false),
			inlineLandingFixtureLine(secondLandingName, "ss", false),
			"",
		}, "\n"),
		TransitDiscoveryYAML: buildTransitDiscoveryFixture(nil, nil),
		FullBaseYAML: strings.Join(append([]string{
			"proxies:",
			inlineLandingFixtureLine(firstLandingName, "ss", true),
			inlineLandingFixtureLine(secondLandingName, "ss", true),
		}, append(groupLines, "")...), "\n"),
		TemplateConfig: defaultRegionConfig,
	}
}
