export type ShellLocale = "zh" | "en";

export const SHELL_LOCALES = {
	zh: {
		languageToggle: "切换界面语言",
		themeToDark: "切换到暗色主题",
		themeToLight: "切换到亮色主题",
		githubRepo: "打开 GitHub 仓库",
		stage1Desc: "填写落地与中转，转换生成配置基底",
	},
	en: {
		languageToggle: "Toggle language",
		themeToDark: "Toggle Dark Mode",
		themeToLight: "Toggle Light Mode",
		githubRepo: "GitHub Repository",
		stage1Desc: "Fill landing & transit, convert for config baseline",
	},
} as const satisfies Record<ShellLocale, Record<string, string>>;
