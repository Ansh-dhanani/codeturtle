import {
	FieldDescription,
	FieldGroup,
	FieldLegend,
	FieldSet,
} from "@/components/ui/field";

export function SettingsSection({
	title,
	description,
	children,
	...props
}: React.ComponentProps<typeof FieldSet> & {
	description: string;
}) {
	return (
		<FieldSet {...props}>
			<FieldLegend className="mb-1">{title}</FieldLegend>
			<FieldDescription>{description}</FieldDescription>
			<FieldGroup className="rounded-lg border py-6">{children}</FieldGroup>
		</FieldSet>
	);
}
