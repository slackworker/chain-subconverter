import { useState } from "react";

interface TagInputProps {
	tags: string[];
	onChange: (tags: string[]) => void;
	placeholder?: string;
}

export function TagInput({ tags, onChange, placeholder }: TagInputProps) {
	const [input, setInput] = useState("");

	const handleAdd = () => {
		const val = input.trim();
		if (val && !tags.includes(val)) {
			onChange([...tags, val]);
			setInput("");
		}
	};

	const handleRemove = (tag: string) => {
		onChange(tags.filter(t => t !== tag));
	};

	return (
		<div className="flex flex-col gap-2">
			<div className="flex gap-2">
				<input
					className="bg-zinc-950 border border-zinc-800 rounded-lg p-2 text-zinc-200 flex-1 text-sm placeholder-zinc-600 focus:outline-none focus:border-indigo-500 transition-colors"
					value={input}
					onChange={e => setInput(e.target.value)}
					onKeyDown={e => e.key === "Enter" && handleAdd()}
					placeholder={placeholder}
				/>
				<button 
					onClick={handleAdd}
					className="bg-zinc-800 hover:bg-zinc-700 text-zinc-300 px-3 py-1.5 rounded-lg text-sm transition-colors"
				>
					添加
				</button>
			</div>
			{tags.length > 0 && (
				<div className="flex flex-wrap gap-2 mt-1">
					{tags.map(tag => (
						<div key={tag} className="flex items-center gap-1.5 bg-indigo-500/10 text-indigo-300 px-2 py-1 rounded text-xs border border-indigo-500/20">
							<span>{tag}</span>
							<button onClick={() => handleRemove(tag)} className="hover:text-white transition-colors">&times;</button>
						</div>
					))}
				</div>
			)}
		</div>
	);
}
