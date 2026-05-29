import { useCallback, useLayoutEffect, useRef, type ReactNode } from "react";
import type { ColorMode } from "./theme";
import { fieldLabel, monoFieldShell, monoGutter, monoTextarea } from "./theme";

interface LineNumberTextareaProps {
	id: string;
	label: string;
	value: string;
	onChange: (next: string) => void;
	colorMode: ColorMode;
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
	colorMode,
	placeholder,
	disabled,
	labelAction,
	bottomContent,
	hasError,
	errorText,
}: LineNumberTextareaProps) {
	const taRef = useRef<HTMLTextAreaElement>(null);
	const gutterRef = useRef<HTMLDivElement>(null);
	const shellRef = useRef<HTMLDivElement>(null);

	const lineCount = value === "" ? 1 : value.split("\n").length;
	const gutterText = Array.from({ length: lineCount }, (_, index) => String(index + 1)).join("\n");

	const adjustLayout = useCallback(() => {
		const ta = taRef.current;
		const gutter = gutterRef.current;
		const shell = shellRef.current;
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
		const height = Math.max(ta.scrollHeight, gutter.scrollHeight);
		ta.style.height = `${height}px`;
		gutter.style.height = `${height}px`;
	}, [value]);

	useLayoutEffect(() => {
		adjustLayout();
	}, [adjustLayout, lineCount]);

	useLayoutEffect(() => {
		const shell = shellRef.current;
		if (!shell) {
			return undefined;
		}
		const observer = new ResizeObserver(() => adjustLayout());
		observer.observe(shell);
		return () => observer.disconnect();
	}, [adjustLayout]);

	return (
		<div className="flex w-full min-w-0 flex-col gap-2">
			<div className="flex justify-between items-center">
				<label className={fieldLabel(colorMode)} htmlFor={id}>
					{label}
				</label>
				{labelAction}
			</div>
			<div ref={shellRef} className={monoFieldShell(colorMode, hasError)}>
				<div ref={gutterRef} className={monoGutter(colorMode)} aria-hidden>
					<pre className="m-0 whitespace-pre">{gutterText}</pre>
				</div>
				<textarea
					ref={taRef}
					id={id}
					className={monoTextarea(colorMode)}
					value={value}
					onChange={(event) => onChange(event.target.value)}
					placeholder={placeholder}
					disabled={disabled}
					spellCheck={false}
					wrap="off"
				/>
			</div>
			{bottomContent}
			{errorText ? <span className="text-xs text-red-400 font-semibold">{errorText}</span> : null}
		</div>
	);
}
