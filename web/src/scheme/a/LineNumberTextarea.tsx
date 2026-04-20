import { useCallback, useRef, type ReactNode } from "react";

interface LineNumberTextareaProps {
	id: string;
	label: string;
	value: string;
	onChange: (next: string) => void;
	placeholder?: string;
	disabled?: boolean;
	labelAction?: ReactNode;
	bottomLeftContent?: ReactNode;
}

export function LineNumberTextarea({
	id,
	label,
	value,
	onChange,
	placeholder,
	disabled,
	labelAction,
	bottomLeftContent,
}: LineNumberTextareaProps) {
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
			<div className="a-field-label-row">
				<label className="a-field-label" htmlFor={id}>
					{label}
				</label>
				{labelAction ? <div className="a-field-label-action">{labelAction}</div> : null}
			</div>
			<div className="a-lined-input-wrap">
				<div className={`a-lined-input ${bottomLeftContent ? "a-lined-input--with-bottom" : ""}`}>
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
				{bottomLeftContent ? <div className="a-lined-input__bottom-left">{bottomLeftContent}</div> : null}
			</div>
		</div>
	);
}
