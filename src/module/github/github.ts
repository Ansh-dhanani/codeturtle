import { Octokit } from "octokit";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { headers } from "next/headers.js";
import crypto from "crypto";

function isGithubBadCredentialError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const status = (error as { status?: number }).status;
  const message = ((error as { message?: string }).message || "").toLowerCase();
  return status === 401 || message.includes("bad credentials");
}

function toGithubUserFacingError(error: unknown, fallbackMessage: string): Error {
  if (isGithubBadCredentialError(error)) {
    return new Error("GitHub authentication expired. Please reconnect your GitHub account and try again.");
  }
  return new Error(fallbackMessage);
}

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
  try {
    const { data } = await octokit.rest.repos.listForAuthenticatedUser({
      visibility: "all",
      affiliation: "owner",
      per_page: perPage,
      page,
      sort: "updated",
    });
    return data;
  } catch (error) {
    console.error("Error listing repositories:", error);
    throw toGithubUserFacingError(error, "Failed to fetch repositories from GitHub.");
  }
}

export const createWebhook = async (owner: string, repo: string) => {
  const token = await getGithubToken();
  const octokit = new Octokit({ auth: token });

  // Scope headers can be absent for some token flows. If absent, continue and rely on webhook API checks.
  try {
    const rootRes = await octokit.request("GET /");
    const rawScopesHeader = rootRes.headers && (rootRes.headers["x-oauth-scopes"] || rootRes.headers["X-OAuth-Scopes"]);
    let scopesHeader = "";

    if (typeof rawScopesHeader === "string") {
      scopesHeader = rawScopesHeader;
    } else if (Array.isArray(rawScopesHeader)) {
      scopesHeader = rawScopesHeader.join(",");
    } else if (rawScopesHeader != null) {
      scopesHeader = String(rawScopesHeader);
    }

    if (scopesHeader && !scopesHeader.includes("admin:repo_hook") && !scopesHeader.includes("repo")) {
      throw new Error(
        `GitHub token missing required scope 'admin:repo_hook'. Current scopes: ${scopesHeader}. Reconnect your GitHub account and grant webhook permissions.`,
      );
    }
  } catch (err: any) {
    console.error("Error checking GitHub token scopes:", err);
    if (err && (err.status === 401 || err.status === 403)) {
      throw new Error("Invalid or expired GitHub token. Please reconnect your GitHub account.");
    }
  }

  if (!process.env.NEXT_PUBLIC_APP_URL) {
    throw new Error("Webhook URL not configured");
  }

  const baseAppUrl = process.env.NEXT_PUBLIC_APP_URL.replace(/\/+$/, "");
  const webhookUrl = `${baseAppUrl}/api/webhooks/github`;

  let hooks;
  try {
    const response = await octokit.rest.repos.listWebhooks({ owner, repo });
    hooks = response.data;
  } catch (error: any) {
    if (isGithubBadCredentialError(error)) {
      throw new Error("GitHub authentication expired. Please reconnect your GitHub account and try again.");
    }
    if (error?.status === 404 || error?.status === 403) {
      throw new Error("Webhook permission denied. Reconnect GitHub and grant repository + webhook permissions, then retry.");
    }
    throw new Error("Failed to read repository webhooks from GitHub.");
  }

  const existingHook = hooks.find((hook) => hook.config.url === webhookUrl);
  const desiredEvents = ["pull_request", "issue_comment", "pull_request_review_comment"];

  if (existingHook) {
    const existingEvents = Array.isArray(existingHook.events) ? existingHook.events : [];
    const needsEventUpdate = desiredEvents.some((eventName) => !existingEvents.includes(eventName));

    if (needsEventUpdate) {
      try {
        await octokit.rest.repos.updateWebhook({
          owner,
          repo,
          hook_id: existingHook.id,
          config: {
            url: webhookUrl,
            content_type: "json",
          },
          events: desiredEvents,
          active: true,
        });
      } catch (error: any) {
        if (isGithubBadCredentialError(error)) {
          throw new Error("GitHub authentication expired. Please reconnect your GitHub account and try again.");
        }
        throw new Error("Failed to update existing GitHub webhook events.");
      }
    }

    return { ...existingHook, secret: null } as typeof existingHook & { secret: string | null };
  }

  try {
    const secret = crypto.randomBytes(32).toString("hex");
    const response = await octokit.rest.repos.createWebhook({
      owner,
      repo,
      config: {
        url: webhookUrl,
        content_type: "json",
        secret,
      },
      events: desiredEvents,
    });
    return { ...response.data, secret };
  } catch (error: any) {
    if (isGithubBadCredentialError(error)) {
      throw new Error("GitHub authentication expired. Please reconnect your GitHub account and try again.");
    }
    if (error?.status === 404 || error?.status === 403) {
      throw new Error("Webhook permission denied. Reconnect GitHub and grant repository + webhook permissions, then retry.");
    }
    if (error?.status === 422) {
      throw new Error("GitHub rejected webhook creation (422). Remove duplicate hooks if needed and retry.");
    }
    throw new Error("Failed to create webhook on GitHub.");
  }
}

