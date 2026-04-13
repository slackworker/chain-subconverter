import type { BlockingError, Message } from "../types/api";

interface NoticeStackProps {
	messages: Message[];
	blockingErrors: BlockingError[];
}

export function NoticeStack({ messages, blockingErrors }: NoticeStackProps) {
	if (messages.length === 0 && blockingErrors.length === 0) {
		return null;
	}

	return (
		<div className="space-y-3">
			{blockingErrors.map((error) => (
				<div key={`${error.code}-${error.scope}-${error.message}`} className="rounded-[20px] border border-danger/30 bg-danger/10 px-4 py-3 text-sm leading-7 text-danger">
					<p className="font-semibold uppercase tracking-[0.16em]">{error.code}</p>
					<p>{error.message}</p>
				</div>
			))}
			{messages.map((message) => (
				<div key={`${message.level}-${message.code}-${message.message}`} className="rounded-[20px] border border-accent/20 bg-accentSoft px-4 py-3 text-sm leading-7 text-ink">
					<p className="font-semibold uppercase tracking-[0.16em] text-accent">{message.code}</p>
					<p>{message.message}</p>
				</div>
			))}
		</div>
	);
}