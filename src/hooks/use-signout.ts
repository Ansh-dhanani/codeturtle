import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useRequireAuth } from "@/hooks/use-auth"

/**
 * Provides sign-out logic with user-facing success and error notifications and a stable handler for UI consumption.
 *
 * @returns An object containing:
 * - `isSigningOut` — `true` if a sign-out operation is in progress, `false` otherwise.
 * - `handleSignOut` — Function that initiates a sign-out operation and completes when the attempt finishes.
 */
export function useSignOut() {
  const { signOut } = useRequireAuth()
  const [isSigningOut, setIsSigningOut] = useState(false)

  const handleSignOut = useCallback(async () => {
    if (isSigningOut) return
    setIsSigningOut(true)

    try {
      await signOut()
      toast.success("Successfully logged out")
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error("Failed to sign out:", error)
      toast.error("Failed to sign out. Please try again.")
    } finally {
      setIsSigningOut(false)
    }
  }, [isSigningOut, signOut])

  return { isSigningOut, handleSignOut }
}