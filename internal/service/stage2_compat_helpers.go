package service

import (
	"fmt"
	"strings"
)

func stage2ProxyName(inst Stage2Instance) string {
	return strings.TrimSpace(inst.ProxyName)
}

func requireTargetName(inst Stage2Instance) (string, error) {
	if inst.TargetName == nil || strings.TrimSpace(*inst.TargetName) == "" {
		cause := fmt.Errorf("missing targetName for proxy %q", stage2ProxyName(inst))
		ref := stage2InstanceErrorRef{
			ProxyName: stage2ProxyName(inst),
		}
		return "", newStage2InstanceValidationError("MISSING_TARGET", "missing targetName", ref, "targetName", cause)
	}
	return strings.TrimSpace(*inst.TargetName), nil
}
