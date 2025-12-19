'use client'
import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { authClient } from '@/features/auth'
import { useAuthStore } from '@/stores/auth-store'
export function useAuth() {
  const session = authClient.useSession()
  const router = useRouter()
  const [isLoading, setIsLoading] = useState(true)
  const { setUser, clearUser } = useAuthStore()
  useEffect(() => {
    if (session.data) {
      setUser(session.data.user)
    } else {
      clearUser()
    }
    if (session.data !== undefined) {
      setIsLoading(false)
    }
  }, [session.data, setUser, clearUser])
  const signOut = async () => {
    try {
      await authClient.signOut()
      clearUser()
      router.push('/login')
    } catch (error) {
      console.error('Sign out error:', error)
      throw error
    }
  }
  return {
    session: session.data,
    isLoading,
    isAuthenticated: !!session.data,
    signOut,
  }
}
export function useRequireAuth() {
  const { session, isLoading, signOut } = useAuth()
  const router = useRouter()
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])
  useEffect(() => {
    if (isMounted && !isLoading && !session) {
      router.push('/login')
    }
  }, [isMounted, isLoading, session, router])
  return { session, isLoading: isLoading || !isMounted, signOut }
}
export function useRedirectIfAuthenticated(redirectTo: string = '/dashboard') {
  const { session, isLoading } = useAuth()
  const router = useRouter()
  const [isMounted, setIsMounted] = useState(false)
  useEffect(() => {
    setIsMounted(true)
  }, [])
  useEffect(() => {
    if (isMounted && !isLoading && session) {
      router.push(redirectTo)
    }
  }, [isMounted, isLoading, session, router, redirectTo])
  return { isLoading: isLoading || !isMounted }
}
