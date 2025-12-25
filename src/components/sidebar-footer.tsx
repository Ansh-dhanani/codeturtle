"use client"

import { memo } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import {
  Bell,
  ChevronsUpDown,
  CreditCard,
  Github,
  LogOut,
  Settings,
  Sparkles,
  Unlink,
} from "lucide-react"
import Image from "next/image"
import { useAuthStore } from "@/stores/auth-store"
import { useGithubAccount, useUnlinkGithubAccount } from "@/stores/github-store"
import { useState } from "react"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { useRequireAuth } from "@/hooks/use-auth"
import Link from "next/link"
import { ThemeToggleButton, useThemeToggle } from "./ui/shadcn-io/theme-toggle-button"

export const SidebarFooterContent = memo(function SidebarFooterContent() {
    const user = useAuthStore((state) => state.user)
    const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
    const avatarFallback = user?.email?.[0]?.toUpperCase() || 'U'

    const { toggle, theme: currentTheme } = useThemeToggle('top-right')
  
  const { signOut } = useRequireAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  
  const { data: githubAccount, isLoading: githubLoading } = useGithubAccount()
  const unlinkGithub = useUnlinkGithubAccount()

  const handleThemeToggle = toggle

  // Show loading state if user data is not yet available
  if (!isAuthenticated || !user) {
    return (
      <div className="mt-auto border-t p-1 py-2">
        <div className="flex items-center gap-2 px-2 py-2">
          <div className="h-7 w-7 rounded-full bg-muted animate-pulse" />
          <div className="flex-1 space-y-1">
            <div className="h-3 bg-muted rounded animate-pulse" />
            <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
          </div>
        </div>
      </div>
    )
  }

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
  return (
    <div className="mt-auto border-t p-1 py-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            variant="ghost"
            className="h-12 w-full justify-start gap-2 px-2"
          >
            {user?.image ? (
              <Image
                src={user.image}
                alt={user.name || 'UR'}
                width={28}
                height={28}
                className="h-7 w-7 rounded-full object-cover"
              />
            ) : (
              <Avatar className="h-7 w-7">
                <AvatarFallback>{user?.email?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
              </Avatar>
            )}

            <div className="flex min-w-0 flex-col items-start leading-tight">
              <span className="truncate text-sm font-medium">
                {user?.name || "No Name"}
              </span>
              <span className="truncate text-xs text-muted-foreground">
                {user?.email || "No Email"}
              </span>
            </div>
            <ChevronsUpDown className="ml-auto h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent
          side="right"
          align="end"
          className="w-56"
        >
          <DropdownMenuLabel className="p-3">
            <div className="flex gap-3">
              {user?.image ? (
                <Image
                  src={user.image}
                  alt={user.name || 'User avatar'}
                  width={36}
                  height={36}
                  className="h-9 w-9 rounded-full object-cover"
                />
              ) : (
                <Avatar className="h-9 w-9">
                  <AvatarFallback>{user?.email?.[0]?.toUpperCase() || 'U'}</AvatarFallback>
                </Avatar>
              )}
              <div className="leading-tight flex-1">
                <p className="text-sm font-medium">{user?.name || "No Name"}</p>
                <p className="text-xs text-muted-foreground">
                  {user?.email || "No Email"}
                </p>
              </div>
            </div>
          </DropdownMenuLabel>

          <DropdownMenuSeparator />

          <DropdownMenuItem>
            <Settings className="mr-2 h-4 w-4" />
            <Link href="/account">Account</Link>
          </DropdownMenuItem>

          <DropdownMenuItem onClick={handleThemeToggle}>
            <ThemeToggleButton theme={currentTheme === 'dark' ? 'dark' : 'light'} className="mr-2 h-4 w-4"/>
            <span>Theme</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

          <DropdownMenuItem
            className="text-red-500"
            onClick={handleSignOut}
            disabled={isSigningOut}
          >
            {isSigningOut ? (
              <Spinner className="mr-2 h-4 w-4" />
            ) : (
              <LogOut className="mr-2 h-4 w-4" />
            )}
            {isSigningOut ? 'Logging out...' : 'Log out'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
})
