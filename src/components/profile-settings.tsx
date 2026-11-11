"use client";

import { useState } from "react";
import {
  Avatar,
  AvatarFallback,
  AvatarImage,
} from "@/components/ui/avatar";
import { FieldSeparator } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { SettingField } from "@/components/settings-field";
import { SettingsSection } from "@/components/settings-section";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { getUserProfile, updateUserProfile } from "@/module/settings/actions";
import { toast } from "sonner";

export function ProfileSettings({
  name: initialName,
  email,
  image,
}: {
  name: string;
  email: string;
  image?: string | null;
}) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ["userProfile"],
    queryFn: getUserProfile,
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  // Uncontrolled-ish: edited state wins until first successful save/refetch
  const [edited, setEdited] = useState<string | null>(null);
  const name = edited ?? data?.name ?? initialName;
  const setName = (value: string) => setEdited(value);

  const updateMutation = useMutation({
    mutationFn: async (newData: { name: string }) =>
      await updateUserProfile(newData),
    onSuccess: (result) => {
      if (result?.success) {
        queryClient.invalidateQueries({ queryKey: ["userProfile"] });
        toast.success("Profile updated successfully");
      } else {
        toast.error("Failed to update profile");
      }
    },
    onError: () => {
      toast.error("Failed to update profile");
    },
  });

  return (
    <SettingsSection
      description="How you appear to teammates and collaborators."
      title="Profile"
    >
      <SettingField
        label="Avatar"
        description="GitHub avatar used in reviews, comments, and the sidebar."
        htmlFor="avatar"
      >
        <div className="flex shrink-0">
          <Avatar className="size-12">
            {image ? <AvatarImage alt={name} src={image} /> : null}
            <AvatarFallback>
              {(data?.name || initialName)?.[0]?.toUpperCase() || "U"}
            </AvatarFallback>
          </Avatar>
        </div>
      </SettingField>

      <FieldSeparator />

      <SettingField
        label="Display name"
        description="Public name shown on reviews and comments."
        htmlFor="display-name"
      >
        <Input
          id="display-name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onBlur={() => {
            const trimmed = name.trim();
            if (trimmed && trimmed !== data?.name) {
              updateMutation.mutate({ name: trimmed });
            }
          }}
          disabled={isLoading || updateMutation.isPending}
          placeholder="Your name"
        />
      </SettingField>

      <FieldSeparator />

      <SettingField
        label="Email"
        description="Sign-in and notification emails go here."
        htmlFor="email"
      >
        <Input id="email" type="email" value={email} disabled />
      </SettingField>
    </SettingsSection>
  );
}
