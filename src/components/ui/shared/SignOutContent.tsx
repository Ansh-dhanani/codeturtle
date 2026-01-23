import React from "react"
import { Spinner } from "@/components/ui/spinner"
import { LogOut } from "lucide-react"

export function SignOutContent({ isSigningOut }: { isSigningOut?: boolean }) {
  return isSigningOut ? (
    <>
      <Spinner />
      <span className="ml-2">Logging out...</span>
    </>
  ) : (
    <>
      <LogOut />
      <span className="ml-2">Sign out</span>
    </>
  )
}
