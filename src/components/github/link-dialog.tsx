'use client'
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Github } from "lucide-react"
import { authClient } from "@/lib/auth-client"
import { toast } from "sonner"
interface GithubLinkDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
  feature: string
}
export function GithubLinkDialog({ open, onOpenChange, feature }: GithubLinkDialogProps) {
  const handleLinkGithub = async () => {
    try {
      toast.loading('Connecting to GitHub...')
      await authClient.signIn.social({
        provider: 'github',
        callbackURL: window.location.pathname,
      })
    } catch (error) {
      console.error('Failed to link GitHub:', error)
      toast.error('Failed to connect GitHub account')
    }
  }
  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <div className="flex items-center gap-2">
            <Github className="h-6 w-6" />
            <AlertDialogTitle>Connect GitHub Account</AlertDialogTitle>
          </div>
          <AlertDialogDescription asChild>
            <div className="space-y-2">
              <p>
                To use <strong>{feature}</strong>, you need to connect your GitHub account.
              </p>
              <p className="text-sm">
                This will link your existing account with GitHub, allowing you to:
              </p>
              <ul className="list-disc list-inside text-sm space-y-1 ml-2">
                <li>Sync your GitHub avatar</li>
                <li>Access GitHub-related features</li>
                <li>Sign in with either email or GitHub</li>
              </ul>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleLinkGithub} className="gap-2">
            <Github className="h-4 w-4" />
            Connect GitHub
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
