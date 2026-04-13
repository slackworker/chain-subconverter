import { useMemo, useState } from "react";

interface TextAreaFieldProps {
	label: string;
	helper: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

export function TextAreaField({ label, helper, placeholder, value, onChange, disabled = false }: TextAreaFieldProps) {
	const [scrollTop, setScrollTop] = useState(0);
	const lineNumbers = useMemo(() => {
		const valueLines = value === "" ? 1 : value.split(/\r\n|\r|\n/).length;
		const placeholderLines = placeholder === "" ? 1 : placeholder.split(/\r\n|\r|\n/).length;
		const lineCount = Math.max(6, valueLines, placeholderLines);
		return Array.from({ length: lineCount }, (_, index) => index + 1);
	}, [placeholder, value]);

	return (
		<label className="block space-y-2">
			<div className="flex items-center justify-between gap-4">
				<span className="font-body text-sm font-semibold text-ink">{label}</span>
				<span className="text-xs text-muted">{helper}</span>
			</div>
			<div className="relative overflow-hidden rounded-[22px] border border-line bg-panel transition focus-within:border-accent focus-within:ring-2 focus-within:ring-accentSoft">
				<div className="pointer-events-none absolute inset-y-0 left-0 w-14 overflow-hidden border-r border-line bg-surface/80 px-2 py-3 font-mono text-right text-xs leading-6 text-muted">
					<div style={{ transform: `translateY(-${scrollTop}px)` }}>
						{lineNumbers.map((lineNumber) => (
							<div key={lineNumber}>{lineNumber}</div>
						))}
					</div>
				</div>
				<textarea
					className="min-h-36 w-full resize-y overflow-x-auto overflow-y-auto bg-transparent py-3 pl-16 pr-4 font-mono text-sm leading-6 text-ink outline-none disabled:cursor-not-allowed disabled:opacity-60"
					placeholder={placeholder}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					onScroll={(event) => setScrollTop(event.currentTarget.scrollTop)}
					disabled={disabled}
					wrap="off"
					spellCheck={false}
				/>
			</div>
		</label>
	);
}