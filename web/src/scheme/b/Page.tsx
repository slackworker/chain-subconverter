import type { AppPageProps } from "../../lib/composition";
import { Stage1 } from "./Stage1";
import { Stage2 } from "./Stage2";
import { Stage3 } from "./Stage3";
import { LogPanel } from "./LogPanel";
import "./index.css";

export function BAppPage({ workflow, outputActions }: AppPageProps) {
	return (
		<div className="min-h-screen bg-[#0a0a0c] text-zinc-300 selection:bg-indigo-500/30">
			{/* Header */}
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
						<h1 className="text-lg font-medium text-zinc-100 tracking-tight">Chain Subconverter</h1>
					</div>
					<div className="flex items-center gap-4 text-sm font-medium">
						<span className="text-zinc-500">Scheme B</span>
					</div>
				</div>
			</header>

			{/* Main Content */}
			<main className="max-w-5xl mx-auto px-6 py-10 flex flex-col gap-8">
				<div className="flex flex-col gap-2 mb-2">
					<h2 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-zinc-100 to-zinc-500">
						构建您的订阅配置
					</h2>
					<p className="text-zinc-400">
						通过自动化工具快速组合您的落地节点与中转规则。
					</p>
				</div>

				<Stage1 workflow={workflow} />
				<Stage2 workflow={workflow} />
				<Stage3 workflow={workflow} outputActions={outputActions} />

			</main>

			<footer className="border-t border-zinc-800/80 mt-12 py-8 text-center text-sm text-zinc-500">
				<p>Chain Subconverter &copy; {new Date().getFullYear()} - Designed with Scheme B</p>
			</footer>

			{/* Log Area */}
			<LogPanel entries={workflow.workflowLog} />
		</div>
	);
}
