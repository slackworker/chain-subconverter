interface TextFieldProps {
	label: string;
	helper?: string;
	placeholder: string;
	value: string;
	onChange: (value: string) => void;
	disabled?: boolean;
}

export function TextField({ label, helper, placeholder, value, onChange, disabled = false }: TextFieldProps) {
	return (
		<label className="block space-y-2">
			<div className="flex items-center justify-between gap-4">
				<span className="font-body text-sm font-semibold text-ink">{label}</span>
				{helper ? <span className="text-xs text-muted">{helper}</span> : null}
			</div>
			<input
				className="w-full rounded-[22px] border border-line bg-panel px-4 py-3 text-sm leading-6 text-ink outline-none transition focus:border-accent focus:ring-2 focus:ring-accentSoft disabled:cursor-not-allowed disabled:opacity-60"
				placeholder={placeholder}
				value={value}
				onChange={(event) => onChange(event.target.value)}
				disabled={disabled}
			/>
		</label>
	);
}