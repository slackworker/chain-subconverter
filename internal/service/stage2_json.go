package service

import (
	"encoding/json"
	"fmt"
)

func (i *Stage2Instance) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	if _, ok := raw["instanceId"]; ok {
		return deprecatedStage2FieldError("instanceId")
	}
	type instanceFields struct {
		ProxyName  string  `json:"proxyName"`
		Mode       string  `json:"mode"`
		TargetName *string `json:"targetName"`
	}
	var fields instanceFields
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	i.ProxyName = fields.ProxyName
	i.Mode = fields.Mode
	i.TargetName = fields.TargetName
	return nil
}

func (a *Stage2Aggregation) UnmarshalJSON(data []byte) error {
	var raw map[string]json.RawMessage
	if err := json.Unmarshal(data, &raw); err != nil {
		return err
	}
	for _, key := range []string{"memberInstanceIds", "memberLocalInstanceIds"} {
		if _, ok := raw[key]; ok {
			return deprecatedStage2FieldError(key)
		}
	}
	type aggregationFields struct {
		Enabled          bool     `json:"enabled"`
		GroupName        string   `json:"groupName,omitempty"`
		Strategy         string   `json:"strategy,omitempty"`
		MemberProxyNames []string `json:"memberProxyNames,omitempty"`
	}
	var fields aggregationFields
	if err := json.Unmarshal(data, &fields); err != nil {
		return err
	}
	a.Enabled = fields.Enabled
	a.GroupName = fields.GroupName
	a.Strategy = fields.Strategy
	a.MemberProxyNames = fields.MemberProxyNames
	return nil
}

func deprecatedStage2FieldError(field string) error {
	message := fmt.Sprintf("deprecated stage2 field %q", field)
	return newInvalidRequestError(message, fmt.Errorf("%s", message))
}
