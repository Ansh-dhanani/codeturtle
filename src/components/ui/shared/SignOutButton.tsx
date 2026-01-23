import React from "react"
import { Button } from "@/components/ui/button"
import { Spinner } from "@/components/ui/spinner"
import { LogOut } from "lucide-react"
import { useSignOut } from "@/hooks/use-signout"

interface SignOutButtonProps extends React.ComponentProps<typeof Button> {
  /** Optional override - if provided it will be called instead of the default handler */
  onSignOut?: () => Promise<void> | void
  label?: string
  /** Allow parent to pass known signing out state (useful when the parent manages the flow) */
  isSigningOut?: boolean
}

export function SignOutButton({ onSignOut, label = "Sign out", isSigningOut: externalSigningOut, ...props }: SignOutButtonProps) {
  const { isSigningOut: internalSigningOut, handleSignOut } = useSignOut()

  const isSigningOut = externalSigningOut ?? internalSigningOut
  const click = onSignOut ?? handleSignOut

  return (
    <Button
      variant="ghost"
      className={`h-8 px-3 ${props.className ?? ""}`}
      onClick={click}
      disabled={isSigningOut || props.disabled}
      aria-label={label}
      title={label}
      aria-busy={isSigningOut}
      {...props}
    >
      {isSigningOut ? (
        <div className="flex items-center gap-2" aria-live="polite">
          <Spinner className="h-4 w-4" />
          <span className="text-sm">Signing out...</span>
        </div>
      ) : (
        <div className="flex items-center gap-2">
          <LogOut className="h-4 w-4" />
          <span className="text-sm">{label}</span>
        </div>
      )}
    </Button>
  )
}
