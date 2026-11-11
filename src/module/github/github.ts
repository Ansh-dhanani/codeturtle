import { Octokit } from "octokit";
import { auth } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { headers } from "next/headers.js";
import crypto from "crypto";

function asGithubHttpError(error: unknown): { status?: number; message?: string } {
  if (!error || typeof error !== "object") return {};
  return error as { status?: number; message?: string };
}

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

export async function fetchUserContribution(
  token: string,
  username: string,
  options?: { from?: string; to?: string }
) {
  const octokit = new Octokit({
    auth: token,
  });
  const useRange = options?.from && options?.to;
  const query = useRange
    ? `
    query ($username: String!, $from: DateTime!, $to: DateTime!) {
        user(login: $username) {
            contributionsCollection(from: $from, to: $to) {
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
    }`
    : `
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
    const variables = useRange
      ? { username, from: options!.from, to: options!.to }
      : { username };
    const response: contributionData = await octokit.graphql(query, variables);
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
      affiliation: "owner,collaborator,organization_member",
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
  } catch (err: unknown) {
    console.error("Error checking GitHub token scopes:", err);
    const status = (err as { status?: number } | null)?.status;
    if (status === 401 || status === 403) {
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
  } catch (error: unknown) {
    if (isGithubBadCredentialError(error)) {
      throw new Error("GitHub authentication expired. Please reconnect your GitHub account and try again.");
    }
    const ghe = asGithubHttpError(error);
    if (ghe.status === 404 || ghe.status === 403) {
      throw new Error(`Webhook permission denied (HTTP ${ghe.status}). GitHub says: ${ghe.message || "Unknown"}. Verify you are an admin of this repository, and if it's an Organization repo, ensure the Organization allows third-party OAuth access.`);
    }
    throw new Error(`Failed to read repository webhooks from GitHub! GitHub says: ${ghe.message || "Unknown error"}`);
  }

  const matchingHooks = hooks.filter((hook) => hook.config.url === webhookUrl);
  const [existingHook, ...duplicateHooks] = matchingHooks;
  const desiredEvents = ["pull_request", "issue_comment", "pull_request_review_comment", "pull_request_review"];

  if (existingHook) {
    for (const duplicate of duplicateHooks) {
      try {
        await octokit.rest.repos.deleteWebhook({
          owner,
          repo,
          hook_id: duplicate.id,
        });
      } catch (error: unknown) {
        if (asGithubHttpError(error).status !== 404) {
          console.warn("Failed to delete duplicate webhook", { owner, repo, hookId: duplicate.id, error: asGithubHttpError(error).message });
        }
      }
    }

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
      } catch (error: unknown) {
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
  } catch (error: unknown) {
    if (isGithubBadCredentialError(error)) {
      throw new Error("GitHub authentication expired. Please reconnect your GitHub account and try again.");
    }
    const ghe = asGithubHttpError(error);
    if (ghe.status === 404 || ghe.status === 403) {
      throw new Error(`Webhook permission denied (HTTP ${ghe.status}). GitHub says: ${ghe.message || "Unknown"}. Verify you are an admin of this repository, and if it's an Organization repo, ensure the Organization allows third-party OAuth access.`);
    }
    if (ghe.status === 422) {
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
  return getRepoFileContentsFromOctokit(octokit, repo, owner, path);
}

export async function getRepoFileContentsFromOctokit(
  octokit: Octokit,
  repo: string,
  owner: string,
  path: string = "",
): Promise<{ path: string; content: string }[]> {

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
      const subFiles = await getRepoFileContentsFromOctokit(octokit, repo, owner, item.path);
      files = files.concat(subFiles);
    }
  }

  return files;
}
