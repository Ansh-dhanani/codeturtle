import { Octokit } from "octokit";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { headers } from "next/headers.js";
import crypto from "crypto";

export const getGithubToken = async () => {
  const session = await auth.api.getSession({
    headers: await headers(),
  });
  if (!session) {
    throw new Error("Unauthorized");
  }

  const account = await prisma.account.findFirst({
    where: {
      userId: session.user.id,
      providerId: "github",
    },
  });

  if (!account) {
    throw new Error("GitHub account not linked");
  }
  if (!account.accessToken) {
    throw new Error("GitHub access token is null");
  }
  return account.accessToken;
};

export async function fetchUserContribution(token: string, username: string) {
  const octokit = new Octokit({
    auth: token,
  });
  const query = `
    query ($username: String!) {
        user(login: $username) {
            contributionsCollection {
                contributionCalendar {
                    totalContributions
                    weeks {
                        contributionDays {
                            date
                            contributionCount
                            color
                        }
                    }
                }
            }
        }
    }`;

    interface contributionData {
      user: {
        contributionsCollection: {
            contributionCalendar: {
              weeks: {
                contributionDays: {
                  date: string;
                  contributionCount: number;
                  color: string;
                }[];
              }[];
              totalContributions: number;
            };
        };
      };
    }

    try {
      const response:contributionData = await octokit.graphql(query, { username });
      return response.user.contributionsCollection.contributionCalendar;
    }
    catch (error) {
        console.error("Error fetching user contributions:", error);
        throw error;
    }
}

export const getRepositories = async (page: number=1, perPage: number=10) => {
  const token = await getGithubToken();
  const octokit = new Octokit({
    auth: token,
  });
  const {data} = await octokit.rest.repos.listForAuthenticatedUser({
    visibility: "all",
    affiliation: "owner,collaborator,organization_member",
    per_page: perPage,
    page: page,
    sort: "updated",
  });
  return data;
}

export const createWebhook = async (owner:string,repo:string) => {
  const token = await getGithubToken();
  const octokit = new Octokit({
    auth: token,
  });

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    throw new Error("Webhook URL not configured");
  }
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/github`;
  const {data:hooks} = await octokit.rest.repos.listWebhooks({
    owner,
    repo,
  });
  const existingHook = hooks.find(hook => hook.config.url === webhookUrl);
  if (existingHook) {
    return existingHook;
  }
  const{data} = await octokit.rest.repos.createWebhook({
    owner,
    repo,
    config: {
      url: webhookUrl,
      content_type: "json",
      secret: crypto.randomBytes(32).toString('hex'),
    },
    events: ["pull_request"],
  });
  return data;
}