'use client'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card'
import { Github } from 'lucide-react'
import { useRedirectIfAuthenticated } from '@/hooks/use-auth'
import { Spinner } from '@/components/ui/spinner'
import { authenticateWithGithub } from '@/utils/auth'
export function SigninForm() {
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState('')
  const { isLoading: isCheckingAuth } = useRedirectIfAuthenticated('/dashboard')

  if (isCheckingAuth) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Spinner/>
      </div>
    )
  }

  const handleGithubSignin = async () => {
    setIsLoading(true)
    setError('')
    
    try {
      await authenticateWithGithub()
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to sign in with GitHub'
      setError(errorMessage)
      console.error('GitHub sign-in error:', err)
    } finally {
      setIsLoading(false)
    }
  }
  return (
    <div className="flex min-h-screen items-center justify-center p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="space-y-1 text-center">
          <CardTitle className="text-2xl font-bold">Welcome to CodeTurtle</CardTitle>
          <CardDescription>
            Sign in with your GitHub account to get started
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
            onClick={handleGithubSignin}
            disabled={isLoading}
          >
            {isLoading ? (
              <Spinner />
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
