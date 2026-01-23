"use client"

import React, { useCallback, useEffect, useState } from "react"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Menu } from "lucide-react"
import { useRequireAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/stores/auth-store"
import { toast } from "sonner"
import { useSidebar } from "@/components/ui/sidebar"
import { Breadcrumbs } from "@/components/ui/shared/Breadcrumbs"
import { SignOutButton } from "@/components/ui/shared/SignOutButton"

interface NavbarProps {
  /** Show the mobile menu toggle (hamburger) */
  showMenu?: boolean
  /** Whether breadcrumbs should be shown */
  showBreadcrumbs?: boolean
  /** Breakpoint in px for mobile behavior */
  breakpoint?: number
  className?: string
  /** Optional override for sign-out handler */
  onSignOut?: () => Promise<void> | void
}

/**
 * Render the top navigation bar with optional mobile menu, breadcrumbs, and sign-out control.
 *
 * @param showMenu - When true, display a menu button on viewports narrower than `breakpoint`.
 * @param showBreadcrumbs - When true, display breadcrumb navigation derived from the current pathname.
 * @param breakpoint - Width in pixels below which the component considers the viewport "mobile".
 * @param className - Additional CSS classes applied to the header container.
 * @param onSignOut - Optional override called when the user signs out; if omitted the default sign-out flow is used. Concurrent sign-out attempts are ignored.
 * @returns The navbar JSX element.
 */
export default function Navbar({
  showMenu = true,
  showBreadcrumbs = true,
  breakpoint = 768,
  className = "",
  onSignOut,
}: NavbarProps) {
  const pathname = usePathname()
  const { toggleSidebar } = useSidebar()

  const [isMobile, setIsMobile] = useState(false)
  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < breakpoint)
    checkMobile()
    window.addEventListener("resize", checkMobile)
    return () => window.removeEventListener("resize", checkMobile)
  }, [breakpoint])

  const { signOut } = useRequireAuth()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)

  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return
    setIsSigningOut(true)
    try {
      if (onSignOut) {
        await onSignOut()
      } else {
        await signOut()
      }
    } catch (error) {
      // Log & notify so it's visible in dev and to users
      console.error("Failed to sign out:", error)
      toast.error("Failed to sign out. Please try again.")
    } finally {
      setIsSigningOut(false)
    }
  }, [isSigningOut, onSignOut, signOut])

  return (
    <header className={`flex h-16 items-center gap-2 border-b px-4 ${className}`}>
      {showMenu && isMobile && (
        <Button variant="ghost" size="icon" onClick={toggleSidebar} aria-label="Open menu">
          <Menu className="h-4 w-4" />
        </Button>
      )}

      <div className="flex-1">
        {showBreadcrumbs && <Breadcrumbs pathname={pathname} />}
      </div>

      <div className="ml-4 flex items-center">
        {isAuthenticated && (
          <SignOutButton
            disabled={isSigningOut}
            isSigningOut={isSigningOut}
            onSignOut={handleSignOut}
          />
        )}
      </div>
    </header>
  )
}
