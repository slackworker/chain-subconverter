import type { ComponentType, ReactNode } from "react";

import type { AppWorkflowViewModel } from "../hooks/useAppWorkflow";
import type { ResponseOriginStage } from "./state";
import type { BlockingError, ChainTarget, Message, RuntimeConfigResponse } from "../types/api";

export type PrimaryBlockingFeedbackPlacement = "global" | "stage-local";

export interface NoticeRendererProps {
	messages: Message[];
	blockingErrors: BlockingError[];
	responseOriginStage?: ResponseOriginStage | null;
}

export interface StageContainerProps {
	eyebrow: string;
	title: string;
	description: string;
	aside?: ReactNode;
	children?: ReactNode;
}

export interface StatusDisplayProps {
	label: string;
	tone?: "neutral" | "warning" | "success";
}

export interface TargetChooserProps {
	targets: ChainTarget[];
	value: string | null;
	onChange: (targetName: string | null) => void;
}

export type CopyState = "idle" | "done" | "failed";

export interface OutputActions {
	copyState: CopyState;
	openCurrentLink: () => void;
	copyCurrentLink: () => Promise<void>;
	downloadCurrentLink: () => void;
}

export interface AppPageProps {
	workflow: AppWorkflowViewModel;
	outputActions: OutputActions;
	primaryBlockingFeedbackPlacement: PrimaryBlockingFeedbackPlacement;
	runtimeConfig: RuntimeConfigResponse | null;
}

/** `baseline`：对照/发布级，实现时以 spec 02 方案层约定为参考；`exploratory`：可脱离 spec 02 交互与风格细节，须满足业务能力验收。 */
export type UISchemeInteractionTier = "baseline" | "exploratory";

export interface UISchemeDefinition {
	id: string;
	label: string;
	description: string;
	interactionTier: UISchemeInteractionTier;
	primaryBlockingFeedbackPlacement: PrimaryBlockingFeedbackPlacement;
}

export interface UIScheme extends UISchemeDefinition {
	Page: ComponentType<AppPageProps>;
}