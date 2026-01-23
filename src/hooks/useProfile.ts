import React from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { getUserProfile, updateUserProfile } from '@/module/settings/actions'
import { useForm } from '@/hooks/useForm'
import { validateData, commonSchemas } from '@/lib/validation'
import { toast } from 'sonner'

interface ProfileData extends Record<string, unknown> {
  name: string
}

const PROFILE_QUERY_KEY = ['userProfile']

export function useProfile() {
  const queryClient = useQueryClient()

  const { data, isLoading, error, refetch } = useQuery({
    queryKey: PROFILE_QUERY_KEY,
    queryFn: getUserProfile,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnWindowFocus: false,
    retry: 2,
  })

  const form = useForm<ProfileData>({
    initialData: { name: data?.name || '' },
    validate: (data) => validateData(data, { name: commonSchemas.name }),
    onSubmit: async (formData) => {
      const result = await updateUserProfile(formData)
      if (!result?.success) {
        throw new Error('Failed to update profile')
      }
      return result
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: PROFILE_QUERY_KEY })
      toast.success('Profile updated successfully')
    },
    onError: (error) => {
      console.error('Profile update error:', error)
      toast.error(error.message || 'Failed to update profile. Please try again.')
    },
  })

  // Update form data when profile data loads
  React.useEffect(() => {
    if (data?.name && form.data.name === '') {
      form.setData({ name: data.name })
    }
  }, [data?.name, form])

  return {
    profile: data,
    isLoading,
    error,
    refetch,
    form,
    isFormChanged: form.isDirty,
  }
}