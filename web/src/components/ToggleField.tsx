interface ToggleFieldProps {
	label: string;
	description: string;
	checked: boolean;
	onChange: (checked: boolean) => void;
	disabled?: boolean;
}

export function ToggleField({ label, description, checked, onChange, disabled = false }: ToggleFieldProps) {
	return (
		<label className="flex items-start justify-between gap-4 rounded-[20px] border border-line bg-panel px-4 py-3">
			<div className="space-y-1">
				<p className="text-sm font-semibold text-ink">{label}</p>
				<p className="text-sm leading-6 text-muted">{description}</p>
			</div>
			<button
				type="button"
				disabled={disabled}
				onClick={() => onChange(!checked)}
				className={`relative mt-1 h-7 w-12 rounded-full transition ${checked ? "bg-accent" : "bg-line"} disabled:cursor-not-allowed disabled:opacity-60`}
				aria-pressed={checked}
			>
				<span
					className={`absolute top-1 h-5 w-5 rounded-full bg-white transition ${checked ? "left-6" : "left-1"}`}
				/>
			</button>
		</label>
	);
}