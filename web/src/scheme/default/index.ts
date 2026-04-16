import type { UIScheme } from "../../lib/composition";
import { DefaultChainTargetChooser } from "./ChainTargetChooser";
import { DefaultNoticeList } from "./NoticeList";
import { DefaultSectionBlock } from "./SectionBlock";
import { DefaultStatusBadge } from "./StatusBadge";

export const defaultUIScheme: UIScheme = {
	NoticeRenderer: DefaultNoticeList,
	StageContainer: DefaultSectionBlock,
	StatusDisplay: DefaultStatusBadge,
	TargetChooser: DefaultChainTargetChooser,
};