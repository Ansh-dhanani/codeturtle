import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'


interface GithubAccount {
  id: string
  providerId: string
  accountId: string
}


export const githubKeys = {
  account: ['github', 'account'] as const,
}


export function useGithubAccount() {
  return useQuery({
    queryKey: githubKeys.account,
    queryFn: async (): Promise<GithubAccount | null> => {
      const res = await fetch('/api/user/github-account')
      if (!res.ok) {
        if (res.status === 404) return null
        throw new Error('Failed to check GitHub account')
      }
      return res.json()
    },
    staleTime: 5 * 60 * 1000,
    placeholderData: (previousData) => previousData,
  })
}
