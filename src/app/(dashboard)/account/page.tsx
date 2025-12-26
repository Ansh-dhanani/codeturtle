'use client'
import { useRequireAuth } from '@/hooks/use-auth'
import { useAuthStore } from '@/stores/auth-store'
import { Button } from '@/components/ui/button'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import Image from 'next/image'
import { useState, useEffect } from 'react'
import { toast } from 'sonner'
import { Spinner } from '@/components/ui/spinner'
export default function AccountPage() {
  const { session, isLoading, signOut } = useRequireAuth()
  const user = useAuthStore((state) => state.user)
  const [isSigningOut, setIsSigningOut] = useState(false)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setMounted(true)
  }, [])
  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await signOut()
      toast.success('Successfully logged out')
    } catch (error) {
      console.error('Failed to sign out:', error)
      toast.error('Failed to log out. Please try again.')
      setIsSigningOut(false)
    }
  }
  if (!mounted || isLoading) {
    return (
      <div className="container w-full flex items-center justify-center min-h-screen w-full">
        <Spinner />
      </div>
    )
  }
  if (!session) {
    return null
  }
  const displayUser = user || session.user
  const avatarFallback = displayUser.email?.[0]?.toUpperCase() || 'U'
  return (
    <div className="container mx-auto ">
        <h1 className="text-3xl font-bold mb-8">Account</h1>
        <div className="bg-card rounded-lg border p-6 space-y-6">
          <div className="flex items-center gap-4">
            {displayUser.image ? (
              <Image
                src={displayUser.image}
                alt={displayUser.name || 'User avatar'}
                width={80}
                height={80}
                className="rounded-full"
              />
            ) : (
              <Avatar className="h-20 w-20">
                <AvatarFallback className="text-2xl">
                  {avatarFallback}
                </AvatarFallback>
              </Avatar>
            )}
            <div className="flex-1">
              <h2 className="text-2xl font-semibold">{displayUser.name}</h2>
              <p className="text-muted-foreground">{displayUser.email}</p>
            </div>
          </div>
          <div className="flex gap-4 flex-wrap">
            <Button 
              variant="destructive" 
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <>
                  <Spinner/>
                  Logging out...
                </>
              ) : (
                'Logout'
              )}
            </Button>
          </div>
        </div>
      </div>
  )
}
