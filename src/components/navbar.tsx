"use client"

import * as React from "react"
import { usePathname } from "next/navigation"

import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { LogOut, Menu } from "lucide-react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"
import { useRequireAuth } from "@/hooks/use-auth"
import { useAuthStore } from "@/stores/auth-store"
import { useState, useEffect } from "react"
import { toast } from "sonner"
import { useSidebar } from "@/components/ui/sidebar"


function formatSegment(segment: string) {
  return segment
    .replace(/-/g, " ")
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export default function Navbar() {
  const pathname = usePathname()
  const { toggleSidebar } = useSidebar()
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    const checkMobile = () => setIsMobile(window.innerWidth < 768)
    checkMobile()
    window.addEventListener('resize', checkMobile)
    return () => window.removeEventListener('resize', checkMobile)
  }, [])

  const segments = pathname
    .split("/")
    .filter(Boolean) 

  const { signOut } = useRequireAuth()
  const isAuthenticated = useAuthStore((s) => s.isAuthenticated)
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = async () => {
    setIsSigningOut(true)
    try {
      await signOut()
    } catch (error) {
      console.error('Failed to sign out:', error)
      toast.error('Failed to log out. Please try again.')
      setIsSigningOut(false)
    }
  }

  return (
    <header className="flex h-16 items-center gap-2 border-b px-4">
      {isMobile && (
        <Button variant="ghost" size="icon" onClick={toggleSidebar}>
          <Menu className="h-4 w-4" />
        </Button>
      )}

      <div className="flex-1">
        <Breadcrumb>
          
          <BreadcrumbList>
            {segments.map((segment, index) => {
              const href = "/" + segments.slice(0, index + 1).join("/")
              const isLast = index === segments.length - 1

              return (
                <React.Fragment key={href}>
                  <BreadcrumbItem>
                    {isLast ? (
                      <BreadcrumbPage>
                        {formatSegment(segment)}
                      </BreadcrumbPage>
                    ) : (
                      <BreadcrumbLink href={href}>
                        {formatSegment(segment)}
                      </BreadcrumbLink>
                    )}
                  </BreadcrumbItem>

                  {!isLast && <BreadcrumbSeparator />}
                </React.Fragment>
              )
            })}
          </BreadcrumbList>
        </Breadcrumb>
      </div>

      {/* Logout button on the right */}
      <div className="ml-4 flex items-center">
        {isAuthenticated && (
          <Button
            variant="ghost"
            className="h-8 px-3"
            onClick={handleSignOut}
            disabled={isSigningOut}
            aria-label="Sign out"
            title="Sign out"
            aria-busy={isSigningOut}
          >
            {isSigningOut ? (
              <div className="flex items-center gap-2">
                <Spinner className="h-4 w-4" />
                <span className="text-sm">Signing out...</span>
              </div>
            ) : (
              <div className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                <span className="text-sm">Sign out</span>
              </div>
            )}
          </Button>
        )}
      </div>

    </header>
  )
}
