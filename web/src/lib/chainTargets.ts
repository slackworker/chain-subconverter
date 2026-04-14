import type { ChainTarget } from "../types/api";

export interface ChainTargetGroup {
	kind: ChainTarget["kind"];
	priority: "primary" | "secondary";
	title: string;
	description: string;
	emptyText: string;
	targets: ChainTarget[];
}

const groupOrder: Array<ChainTarget["kind"]> = ["proxy-groups", "proxies"];

const groupContent: Record<ChainTarget["kind"], Omit<ChainTargetGroup, "kind" | "targets">> = {
	"proxy-groups": {
		priority: "primary",
		title: "区域策略组",
		description: "默认主路径。大多数情况下直接选择区域策略组即可。",
		emptyText: "当前没有可展示的区域策略组候选。",
	},
	proxies: {
		priority: "secondary",
		title: "固定节点",
		description: "低频补充路径。仅在需要精确指定单个节点时使用。",
		emptyText: "当前没有可展示的固定节点候选。",
	},
};

export function getChainTargetGroups(targets: ChainTarget[]): ChainTargetGroup[] {
	return groupOrder.map((kind) => ({
		kind,
		...groupContent[kind],
		targets: targets.filter((target) => target.kind === kind),
	}));
}