import { useCallback, useState } from "react"
import { toast } from "sonner"
import { useRequireAuth } from "@/hooks/use-auth"

/**
 * Encapsulates sign-out logic and user-facing notifications.
 * Returns a stable handler suitable for buttons, menu items, etc.
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
