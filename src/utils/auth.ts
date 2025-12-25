import { authClient } from '@/lib/auth-client'
import { toast } from 'sonner'

export const authenticateWithGithub = async () => {
  try {
    toast.loading('Signing in with GitHub...');
    await authClient.signIn.social({
      provider: 'github',
      callbackURL: '/dashboard',
    });
    toast.success('Redirecting to GitHub...');
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to sign in with GitHub';
    toast.error(message);
    throw error;
  }
}