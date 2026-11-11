import { cn } from "@/lib/utils";
import {
	Field,
	FieldContent,
	FieldDescription,
	FieldLabel,
} from "@/components/ui/field";

export function SettingField({
	label,
	description,
	htmlFor,
	children,
	className,
	...props
}: React.ComponentProps<typeof Field> & {
	label: string;
	description?: string;
	htmlFor: string;
	children: React.ReactNode;
	className?: string;
}) {
	return (
		<Field
			className={cn(
				"px-4 @md/field-group:has-[>[data-slot=field-content]]:items-center",
				className
			)}
			orientation="responsive"
			{...props}
		>
			<FieldContent>
				<FieldLabel htmlFor={htmlFor}>{label}</FieldLabel>
				{description && <FieldDescription>{description} </FieldDescription>}
			</FieldContent>
			{children}
		</Field>
	);
}
