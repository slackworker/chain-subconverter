import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";

interface LineNumberTextareaProps {
	id: string;
	label: string;
	value: string;
	onChange: (next: string) => void;
	placeholder?: string;
	disabled?: boolean;
	labelAction?: ReactNode;
	bottomLeftContent?: ReactNode;
	hasError?: boolean;
	errorId?: string;
	errorText?: string;
	localErrorAriaHint?: string;
}

const LOCAL_ERROR_ARIA_HINT = "该位置存在错误，请查看当前阶段反馈条。";

export function LineNumberTextarea({
	id,
	label,
	value,
	onChange,
	placeholder,
	disabled,
	labelAction,
	bottomLeftContent,
	hasError,
	errorId,
	errorText,
	localErrorAriaHint,
}: LineNumberTextareaProps) {
	const taRef = useRef<HTMLTextAreaElement>(null);
	const gutterRef = useRef<HTMLDivElement>(null);

	const lineCount = value === "" ? 1 : value.split("\n").length;
	const gutterText = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");

	const adjustLayout = useCallback(() => {
		const ta = taRef.current;
		const gutter = gutterRef.current;
		const shell = ta?.closest<HTMLElement>(".a-lined-input");
		if (!ta || !gutter || !shell) {
			return;
		}

		const gutterWidth = gutter.offsetWidth;
		const minContentWidth = Math.max(shell.clientWidth - gutterWidth, 0);
		ta.style.width = `${minContentWidth}px`;
		ta.style.width = `${Math.max(minContentWidth, ta.scrollWidth)}px`;

		gutter.style.height = "";
		ta.style.height = "";
	}, [lineCount, value]);

	useLayoutEffect(() => {
		adjustLayout();
	}, [adjustLayout]);

	useLayoutEffect(() => {
		const ta = taRef.current;
		const shell = ta?.closest<HTMLElement>(".a-lined-input");
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
		<div className="a-field">
			<div className="a-field-label-row">
				<label className="a-field-label" htmlFor={id}>
					{label}
				</label>
				{labelAction ? <div className="a-field-label-action">{labelAction}</div> : null}
			</div>
			<div className="a-lined-input-wrap">
				<div className={`a-lined-input ${bottomLeftContent ? "a-lined-input--with-bottom" : ""} ${hasError ? "a-lined-input--error" : ""}`}>
					<div ref={gutterRef} className="a-lined-input__gutter" aria-hidden>
						{gutterText}
					</div>
					<textarea
						ref={taRef}
						id={id}
						className="a-lined-input__textarea"
						rows={lineCount}
						value={value}
						onChange={(event) => onChange(event.target.value)}
						placeholder={placeholder}
						disabled={disabled}
						spellCheck={false}
						wrap="off"
						aria-invalid={hasError ? true : undefined}
						aria-describedby={hasError && errorId ? errorId : undefined}
					/>
				</div>
				{bottomLeftContent ? <div className="a-lined-input__bottom-left">{bottomLeftContent}</div> : null}
				{hasError && errorId ? (
					<p id={errorId} className="a-sr-only" role="status">
						{localErrorAriaHint ?? LOCAL_ERROR_ARIA_HINT}
					</p>
				) : null}
			</div>
		</div>
	);
}
