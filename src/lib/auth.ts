import { betterAuth } from "better-auth";
import { prismaAdapter } from "better-auth/adapters/prisma";
import { prisma } from "@/lib/prisma";

if (!process.env.GITHUB_CLIENT_ID || !process.env.GITHUB_CLIENT_SECRET) {
  throw new Error(
    "Missing required environment variables: GITHUB_CLIENT_ID and GITHUB_CLIENT_SECRET must be set"
  );
}

export { prisma };

export const auth = betterAuth({
  baseURL: (process.env.BETTER_AUTH_URL || "http://localhost:3000").replace(/\/+$/, ""),
  trustedOrigins: [
    "http://localhost:3000",
    (process.env.BETTER_AUTH_URL || "").replace(/\/+$/, ""),
  ].filter(Boolean),
  advanced: {
    cookies: {
      state: {
        attributes: {
          sameSite: "lax",
          secure: true,
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
