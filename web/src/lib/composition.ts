import type { ComponentType, ReactNode } from "react";

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

export interface UIScheme {
	NoticeRenderer: ComponentType<NoticeRendererProps>;
	StageContainer: ComponentType<StageContainerProps>;
	StatusDisplay: ComponentType<StatusDisplayProps>;
	TargetChooser: ComponentType<TargetChooserProps>;
}