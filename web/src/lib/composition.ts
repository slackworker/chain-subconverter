import type { ComponentType, ReactNode } from "react";

import type { AppWorkflowViewModel } from "../hooks/useAppWorkflow";
import type { ResponseOriginStage } from "./state";
import type { BlockingError, ChainTarget, Message } from "../types/api";

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
}

export interface UIScheme {
	id: string;
	label: string;
	description: string;
	Page: ComponentType<AppPageProps>;
}