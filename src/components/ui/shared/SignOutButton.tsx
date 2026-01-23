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

/**
 * Render a ghost-styled sign-out button that displays a spinner and disabled state while signing out.
 *
 * When signing out, the button is disabled, shows a spinner with the label "Signing out...", and exposes
 * `aria-busy`/`aria-live` for assistive technologies.
 *
 * @param onSignOut - Optional override handler invoked when the button is activated. If omitted, the component manages sign-out itself.
 * @param label - Text label shown on the button when not signing out. Defaults to "Sign out".
 * @param isSigningOut - Optional external boolean to control the signing-out state; when provided it takes precedence over internal state.
 * @returns The sign-out Button element.
 */
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