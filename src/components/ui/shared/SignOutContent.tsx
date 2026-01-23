import React from "react"
import { Spinner } from "@/components/ui/spinner"
import { LogOut } from "lucide-react"

/**
 * Render sign-out UI content that reflects whether a sign-out is in progress.
 *
 * @param isSigningOut - If `true`, show a spinner with the text `Logging out...`; otherwise show a logout icon with the text `Sign out`.
 * @returns A JSX fragment containing either a spinner and the text `Logging out...` when signing out, or a logout icon and the text `Sign out` when not.
 */
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