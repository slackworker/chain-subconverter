package service

// RestoreConflictFromError extracts a structured restore conflict from a
// ResponseError produced by restore validation.
func RestoreConflictFromError(err error) RestoreConflict {
	responseErr, ok := AsResponseError(err)
	if !ok {
		return RestoreConflict{ReasonCode: "RESTORE_VALIDATION_FAILED"}
	}

	blockingError := responseErr.BlockingError()
	return RestoreConflict{
		ReasonCode: blockingError.Code,
		ReasonArgs: restoreReasonArgsFromContext(blockingError.Context),
	}
}

func restoreReasonArgsFromContext(context map[string]any) map[string]any {
	if len(context) == 0 {
		return nil
	}

	reasonArgs := make(map[string]any, len(context))
	for _, key := range []string{"sourceId", "proxyName", "serverKey", "field"} {
		if value, ok := context[key]; ok {
			reasonArgs[key] = value
		}
	}
	if len(reasonArgs) == 0 {
		return nil
	}
	return reasonArgs
}
