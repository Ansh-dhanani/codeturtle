import { Octokit } from "octokit";
import { createAppAuth } from "@octokit/auth-app";
import { createLogger } from "@/lib/logger";

const l = createLogger("github-app");

let appOctokit: Octokit | null = null;

function getAppOctokit(): Octokit {
  if (!appOctokit) {
    const appId = process.env.GITHUB_APP_ID;
    const privateKey = process.env.GITHUB_APP_PRIVATE_KEY;

    if (!appId || !privateKey) {
      throw new Error("GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set");
    }

    appOctokit = new Octokit({
      authStrategy: createAppAuth,
      auth: { appId, privateKey },
    });
  }
  return appOctokit;
}

export async function getInstallationOctokit(owner: string, repo: string): Promise<Octokit> {
  const app = getAppOctokit();
  const { data: installation } = await app.rest.apps.getRepoInstallation({ owner, repo });
  return new Octokit({
    authStrategy: createAppAuth,
    auth: { appId: process.env.GITHUB_APP_ID, privateKey: process.env.GITHUB_APP_PRIVATE_KEY, installationId: installation.id },
  });
}

export async function createPRComment(owner: string, repo: string, prNumber: number, body: string) {
  const octokit = await getInstallationOctokit(owner, repo);
  await octokit.rest.issues.createComment({ owner, repo, issue_number: prNumber, body });
  l.info("Created PR comment", { owner, repo, prNumber });
}

export async function createPRReview(owner: string, repo: string, prNumber: number, body: string, event: "APPROVE" | "REQUEST_CHANGES" | "COMMENT" = "COMMENT") {
  const octokit = await getInstallationOctokit(owner, repo);
  await octokit.rest.pulls.createReview({ owner, repo, pull_number: prNumber, body, event });
  l.info("Created PR review", { owner, repo, prNumber, event });
}

export async function getPRDiff(owner: string, repo: string, prNumber: number) {
  const octokit = await getInstallationOctokit(owner, repo);
  const { data: files } = await octokit.rest.pulls.listFiles({ owner, repo, pull_number: prNumber });
  return files;
}

export async function getPRDetails(owner: string, repo: string, prNumber: number) {
  const octokit = await getInstallationOctokit(owner, repo);
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: prNumber });
  return pr;
}
