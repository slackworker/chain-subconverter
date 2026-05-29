import type { AppPageProps } from "../../lib/composition";
import { DEFAULT_TEMPLATE_URL } from "../../lib/defaults";
import { getGlobalPrimaryBlockingErrors } from "../../lib/notices";
import { RuntimeStatusBadges } from "../../lib/RuntimeStatusBadges";
import { GlobalBlockingBanner } from "./GlobalBlockingBanner";
import { Stage1 } from "./Stage1";
import { Stage2 } from "./Stage2";
import { Stage3 } from "./Stage3";
import { LogPanel } from "./LogPanel";
import "./index.css";

export function SchemePage({
	workflow,
	outputActions,
	primaryBlockingFeedbackPlacement,
	runtimeConfig,
}: AppPageProps) {
	const templateDefaultURL = runtimeConfig?.defaultTemplateURL?.trim() || DEFAULT_TEMPLATE_URL;
	const globalBlockingErrors = getGlobalPrimaryBlockingErrors(
		workflow.state.blockingErrors,
		workflow.responseOriginStage,
		primaryBlockingFeedbackPlacement,
	);

	return (
		<div className="min-h-screen bg-[#0a0a0c] text-zinc-300 selection:bg-indigo-500/30">
			<header className="border-b border-zinc-800/80 bg-zinc-950/50 backdrop-blur-md sticky top-0 z-40">
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
						<div>
							<h1 className="text-lg font-medium text-zinc-100 tracking-tight">Chain Subconverter</h1>
							<p className="text-[11px] text-zinc-500">探索性方案 B</p>
						</div>
					</div>
					<a
						className="text-xs text-zinc-500 hover:text-zinc-300 transition-colors"
						href="https://github.com/slackworker/chain-subconverter"
						target="_blank"
						rel="noopener noreferrer"
					>
						GitHub
					</a>
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
					<h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-500">
						构建您的订阅配置
					</h2>
					<p className="text-zinc-400">
						通过自动化工具快速组合您的落地节点与中转规则。
					</p>
				</div>

				<Stage1 workflow={workflow} templateDefaultURL={templateDefaultURL} />
				<Stage2 workflow={workflow} />
				<Stage3 workflow={workflow} outputActions={outputActions} />
			</main>

			<footer className="border-t border-zinc-800/80 mt-12 py-6">
				<div className="max-w-5xl mx-auto px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
					<RuntimeStatusBadges
						locale="zh"
						footerCredit={`Chain Subconverter © ${new Date().getFullYear()}`}
					/>
				</div>
			</footer>

			<LogPanel entries={workflow.workflowLog} />
		</div>
	);
}
