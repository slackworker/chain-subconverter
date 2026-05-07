import type { SVGProps } from "react";

export { CheckIcon, CopyIcon, DownloadIcon, ExternalLinkIcon } from "../b/Icons";

/** 与 scheme B 阶段按钮一致的右箭头，用于主操作 CTA */
export function ArrowRightIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<line x1="5" y1="12" x2="19" y2="12" />
			<polyline points="12 5 19 12 12 19" />
		</svg>
	);
}

/** 与 ArrowRightIcon 对称，用于「反向解析」等回到上游阶段的 CTA */
export function ArrowLeftIcon(props: SVGProps<SVGSVGElement>) {
	return (
		<svg
			xmlns="http://www.w3.org/2000/svg"
			width="24"
			height="24"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			{...props}
		>
			<line x1="19" y1="12" x2="5" y2="12" />
			<polyline points="12 5 5 12 12 19" />
		</svg>
	);
}
