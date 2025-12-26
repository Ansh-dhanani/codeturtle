'use client'
import { Button } from '@/components/ui/button'
import { useState } from 'react'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Loader2, Github } from 'lucide-react'
import { useRedirectIfAuthenticated } from '@/hooks/use-auth'
import { authenticateWithGithub } from '@/utils/auth'
export function SignupForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { isLoading: isCheckingAuth } = useRedirectIfAuthenticated('/dashboard')
  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center p-4">
        <Card className="w-full max-w-md">
          <CardContent className="py-8">
            <div className="flex justify-center">
              <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
            </div>
          </CardContent>
        </Card>
      </div>
    )
  }
  const handleGithubSignup = async () => {
    setIsLoading(true)
    setError('')
    try {
      await authenticateWithGithub()
    } catch (err: unknown) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign up with GitHub';
      setError(errorMessage)
      console.error('GitHub sign-up error:', err)
      setIsLoading(false)
    }
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Create your account</CardTitle>
          <CardDescription>
            Sign up with your GitHub account to get started
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {error && (
            <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">
              {error}
            </div>
          )}
          <Button
            type="button"
            variant="default"
            size="lg"
            className="w-full"
            onClick={handleGithubSignup}
            disabled={isLoading}
          >
            {isLoading ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Github className="mr-2 h-4 w-4" />
            )}
            Continue with GitHub
          </Button>
        </CardContent>
      </Card>
    </div>
  )
}
