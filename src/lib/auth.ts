import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";
import { createLogger } from "@/lib/logger";

const l = createLogger("auth");

function normalizeOrigin(value?: string | null) {
  if (!value) return null;
  return value.replace(/\/+$/, "");
}

const deploymentOrigin = process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : null;
const authBaseURL =
  normalizeOrigin(process.env.BETTER_AUTH_URL) ||
  normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL) ||
  normalizeOrigin(deploymentOrigin) ||
  "http://localhost:3000";

const trustedOrigins = [
  "http://localhost:3000",
  normalizeOrigin(process.env.BETTER_AUTH_URL),
  normalizeOrigin(process.env.NEXT_PUBLIC_APP_URL),
  normalizeOrigin(deploymentOrigin),
].filter((value, index, arr): value is string => Boolean(value) && arr.indexOf(value) === index);

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  throw new Error(
    "Missing required environment variables: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set"
  );
}

export { prisma };

export const auth = betterAuth({
  baseURL: authBaseURL,
  trustedOrigins,
  advanced: {
    cookies: {
      state: {
        attributes: {
          sameSite: "lax",
          secure: process.env.NODE_ENV === "production",
        },
      },
    },
  },
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  socialProviders: {
    github: {
      clientId: process.env.GITHUB_CLIENT_ID,
      clientSecret: process.env.GITHUB_CLIENT_SECRET,
      scope: ["read:user", "user:email", "repo", "admin:repo_hook"],
      getUserInfo: async (token) => {
        if (!token?.accessToken) {
          l.error("GitHub OAuth token missing access token during getUserInfo");
          return null;
        }

        const headers = {
          Authorization: `Bearer ${token.accessToken}`,
          Accept: "application/vnd.github+json",
          "User-Agent": "codeturtle-auth",
        };

        try {
          const profileResponse = await fetch("https://api.github.com/user", { headers });
          if (!profileResponse.ok) {
            const body = await profileResponse.text();
            l.error("GitHub /user fetch failed", undefined, {
              status: profileResponse.status,
              body: body.slice(0, 300),
            });
            return null;
          }

          const profile = await profileResponse.json() as {
            id: number | string;
            login?: string;
            name?: string;
            email?: string | null;
            avatar_url?: string;
          };

          let email = profile.email || null;
          let emailVerified = false;

          try {
            const emailResponse = await fetch("https://api.github.com/user/emails", { headers });
            if (emailResponse.ok) {
              const emails = await emailResponse.json() as Array<{ email: string; primary: boolean; verified: boolean }>;
              if (!email && Array.isArray(emails) && emails.length > 0) {
                email = (emails.find((entry) => entry.primary) || emails[0])?.email || null;
              }
              if (email) {
                emailVerified = emails.find((entry) => entry.email === email)?.verified ?? false;
              }
            } else {
              const body = await emailResponse.text();
              l.warn("GitHub /user/emails fetch failed", {
                status: emailResponse.status,
                body: body.slice(0, 300),
              });
            }
          } catch (emailErr) {
            l.warn("GitHub /user/emails fetch errored", {
              error: emailErr instanceof Error ? emailErr.message : "Unknown error",
            });
          }

          if (!email) {
            email = profile.login ? `${profile.login}@users.noreply.github.com` : null;
          }

          if (!email) {
            l.error("GitHub user info missing email and login fallback");
            return null;
          }

          return {
            user: {
              id: String(profile.id),
              name: profile.name || profile.login || "",
              email,
              image: profile.avatar_url,
              emailVerified,
            },
            data: profile,
          };
        } catch (err) {
          l.error("GitHub getUserInfo threw error", err as Error);
          return null;
        }
      },
      mapProfileToUser: async (profile) => {
        const email = profile.email || `${profile.login}@users.noreply.github.com`;
        return {
          email,
          name: profile.name || profile.login,
          image: profile.avatar_url,
          emailVerified: false,
        };
      },
    },
  },
});