export const deleteWebhook = async (owner: string, repo: string, hookId: number) => {
  const token = await getGithubToken();
  const octokit = new Octokit({
    auth: token,
  });
  const baseAppUrl = `${process.env.NEXT_PUBLIC_APP_URL}`.replace(/\/+$/, "");
  const webhookUrl = `${baseAppUrl}/api/webhooks/github`;
  try {
    const { data: hooks } = await octokit.rest.repos.listWebhooks({ owner, repo });

    const hooktoDelete = hooks.find((hook) => hook.id === hookId && hook.config.url === webhookUrl);
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
    throw toGithubUserFacingError(error, "Failed to delete GitHub webhook.");
  }
}

export async function getRepoFileContents(
  token: string,
  repo: string,
  owner: string,
  path: string = "",
): Promise<{ path: string; content: string }[]> {
  const octokit = new Octokit({ auth: token });

  let data;
  try {
    const response = await octokit.rest.repos.getContent({
      repo,
      owner,
      path,
    });
    data = response.data;
  } catch (error) {
    console.error("Error fetching repository content:", error);
    throw toGithubUserFacingError(error, "Failed to fetch repository contents from GitHub.");
  }

  if (!Array.isArray(data)) {
    if (data.type === "file" && data.content) {
      return [{
        path: data.path,
        content: Buffer.from(data.content, "base64").toString("utf-8"),
      }];
    }
    return [];
  }

  let files: { path: string; content: string }[] = [];

  const BINARY_EXTENSIONS = /\.(png|jpg|jpeg|gif|svg|bmp|ico|webp|tiff|psd|ai|mp4|mp3|wav|ogg|mov|avi|flv|mkv|pdf|docx?|xlsx?|pptx?|zip|tar|gz|rar|7z|exe|dll|so|dylib|bin|dat|db|sqlite|wasm|class|o|pyc|pyo|egg|whl|lock|lockb)$/i;

  for (const item of data) {
    if (item.type === "file") {
      if (BINARY_EXTENSIONS.test(item.path)) {
        continue;
      }
      const { data: fileData } = await octokit.rest.repos.getContent({
        repo,
        owner,
        path: item.path,
      });
      if (!Array.isArray(fileData) && fileData.type === "file" && fileData.content) {
        try {
          const decoded = Buffer.from(fileData.content, "base64").toString("utf-8");
          if (decoded.includes("\0")) {
            continue;
          }
          files.push({
            path: item.path,
            content: decoded,
          });
        } catch {
          continue;
        }
      }
    } else if (item.type === "dir") {
      const subFiles = await getRepoFileContents(token, repo, owner, item.path);
      files = files.concat(subFiles);
    }
  }

  return files;
}
