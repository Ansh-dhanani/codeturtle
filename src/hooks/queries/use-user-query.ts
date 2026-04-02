'use client'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
interface User {
  id: string
  email: string
  name: string
  image: string | null
  emailVerified: boolean
}
export function useUserQuery() {
  return useQuery({
    queryKey: ['user'],
    queryFn: async () => {
      const res = await fetch('/api/user')
      if (!res.ok) throw new Error('Failed to fetch user')
      return res.json() as Promise<User>
    },
  })
}
export function useUpdateAvatarMutation() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: async () => {
      const res = await fetch('/api/user/update-avatar', {
        method: 'POST',
      })
      if (!res.ok) throw new Error('Failed to update avatar')
      return res.json()
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['user'] })
    },
  })
}
