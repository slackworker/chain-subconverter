import { useCallback, useRef } from "react";

interface LineNumberTextareaProps {
	id: string;
	label: string;
	value: string;
	onChange: (next: string) => void;
	placeholder?: string;
	disabled?: boolean;
}

export function LineNumberTextarea({ id, label, value, onChange, placeholder, disabled }: LineNumberTextareaProps) {
	const taRef = useRef<HTMLTextAreaElement>(null);
	const gutterRef = useRef<HTMLDivElement>(null);

	const lineCount = value === "" ? 1 : value.split("\n").length;
	const gutterText = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");

	const syncScroll = useCallback(() => {
		const ta = taRef.current;
		const gutter = gutterRef.current;
		if (ta && gutter) {
			gutter.scrollTop = ta.scrollTop;
		}
	}, []);

	return (
		<div className="a-field">
			<label className="a-field-label" htmlFor={id}>
				{label}
			</label>
			<div className="a-lined-input">
				<div ref={gutterRef} className="a-lined-input__gutter" aria-hidden>
					{gutterText}
				</div>
				<textarea
					ref={taRef}
					id={id}
					className="a-lined-input__textarea"
					value={value}
					onChange={(event) => onChange(event.target.value)}
					onScroll={syncScroll}
					placeholder={placeholder}
					disabled={disabled}
					spellCheck={false}
					wrap="off"
				/>
			</div>
		</div>
	);
}
