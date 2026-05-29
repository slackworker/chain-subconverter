import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

interface LineNumberTextareaProps {
	id: string;
	label: string;
	value: string;
	onChange: (next: string) => void;
	placeholder?: string;
	disabled?: boolean;
	labelAction?: ReactNode;
	bottomContent?: ReactNode;
	hasError?: boolean;
	errorText?: string;
}

export function LineNumberTextarea({
	id,
	label,
	value,
	onChange,
	placeholder,
	disabled,
	labelAction,
	bottomContent,
	hasError,
	errorText,
}: LineNumberTextareaProps) {
	const taRef = useRef<HTMLTextAreaElement>(null);
	const gutterRef = useRef<HTMLDivElement>(null);

	const lineCount = value === "" ? 1 : value.split("\n").length;
	const gutterText = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");

	const adjustLayout = useCallback(() => {
		const ta = taRef.current;
		const gutter = gutterRef.current;
		const shell = ta?.closest<HTMLElement>(".c-lined-input");
		if (!ta || !gutter || !shell) {
			return;
		}

		const gutterWidth = gutter.offsetWidth;
		const minContentWidth = Math.max(shell.clientWidth - gutterWidth, 0);
		ta.style.width = `${minContentWidth}px`;
		if (value !== "") {
			ta.style.width = `${Math.max(minContentWidth, ta.scrollWidth)}px`;
		}

		gutter.style.height = "";
		ta.style.height = "";
	}, [lineCount, value]);

	useLayoutEffect(() => {
		adjustLayout();
	}, [adjustLayout]);

	useLayoutEffect(() => {
		const ta = taRef.current;
		const shell = ta?.closest<HTMLElement>(".c-lined-input");
		if (!ta || !shell) {
			return;
		}
		const observer = new ResizeObserver(() => {
			adjustLayout();
		});
		observer.observe(ta);
		observer.observe(shell);
		return () => observer.disconnect();
	}, [adjustLayout]);

	return (
		<div className="c-field">
			<div className="c-field-label-row">
				<label htmlFor={id}>{label}</label>
				{labelAction}
			</div>
			<div className={`c-lined-input${hasError ? " c-lined-input--error" : ""}`}>
				<div ref={gutterRef} className="c-lined-input__gutter c-mono" aria-hidden="true">
					{gutterText}
				</div>
				<textarea
					ref={taRef}
					id={id}
					wrap="off"
					rows={9}
					value={value}
					disabled={disabled}
					onChange={(event) => onChange(event.target.value)}
					onScroll={(event) => {
						if (gutterRef.current) {
							gutterRef.current.scrollTop = event.currentTarget.scrollTop;
						}
					}}
					placeholder={placeholder}
					className="c-lined-input__textarea c-mono"
					aria-invalid={hasError ? true : undefined}
				/>
			</div>
			{bottomContent}
			{errorText ? <p className="c-field-error">{errorText}</p> : null}
		</div>
	);
}
