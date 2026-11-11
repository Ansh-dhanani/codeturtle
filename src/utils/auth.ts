import { authClient } from '@/lib/auth-client'

/**
 * Validate a `next` redirect target: path-relative only, no protocol-relative
 * URLs (`//evil.com`), backslashes or control characters.
 */
export function safeNextPath(nextPath?: string | null): string | undefined {
  if (!nextPath) return undefined;
  // Must start with a single "/" and contain no "\\" or control chars/newlines
  if (!/^\/(?!\/)[^\\\n\r]*$/.test(nextPath)) return undefined;
  return nextPath;
}

export const authenticateWithGithub = async (nextPath?: string) => {
  try {
    const safeNext = safeNextPath(nextPath);
    const origin = typeof window !== 'undefined' ? window.location.origin : '';
    const callbackURL = origin
      ? `${origin}${safeNext ?? '/dashboard'}`
      : (safeNext ?? '/dashboard');

    await authClient.signIn.social({
      provider: 'github',
      callbackURL,
    });
  } catch (error) {
    // No toasts on the login screen — the error is surfaced through console / UI fallbacks.
    console.error('GitHub sign-in failed:', error instanceof Error ? error.message : error);
    throw error;
  }
}
