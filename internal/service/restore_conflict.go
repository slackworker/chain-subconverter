package service

// RestoreConflictFromError extracts a structured restore conflict from a
// ResponseError produced by restore validation.
func RestoreConflictFromError(err error) RestoreConflict {
	conflicts := RestoreConflictsFromError(err)
	if len(conflicts) == 0 {
		return RestoreConflict{ReasonCode: "RESTORE_VALIDATION_FAILED"}
	}
	return conflicts[0]
}

func RestoreConflictsFromError(err error) []RestoreConflict {
	responseErr, ok := AsResponseError(err)
	if !ok {
		return []RestoreConflict{{ReasonCode: "RESTORE_VALIDATION_FAILED"}}
	}

	conflicts := make([]RestoreConflict, 0, len(responseErr.BlockingErrors()))
	for _, blockingError := range responseErr.BlockingErrors() {
		if !isRestoreConflictCode(blockingError.Code) {
			continue
		}
		conflicts = append(conflicts, RestoreConflict{
			ReasonCode: blockingError.Code,
			ReasonArgs: restoreReasonArgsFromContext(blockingError.Context),
		})
	}
	if len(conflicts) == 0 {
		return []RestoreConflict{{
			ReasonCode: responseErr.BlockingError().Code,
			ReasonArgs: restoreReasonArgsFromContext(responseErr.BlockingError().Context),
		}}
	}
	return conflicts
}

func restoreReasonArgsFromContext(context map[string]any) map[string]any {
	if len(context) == 0 {
		return nil
	}

	reasonArgs := make(map[string]any, len(context))
	for _, key := range []string{"sourceId", "proxyName", "serverKey", "field", "userInputSource"} {
		if value, ok := context[key]; ok {
			reasonArgs[key] = value
		}
	}
	if len(reasonArgs) == 0 {
		return nil
	}
	return reasonArgs
}
