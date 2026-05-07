import { useState } from "react";

interface TagFieldProps {
	label: string;
	values: string[] | null;
	onChange: (next: string[] | null) => void;
	disabled?: boolean;
	placeholder?: string;
	removeTagAriaLabel?: (tag: string) => string;
}

export function TagField({ label, values, onChange, disabled, placeholder, removeTagAriaLabel }: TagFieldProps) {
	const [draft, setDraft] = useState("");

	const list = values ?? [];

	function commitDraft() {
		const trimmed = draft.trim();
		if (trimmed === "") {
			setDraft("");
			return;
		}
		const next = [...list, trimmed];
		onChange(next.length ? next : null);
		setDraft("");
	}

	function removeAt(index: number) {
		const next = list.filter((_, itemIndex) => itemIndex !== index);
		onChange(next.length ? next : null);
	}

	return (
		<div className="a-field">
			<span className="a-field-label">{label}</span>
			<div className={`a-tag-field ${disabled ? "a-tag-field--disabled" : ""}`}>
				<ul className="a-tag-list" aria-label={label}>
					{list.map((tag, index) => (
						<li key={`${tag}-${index}`} className="a-tag-chip">
							<span className="a-tag-chip__text">{tag}</span>
							<button
								type="button"
								className="a-tag-chip__remove"
								onClick={() => removeAt(index)}
								disabled={disabled}
								aria-label={removeTagAriaLabel ? removeTagAriaLabel(tag) : `移除 ${tag}`}
							>
								×
							</button>
						</li>
					))}
				</ul>
				<input
					className="a-tag-field__input"
					value={draft}
					onChange={(event) => setDraft(event.target.value)}
					onKeyDown={(event) => {
						if (event.key === "Enter") {
							event.preventDefault();
							commitDraft();
						}
					}}
					onBlur={commitDraft}
					disabled={disabled}
					placeholder={placeholder}
				/>
			</div>
		</div>
	);
}
