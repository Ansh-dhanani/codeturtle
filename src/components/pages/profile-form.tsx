'use client'
import React from 'react'
import {
  Card, CardContent, CardHeader, CardTitle, CardDescription
} from '@/components/ui/card'
import { FormField } from '@/components/ui/form-field'
import { SubmitButton } from '@/components/ui/submit-button'
import { useProfile } from '@/hooks/useProfile'
import { AlertCircle } from 'lucide-react'

const ProfileForm: React.FC = () => {
  const { isLoading, error, form, isFormChanged } = useProfile()

  if (error) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="flex items-center justify-center space-x-2 text-destructive">
            <AlertCircle className="h-5 w-5" />
            <span>Failed to load profile data. Please try refreshing the page.</span>
          </div>
        </CardContent>
      </Card>
    )
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Profile Settings</CardTitle>
        <CardDescription>
          Update your profile information to personalize your experience.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={form.handleSubmit} className="space-y-6">
          <FormField
            label="Full Name"
            name="name"
            type="text"
            value={form.data.name}
            onChange={(value) => form.setValue('name', value)}
            error={form.errors.name}
            placeholder={isLoading ? 'Loading...' : 'Enter your full name'}
            disabled={isLoading || form.isSubmitting}
            required
            minLength={1}
            maxLength={100}
          />

          <div className="flex justify-end">
            <SubmitButton
              isSubmitting={form.isSubmitting}
              disabled={!isFormChanged}
              loadingText="Updating profile..."
              className="min-w-[140px]"
            >
              Update Profile
            </SubmitButton>
          </div>
        </form>
      </CardContent>
    </Card>
  )
}

export default ProfileForm