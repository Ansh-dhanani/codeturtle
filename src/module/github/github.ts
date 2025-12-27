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
    affiliation: "owner",
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
  // Verify token scopes so we can provide a helpful error when webhook APIs are forbidden
  try {
    const rootRes = await octokit.request('GET /');
    const rawScopesHeader = rootRes.headers && (rootRes.headers['x-oauth-scopes'] || rootRes.headers['X-OAuth-Scopes']);
    let scopesHeader = '';
    if (typeof rawScopesHeader === 'string') {
      scopesHeader = rawScopesHeader;
    } else if (Array.isArray(rawScopesHeader)) {
      scopesHeader = rawScopesHeader.join(',');
    } else if (rawScopesHeader != null) {
      scopesHeader = String(rawScopesHeader);
    }

    if (!scopesHeader.includes('admin:repo_hook') && !scopesHeader.includes('repo')) {
      throw new Error(`GitHub token missing required scope 'admin:repo_hook'. Current scopes: ${scopesHeader || 'none'}. Reconnect your GitHub account and grant webhook permissions.`);
    }
  } catch (err: any) {
    console.error('Error checking GitHub token scopes:', err);
    // If we got a 401/403 here, surface a clearer message
    if (err && (err.status === 401 || err.status === 403)) {
      throw new Error('Invalid or expired GitHub token. Please reconnect your GitHub account.');
    }
    throw err;
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    throw new Error("Webhook URL not configured");
  }
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/github`;
  let hooks;
  try {
    const response = await octokit.rest.repos.listWebhooks({
      owner,
      repo,
    });
    hooks = response.data;
  } catch (error: any) {
    if (error.status === 404) {
      throw new Error("You don't have permission to create webhooks on this repository. Make sure you have admin access to the repository.");
    }
    throw error;
  }
  const existingHook = hooks.find(hook => hook.config.url === webhookUrl);
  if (existingHook) {
    return existingHook;
  }
  try {
    const secret = crypto.randomBytes(32).toString('hex');
    const response = await octokit.rest.repos.createWebhook({
      owner,
      repo,
      config: {
        url: webhookUrl,
        content_type: "json",
        secret,
      },
      events: ["pull_request"],
    });
    // Return webhook data plus the generated secret so the server can persist it
    return { ...response.data, secret };
  } catch (error: any) {
    if (error.status === 404) {
      throw new Error("You don't have permission to create webhooks on this repository. Make sure you have admin access to the repository.");
    }
    throw error;
  }
}

export const deleteWebhook = async (owner:string,repo:string,hookId:number) => {
  const token = await getGithubToken();
  const octokit = new Octokit({
    auth: token,
  });
  const webhookUrl = `${process.env.NEXT_PUBLIC_APP_URL}/api/webhooks/github`;
  try {
    const {data:hooks}=await octokit.rest.repos.listWebhooks({
      owner,
      repo,
    });

    const hooktoDelete = hooks.find(hook => hook.id === hookId && hook.config.url === webhookUrl);
    if (hooktoDelete) {
      await octokit.rest.repos.deleteWebhook({
        owner,
        repo,
        hook_id: hookId,
      });
      return true;
    }
    return false;
  } catch (error) {
    console.error("Error deleting webhook:", error);
    throw error;
  }
}