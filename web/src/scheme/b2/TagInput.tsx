import { useState } from "react";
import type { ColorMode } from "./theme";
import { isDark, textInput } from "./theme";

interface TagInputProps {
	tags: string[];
	onChange: (tags: string[]) => void;
	colorMode: ColorMode;
	placeholder?: string;
}

export function TagInput({ tags, onChange, colorMode, placeholder }: TagInputProps) {
	const [input, setInput] = useState("");
	const dark = isDark(colorMode);

	const handleAdd = () => {
		const val = input.trim();
		if (val && !tags.includes(val)) {
			onChange([...tags, val]);
			setInput("");
		}
	};

	const handleRemove = (tag: string) => {
		onChange(tags.filter((t) => t !== tag));
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-2">
				<input
					className={`${textInput(colorMode)} flex-1`}
					value={input}
					onChange={(e) => setInput(e.target.value)}
					onKeyDown={(e) => e.key === "Enter" && handleAdd()}
					placeholder={placeholder}
				/>
				<button
					type="button"
					onClick={handleAdd}
					className={`px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors ${
						dark ? "bg-zinc-800 hover:bg-zinc-700 text-zinc-300" : "bg-slate-200 hover:bg-slate-300 text-slate-700"
					}`}
				>
					添加
				</button>
			</div>
			{tags.length > 0 ? (
				<div className="flex flex-wrap gap-2 mt-1">
					{tags.map((tag) => (
						<div
							key={tag}
							className="flex items-center gap-1.5 text-xs px-2.5 py-1 bg-indigo-500/10 text-indigo-400 rounded-lg border border-indigo-500/20 font-mono"
						>
							<span>{tag}</span>
							<button type="button" onClick={() => handleRemove(tag)} className="hover:text-red-400 font-bold transition-colors">
								&times;
							</button>
						</div>
					))}
				</div>
			) : null}
		</div>
	);
}
