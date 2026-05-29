import { useEffect, useState } from "react";
import type { AppPageProps } from "../../lib/composition";
import { DEFAULT_TEMPLATE_URL } from "../../lib/defaults";
import { getGlobalPrimaryBlockingErrors } from "../../lib/notices";
import { RuntimeStatusBadges } from "../../lib/RuntimeStatusBadges";
import { GlobalBlockingBanner } from "./GlobalBlockingBanner";
import { Stage1 } from "./Stage1";
import { Stage2 } from "./Stage2";
import { Stage3 } from "./Stage3";
import { LogPanel } from "./LogPanel";
import { SHELL_LOCALES, type ShellLocale } from "./shellLocales";
import "./index.css";

const LOCALE_STORAGE_KEY = "chain-subconverter-ui.locale";
const THEME_STORAGE_KEY = "chain-subconverter-ui.theme";

const getInitialLocale = (): ShellLocale => {
	const saved = window.localStorage.getItem(LOCALE_STORAGE_KEY);
	if (saved === "zh" || saved === "en") return saved;
	return "zh";
};

const getInitialColorMode = (): "dark" | "light" => {
	const saved = window.localStorage.getItem(THEME_STORAGE_KEY);
	if (saved === "dark" || saved === "light") return saved;
	return "dark";
};

export function SchemePage({
	workflow,
	outputActions,
	primaryBlockingFeedbackPlacement,
	runtimeConfig,
}: AppPageProps) {
	const [locale, setLocale] = useState<ShellLocale>(getInitialLocale);
	const [colorMode, setColorMode] = useState<"dark" | "light">(getInitialColorMode);

	useEffect(() => {
		window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
		document.documentElement.lang = locale === "zh" ? "zh-CN" : "en";
	}, [locale]);

	useEffect(() => {
		window.localStorage.setItem(THEME_STORAGE_KEY, colorMode);
		document.documentElement.style.colorScheme = colorMode === "dark" ? "dark" : "light";
	}, [colorMode]);

	const copy = SHELL_LOCALES[locale];
	const templateDefaultURL = runtimeConfig?.defaultTemplateURL?.trim() || DEFAULT_TEMPLATE_URL;
	const globalBlockingErrors = getGlobalPrimaryBlockingErrors(
		workflow.state.blockingErrors,
		workflow.responseOriginStage,
		primaryBlockingFeedbackPlacement,
	);

	return (
		<div
			className={`min-h-screen transition-colors duration-300 font-sans ${colorMode === "dark" ? "dark bg-[#0a0a0c] text-zinc-300" : "bg-slate-50 text-slate-700"}`}
		>
			<header
				className={`border-b backdrop-blur-md sticky top-0 z-40 transition-colors duration-300 ${colorMode === "dark" ? "border-zinc-800/80 bg-zinc-950/50 text-zinc-100" : "border-slate-200 bg-white/70 text-slate-800"}`}
			>
				<div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
					<div className="flex items-center gap-3">
						<img
							className="w-8 h-8 rounded-lg object-contain shrink-0"
							src={`${import.meta.env.BASE_URL}logo.svg`}
							alt=""
							width={32}
							height={32}
							decoding="async"
							fetchPriority="low"
							aria-hidden="true"
						/>
						<h1 className="text-lg font-bold tracking-tight">
							{locale === "zh" ? "链式代理 · 订阅转换" : "Chain Subconverter"}
						</h1>
					</div>
					<div className="flex items-center gap-4 text-sm font-medium">
						<button
							type="button"
							onClick={() => setLocale((l) => (l === "zh" ? "en" : "zh"))}
							className={`px-3 py-1.5 rounded-lg border text-xs font-semibold transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${colorMode === "dark" ? "border-zinc-800 hover:border-zinc-600 bg-zinc-900 text-zinc-300" : "border-slate-200 hover:border-slate-400 bg-slate-100 text-slate-700"}`}
							title={copy.languageToggle}
						>
							{locale === "zh" ? "EN" : "中"}
						</button>

						<button
							type="button"
							onClick={() => setColorMode((m) => (m === "dark" ? "light" : "dark"))}
							className={`p-2 rounded-lg border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${colorMode === "dark" ? "border-zinc-800 hover:border-zinc-600 bg-zinc-900 text-zinc-300" : "border-slate-200 hover:border-slate-400 bg-slate-100 text-slate-700"}`}
							title={colorMode === "dark" ? copy.themeToLight : copy.themeToDark}
						>
							{colorMode === "dark" ? (
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
									<circle cx="12" cy="12" r="5" />
									<path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42" />
								</svg>
							) : (
								<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
									<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
								</svg>
							)}
						</button>

						<a
							href="https://github.com/slackworker/chain-subconverter"
							target="_blank"
							rel="noopener noreferrer"
							className={`p-2 rounded-lg border transition-all duration-200 hover:scale-[1.02] active:scale-[0.98] ${colorMode === "dark" ? "border-zinc-800 hover:border-zinc-600 bg-zinc-900 text-zinc-300" : "border-slate-200 hover:border-slate-400 bg-slate-100 text-slate-700"}`}
							title={copy.githubRepo}
						>
							<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="2">
								<path d="M9 19c-5 1.5-5-2.5-7-3m14 6v-3.87a3.37 3.37 0 0 0-.94-2.61c3.14-.35 6.44-1.54 6.44-7A5.44 5.44 0 0 0 20 4.77 5.07 5.07 0 0 0 19.91 1S18.73.65 16 2.48a13.38 13.38 0 0 0-7 0C6.27.65 5.09 1 5.09 1A5.07 5.07 0 0 0 5 4.77a5.44 5.44 0 0 0-1.5 3.78c0 5.42 3.3 6.61 6.44 7A3.37 3.37 0 0 0 9 18.13V22" />
							</svg>
						</a>
					</div>
				</div>
			</header>

			{globalBlockingErrors.length > 0 ? (
				<GlobalBlockingBanner
					errors={globalBlockingErrors}
					responseOriginStage={workflow.responseOriginStage}
				/>
			) : null}

			<main className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-8">
				<div className="flex flex-col gap-2 mb-2">
					<h2 className="text-3xl font-extrabold text-transparent bg-clip-text bg-gradient-to-r from-indigo-500 via-purple-500 to-pink-500">
						{locale === "zh" ? "构建您的订阅配置" : "Build Your Subscription Config"}
					</h2>
					<p className={colorMode === "dark" ? "text-zinc-400" : "text-slate-500"}>{copy.stage1Desc}</p>
				</div>

				<Stage1 workflow={workflow} templateDefaultURL={templateDefaultURL} colorMode={colorMode} />
				<Stage2 workflow={workflow} colorMode={colorMode} />
				<Stage3 workflow={workflow} outputActions={outputActions} colorMode={colorMode} />
			</main>

			<footer
				className={`border-t mt-12 py-6 transition-colors duration-300 ${colorMode === "dark" ? "border-zinc-800/80" : "border-slate-200"}`}
			>
				<div className="max-w-5xl mx-auto px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<RuntimeStatusBadges
						locale={locale}
						footerCredit={`Chain Subconverter © ${new Date().getFullYear()}`}
					/>
				</div>
			</footer>

			<LogPanel entries={workflow.workflowLog} />
		</div>
	);
}
