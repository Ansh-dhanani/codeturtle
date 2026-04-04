import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

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
      scope: ["repo", "admin:repo_hook", "user:email"],
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
