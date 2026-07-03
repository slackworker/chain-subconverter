package service

func preprocessTemplateEmojiByRegion(templateConfig string, options AdvancedOptions) (string, []Message, error) {
	if !shouldPreprocessTemplateEmoji(options) {
		return templateConfig, nil, nil
	}
	_, messages, err := buildChainEmojiProcessor(templateConfig, options)
	if err != nil {
		return "", nil, err
	}
	return templateConfig, messages, nil
}

func shouldPreprocessTemplateEmoji(options AdvancedOptions) bool {
	return options.Emoji != nil && *options.Emoji
}
