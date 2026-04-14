import { getFieldErrors } from "../lib/notices";
import type { BlockingError } from "../types/api";

interface FieldErrorListProps {
	errors: BlockingError[];
	field: string;
}

export function FieldErrorList({ errors, field }: FieldErrorListProps) {
	const fieldErrors = getFieldErrors(errors, field);

	if (fieldErrors.length === 0) {
		return null;
	}

	return (
		<div className="space-y-2">
			{fieldErrors.map((error) => (
				<p key={`${field}-${error.code}-${error.message}`} className="text-sm leading-7 text-danger">
					{error.message}
				</p>
			))}
		</div>
	);
}