import { FieldSeparator } from "@/components/ui/field";
import { Switch } from "@/components/ui/switch";
import { SettingField } from "@/components/settings-field";
import { SettingsSection } from "@/components/settings-section";

export function NotificationSettings() {
	return (
		<SettingsSection
			className="*:data-[slot=field-group]:gap-4"
			description="Choose what we email you."
			title="Notifications"
		>
			<SettingField
				description="New features and release notes."
				htmlFor="product-updates"
				label="Product updates"
			>
				<div className="flex shrink-0">
					<Switch defaultChecked id="product-updates" />
				</div>
			</SettingField>
			<FieldSeparator />
			<SettingField
				description="A Monday summary of workspace activity."
				htmlFor="weekly-digest"
				label="Weekly digest"
			>
				<div className="flex shrink-0">
					<Switch defaultChecked id="weekly-digest" />
				</div>
			</SettingField>
		</SettingsSection>
	);
}
