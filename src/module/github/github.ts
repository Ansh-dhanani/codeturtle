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
    const response: contributionData = await octokit.graphql(query, { username });
    return response.user.contributionsCollection.contributionCalendar;
  }
  catch (error) {
    console.error("Error fetching user contributions:", error);
    throw error;
  }
}

export const getRepositories = async (page: number = 1, perPage: number = 10) => {
  const token = await getGithubToken();
  const octokit = new Octokit({
    auth: token,
  });
  const { data } = await octokit.rest.repos.listForAuthenticatedUser({
    visibility: "all",
    affiliation: "owner",
    per_page: perPage,
    page: page,
    sort: "updated",
  });
  return data;
}

export const createWebhook = async (owner: string, repo: string) => {
  const token = await getGithubToken();
  const octokit = new Octokit({
    auth: token,
  });
  if (!process.env.NEXT_PUBLIC_APP_URL) {
    throw new Error("Webhook URL not configured");
  }
  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, '');
  const webhookUrl = `${baseAppUrl}/api/webhooks/github`;
  let hooks;
  try {
    const response = await octokit.rest.repos.listWebhooks({
      owner,
      repo,
    });
    hooks = response.data;
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error) {
      const err = error as { status: number };
      if (err.status === 404) {
        throw new Error("You don't have permission to create webhooks on this repository. Make sure you have admin access to the repository.");
      }
    }
    throw error;
  }
  const existingHook = hooks.find(hook => hook.config.url === webhookUrl);
  if (existingHook) {
    // Return consistent shape: include `secret` property (null when existing)
    return { ...existingHook, secret: null } as typeof existingHook & { secret: string | null };
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
  } catch (error: unknown) {
    if (error && typeof error === 'object' && 'status' in error) {
      const err = error as { status: number };
      if (err.status === 404) {
        throw new Error("You don't have permission to create webhooks on this repository. Make sure you have admin access to the repository.");
      }
    }
    throw error;
  }
}

export const deleteWebhook = async (owner: string, repo: string, hookId: number) => {
  const token = await getGithubToken();
  const octokit = new Octokit({
    auth: token,
  });
  const baseAppUrl = `${process.env.NEXT_PUBLIC_APP_URL}`.replace(/\/+$/, '');
  const webhookUrl = `${baseAppUrl}/api/webhooks/github`;
  try {
    const { data: hooks } = await octokit.rest.repos.listWebhooks({
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


export async function getRepoFileContents(
  token: string,
  repo: string,
  owner: string,
  path: string = ""
): Promise<{ path: string, content: string }[]> {
  const octokit = new Octokit({ auth: token });

  const { data } = await octokit.rest.repos.getContent({
    repo,
    owner,
    path
  });

  if (!Array.isArray(data)) {
    // it is a file
    if (data.type === "file" && data.content) {
      return [{
        path: data.path,
        content: Buffer.from(data.content, "base64").toString('utf-8')
      }]
    }
    return [];
  }
  let files: { path: string, content: string }[] = [];

  const BINARY_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|bmp|ico|webp|tiff|psd|ai|mp4|mp3|wav|ogg|mov|avi|flv|mkv|pdf|docx?|xlsx?|pptx?|zip|tar|gz|rar|7z|exe|dll|so|dylib|bin|dat|db|sqlite|wasm|class|o|pyc|pyo|egg|whl|lock|lockb)$/i;

  for (const item of data) {
    if (item.type === "file") {
      if (BINARY_EXTENSIONS.test(item.path)) {
        continue;
      }
      const { data: fileData } = await octokit.rest.repos.getContent({
        repo,
        owner,
        path: item.path
      });
      if (!Array.isArray(fileData) && fileData.type === "file" && fileData.content) {
        try {
          const decoded = Buffer.from(fileData.content, 'base64').toString('utf-8');
          if (decoded.includes('\0')) {
            continue;
          }
          files.push({
            path: item.path,
            content: decoded
          });
        } catch {
          continue;
        }
      }
    }
    else if (item.type === "dir") {
      const subFiles = await getRepoFileContents(token, repo, owner, item.path);
      files = files.concat(subFiles);
    }
  }

  return files;
}