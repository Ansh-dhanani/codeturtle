'use client'

import { Button } from "@/components/ui/button"
import { authenticateWithGithub } from "@/utils/auth"

export function GithubConnectButton() {
  const handleConnect = async () => {
    try {
      await authenticateWithGithub()
    } catch (error) {
      // Error is handled in authenticateWithGithub
    }
  }

  return (
    <Button onClick={handleConnect}>
      Connect GitHub
    </Button>
  )
}