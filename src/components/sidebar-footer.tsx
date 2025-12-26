"use client"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  useSidebar,
} from "@/components/ui/sidebar"
import { Avatar, AvatarFallback } from "@/components/ui/avatar"
import { ChevronsUpDown, LogOut, Settings } from "lucide-react"
import Image from "next/image"
import { useAuthStore } from "@/stores/auth-store"
import { useState } from "react"
import { toast } from "sonner"
import { Spinner } from "@/components/ui/spinner"
import { useRequireAuth } from "@/hooks/use-auth"
import Link from "next/link"
import { ThemeToggleButton, useThemeToggle } from "./ui/shadcn-io/theme-toggle-button"

export function SidebarFooterContent() {
  const user = useAuthStore((state) => state.user)
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated)
  const { isMobile } = useSidebar()
  
  const { toggle, theme: currentTheme } = useThemeToggle('top-right')
  const { signOut } = useRequireAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleThemeToggle = () => {
    toggle()
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

  // Loading state
  if (!isAuthenticated || !user) {
    return (
      <SidebarMenu>
        <SidebarMenuItem>
          <SidebarMenuButton size="lg" disabled>
            <div className="h-8 w-8 rounded-lg bg-muted animate-pulse" />
            <div className="grid flex-1 text-left text-sm leading-tight">
              <div className="h-3.5 bg-muted rounded animate-pulse mb-1" />
              <div className="h-3 bg-muted rounded w-2/3 animate-pulse" />
            </div>
          </SidebarMenuButton>
        </SidebarMenuItem>
      </SidebarMenu>
    )
  }

  return (
    <SidebarMenu>
      <SidebarMenuItem>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <SidebarMenuButton
              size="lg"
              className="data-[state=open]:bg-sidebar-accent data-[state=open]:text-sidebar-accent-foreground"
            >
              {user?.image ? (
                <Image
                  src={user.image}
                  alt={user.name || 'User'}
                  width={32}
                  height={32}
                  className="h-8 w-8 rounded-lg"
                  priority
                />
              ) : (
                <Avatar className="h-8 w-8 rounded-lg">
                  <AvatarFallback className="rounded-lg">
                    {user?.email?.[0]?.toUpperCase() || 'U'}
                  </AvatarFallback>
                </Avatar>
              )}
              <div className="grid flex-1 text-left text-sm leading-tight">
                <span className="truncate font-semibold">{user?.name || "No Name"}</span>
                <span className="truncate text-xs">{user?.email || "No Email"}</span>
              </div>
              <ChevronsUpDown className="ml-auto size-4" />
            </SidebarMenuButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent
            className="w-[--radix-dropdown-menu-trigger-width] min-w-56 rounded-lg"
            side={isMobile ? "bottom" : "top"}
            align="end"
            sideOffset={4}
          >
            <DropdownMenuItem asChild>
              <Link href="/account" className="cursor-pointer">
                <Settings />
                Account
              </Link>
            </DropdownMenuItem>
            <DropdownMenuItem onClick={handleThemeToggle} className="cursor-pointer">
              <ThemeToggleButton 
                theme={currentTheme === 'dark' ? 'dark' : 'light'} 
              />
              Theme
            </DropdownMenuItem>
            <DropdownMenuItem
              className="cursor-pointer text-red-600 focus:text-red-600 focus:bg-red-50 dark:text-red-400 dark:focus:bg-red-950"
              onClick={handleSignOut}
              disabled={isSigningOut}
            >
              {isSigningOut ? (
                <Spinner />
              ) : (
                <LogOut />
              )}
              {isSigningOut ? 'Logging out...' : 'Sign out'}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </SidebarMenuItem>
    </SidebarMenu>
  )
}