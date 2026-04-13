interface TextAreaFieldProps {
	label: string;
	helper: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

export function TextAreaField({ label, helper, placeholder, value, onChange, disabled = false }: TextAreaFieldProps) {
	return (
		<label className="block space-y-2">
			<div className="flex items-center justify-between gap-4">
				<span className="font-body text-sm font-semibold text-ink">{label}</span>
				<span className="text-xs text-muted">{helper}</span>
			</div>
			<textarea
				className="min-h-36 w-full rounded-[22px] border border-line bg-panel px-4 py-3 font-mono text-sm leading-6 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft disabled:cursor-not-allowed disabled:opacity-60"
				placeholder={placeholder}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				disabled={disabled}
			/>
		</label>
	);
	}