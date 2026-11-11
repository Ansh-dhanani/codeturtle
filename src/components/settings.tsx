import { NotificationSettings } from "@/components/notification-settings";
import { ProfileSettings } from "@/components/profile-settings";

export function Settings({
  name,
  email,
  image,
}: {
  name: string;
  email: string;
  image?: string | null;
}) {
  return (
    <div className="flex flex-1 flex-col gap-6">
      <ProfileSettings name={name} email={email} image={image} />
      <NotificationSettings />
    </div>
  );
}
