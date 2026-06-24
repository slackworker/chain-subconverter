import { forwardRef, useImperativeHandle, useRef, useState } from "react";

import { tryAppendTag, type AppendTagResult } from "../../lib/tags";

export type TagFieldRejectReason = "duplicate" | "invalid";

export type TagFieldReject = {
	reason: TagFieldRejectReason;
	tag?: string;
	message?: string;
};

export type TagFieldFlushResult =
	| { kind: "unchanged"; reason: "empty" }
	| { kind: "rejected"; reason: TagFieldRejectReason; tag?: string; message?: string }
	| { kind: "committed"; next: string[] | null };

export type TagFieldHandle = {
	flushDraft: () => TagFieldFlushResult;
};

interface TagFieldProps {
	label: string;
	values: string[] | null;
	onChange: (next: string[] | null) => void;
	disabled?: boolean;
	placeholder?: string;
	addLabel?: string;
	removeTagAriaLabel?: (tag: string) => string;
	autoNormalizeFullWidthColon?: boolean;
	/** 与列表内已有项、{@link existingTags} 比较时的规范化（如端口转发 server:port）。 */
	formatTag?: (raw: string) => string;
	/** 已提交到表单其它处的标签（如 modal 草稿对比 stage1 已有端口转发）。 */
	existingTags?: readonly string[];
	onReject?: (reject: TagFieldReject) => void;
}

function rejectFromAppend(result: Extract<AppendTagResult, { ok: false }>): TagFieldReject | null {
	if (result.reason === "empty") {
		return null;
	}
	if (result.reason === "duplicate") {
		return { reason: "duplicate", tag: result.tag };
	}
	return { reason: "invalid", message: result.message };
}

function flushFromAppend(result: AppendTagResult): TagFieldFlushResult {
	if (result.ok) {
		return { kind: "committed", next: result.next.length ? result.next : null };
	}
	if (result.reason === "empty") {
		return { kind: "unchanged", reason: "empty" };
	}
	const reject = rejectFromAppend(result);
	return reject
		? { kind: "rejected", reason: reject.reason, tag: reject.tag, message: reject.message }
		: { kind: "unchanged", reason: "empty" };
}

export const TagField = forwardRef<TagFieldHandle, TagFieldProps>(function TagField(
	{
		label,
		values,
		onChange,
		disabled,
		placeholder,
		addLabel = "添加",
		removeTagAriaLabel,
		autoNormalizeFullWidthColon = false,
		formatTag,
		existingTags,
		onReject,
	},
	ref,
) {
	const [draft, setDraft] = useState("");
	const isComposingRef = useRef(false);

	const list = values ?? [];

	function applyAppend(trimmed: string): TagFieldFlushResult {
		const result = tryAppendTag(trimmed, list, existingTags ?? [], formatTag);
		if (result.ok) {
			onChange(result.next.length ? result.next : null);
			setDraft("");
			return { kind: "committed", next: result.next.length ? result.next : null };
		}
		const reject = rejectFromAppend(result);
		if (reject) {
			setDraft("");
			onReject?.(reject);
			return {
				kind: "rejected",
				reason: reject.reason,
				tag: reject.tag,
				message: reject.message,
			};
		}
		return { kind: "unchanged", reason: "empty" };
	}

	useImperativeHandle(ref, () => ({
		flushDraft: () => applyAppend(draft.trim()),
	}));

	function commitDraft() {
		applyAppend(draft.trim());
	}

	function removeAt(index: number) {
		const next = list.filter((_, itemIndex) => itemIndex !== index);
		onChange(next.length ? next : null);
	}

	return (
		<div className="a-field">
			<span className="a-field-label">{label}</span>
			<div className={`a-tag-field ${disabled ? "a-tag-field--disabled" : ""}`}>
				<div className="a-tag-input-row">
					<input
						className="a-input a-tag-field__input"
						value={draft}
						onChange={(event) => {
							const nextValue = event.target.value;
							// 中文输入法组合输入期间不要改值，避免重复字符（如 "：" 变 "::"）。
							if (isComposingRef.current) {
								setDraft(nextValue);
								return;
							}
							setDraft(
								autoNormalizeFullWidthColon
									? nextValue.split("：").join(":")
									: nextValue,
							);
						}}
						onCompositionStart={() => {
							isComposingRef.current = true;
						}}
						onCompositionEnd={(event) => {
							isComposingRef.current = false;
							const composedValue = event.currentTarget.value;
							setDraft(
								autoNormalizeFullWidthColon
									? composedValue.split("：").join(":")
									: composedValue,
							);
						}}
						onKeyDown={(event) => {
							if (event.key === "Enter") {
								event.preventDefault();
								commitDraft();
							}
						}}
						disabled={disabled}
						placeholder={placeholder}
					/>
					<button
						type="button"
						className="a-btn a-btn--secondary a-btn--compact a-tag-field__add"
						onClick={commitDraft}
						disabled={disabled}
					>
						{addLabel}
					</button>
				</div>
				{list.length > 0 ? (
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
				) : null}
			</div>
		</div>
	);
});
