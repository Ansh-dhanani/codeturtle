"use server"
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createWebhook, deleteWebhook, getRepositories } from "@/module/github/github";
import { inngest } from "@/inngest/client";
import { revalidatePath } from "next/cache";
import {
    normalizeCustomPrompt,
    normalizeRepoReviewModes,
    normalizeReviewIgnoreGlobs,
    serializeRepoReviewModes,
    type RepoReviewStyle,
} from "@/module/repository/lib/settings";

export const fetchUserRepositories = async (page: number = 1, perPage: number = 10) => {
    try {
        const session = await auth.api.getSession
            ({
                headers: await headers(),
            });
        const user = session?.user;
        if (!user) {
            throw new Error("User not authenticated");
        }
        const repositories = await getRepositories(page, perPage);

        const dbRepos = await prisma.repository.findMany({
            where: {
                userId: session.user.id,
            },
            select: {
                id: true,
                githubId: true,
                reviewStyle: true,
                memesEnabled: true,
                customPrompt: true,
                reviewIgnoreGlobs: true,
                aiProvider: true,
                aiModel: true,
                reviewMode: true,
            },
        });
        const connectedRepoMap = new Map(
            dbRepos.map((repo) => [
                repo.githubId.toString(),
                {
                    connectedRepositoryId: repo.id,
                    reviewStyle: repo.reviewStyle,
                    reviewModes: normalizeRepoReviewModes(repo.reviewStyle),
                    memesEnabled: repo.memesEnabled,
                    customPrompt: repo.customPrompt,
                    reviewIgnoreGlobs: repo.reviewIgnoreGlobs,
                    aiProvider: repo.aiProvider,
                    aiModel: repo.aiModel,
                    reviewMode: repo.reviewMode,
                },
            ]),
        );

        return repositories
            .map((repo: { id: number; full_name: string;[key: string]: unknown }) => {
                const connected = connectedRepoMap.get(String(repo.id));
                return {
                    ...repo,
                    fullName: repo.full_name,
                    isConnected: Boolean(connected),
                    connectedRepositoryId: connected?.connectedRepositoryId || null,
                    reviewStyle: connected?.reviewStyle || "balanced",
                    reviewModes: connected?.reviewModes || ["balanced"],
                    memesEnabled: connected?.memesEnabled ?? false,
                    customPrompt: connected?.customPrompt || null,
                    reviewIgnoreGlobs: connected?.reviewIgnoreGlobs || null,
                    aiProvider: connected?.aiProvider || null,
                    aiModel: connected?.aiModel || null,
                    reviewMode: connected?.reviewMode || "auto",
                };
            });
    } catch (error) {
        console.error('Error fetching user repositories:', error);
        const message = error instanceof Error ? error.message : 'Failed to fetch repositories';
        return { error: message };
    }
}

export const connectRepository = async (owner: string, repo: string, githubId: number) => {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });
        if (!session) {
            throw new Error("User not authenticated");
        }
        const { canConnectRepo } = await import("@/lib/billing.server");
        if (!(await canConnectRepo(session.user.id))) {
            throw new Error("Repository limit reached for your plan - upgrade to connect more repositories");
        }
        const webhook = await createWebhook(owner, repo);

        if (!webhook) {
            throw new Error("Failed to create webhook");
        }

        await prisma.repository.create({
            data: {
                githubId: BigInt(githubId),
                name: repo,
                owner,
                fullName: `${owner}/${repo}`,
                url: `https://github.com/${owner}/${repo}`,
                userId: session.user.id,
                hookId: webhook.id ? BigInt(webhook.id) : undefined,
                hookSecret: (webhook as { secret?: string }).secret || undefined,
                memesEnabled: false,
            },
        });

        //todo increment user's connected repository count
        try {
            await inngest.send({
                name: "repository.connected",
                data: {
                    owner,
                    repo,
                    userId: session.user.id,
                },
            });
        } catch (error) {
            console.error("Error sending inngest event:", error);
        }

        return { success: true, webhook };
    } catch (error) {
        console.error('Error connecting repository:', error);
        const message = error instanceof Error ? error.message : 'Failed to connect repository';
        return { error: message };
    }
}

export const getRepositoryDetail = async (repositoryId: string) => {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });
        if (!session) throw new Error("User not authenticated");

        const repo = await prisma.repository.findFirst({
            where: { id: repositoryId, userId: session.user.id },
            select: {
                id: true,
                name: true,
                owner: true,
                fullName: true,
                url: true,
                reviewStyle: true,
                memesEnabled: true,
                aiProvider: true,
                aiModel: true,
                createdAt: true,
            },
        });
        if (!repo) throw new Error("Repository not found");

        const reviews = await prisma.codeReview.findMany({
            where: { repositoryId: repo.id, userId: session.user.id },
            orderBy: { createdAt: "desc" },
            take: 100,
            select: {
                id: true,
                prNumber: true,
                prTitle: true,
                prUrl: true,
                sha: true,
                summary: true,
                files: true,
                status: true,
                createdAt: true,
            },
        });

        const completed = reviews.filter((r) => r.status === "completed");
        const scores = completed
            .map((r) => (r.files as Record<string, unknown> | null)?.overallScore as number)
            .filter((s): s is number => typeof s === "number" && !Number.isNaN(s));
        const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;

        const aggregate = {
            totalReviews: reviews.length,
            completedReviews: completed.length,
            failedReviews: reviews.filter((r) => r.status === "failed").length,
            avgScore,
            lastReviewAt: completed[0]?.createdAt?.toISOString() || null,
            lastSha: completed[0]?.sha || null,
        };

        return { repo, reviews, aggregate };
    } catch (error) {
        const message = error instanceof Error ? error.message : "Failed to load repository";
        return { error: message };
    }
};

export const disconnectRepository = async (repositoryId: string) => {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });
        if (!session) {
            throw new Error("User not authenticated");
        }

        const repository = await prisma.repository.findFirst({
            where: {
                id: repositoryId,
                userId: session.user.id,
            },
            select: {
                id: true,
                owner: true,
                name: true,
                hookId: true,
            },
        });

        if (!repository) {
            throw new Error("Repository not found");
        }

        if (repository.hookId) {
            try {
                await deleteWebhook(repository.owner, repository.name, Number(repository.hookId));
            } catch (err) {
                console.error(`Failed to delete webhook for ${repository.owner}/${repository.name}:`, err);
            }
        }

        await prisma.repository.delete({
            where: {
                id: repository.id,
            },
        });

        revalidatePath("/repositories", "page");
        revalidatePath("/settings", "page");
        return { success: true };
    } catch (error) {
        console.error("Error disconnecting repository:", error);
        throw new Error("Failed to disconnect repository");
    }
}

export const updateRepositoryBehaviorSettings = async (data: {
    repositoryId: string;
    reviewStyle?: RepoReviewStyle;
    reviewModes?: RepoReviewStyle[];
    memesEnabled: boolean;
    customPrompt?: string | null;
    reviewIgnoreGlobs?: string | null;
    aiProvider?: string | null;
    aiModel?: string | null;
    reviewMode?: "auto" | "ask";
}) => {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });
        if (!session) {
            throw new Error("User not authenticated");
        }

        const repository = await prisma.repository.findFirst({
            where: {
                id: data.repositoryId,
                userId: session.user.id,
            },
            select: { id: true },
        });

        if (!repository) {
            throw new Error("Repository not found");
        }

        const customPrompt = normalizeCustomPrompt(data.customPrompt, 2000);
        if (customPrompt) {
            const { canUseCustomRules } = await import("@/lib/billing.server");
            if (!(await canUseCustomRules(session.user.id))) {
                throw new Error("Custom rules are a Pro feature - upgrade to use them");
            }
        }
        const reviewIgnoreGlobs = normalizeReviewIgnoreGlobs(data.reviewIgnoreGlobs);

        const provider = data.aiProvider?.trim() || null;
        const model = data.aiModel?.trim() || null;

        // Validate against the live catalog instead of the static hardcoded list,
        // so models that moved in/out of the catalog are correctly reflected.
        if (provider || model) {
            const { getLiveCatalog } = await import("@/lib/ai-catalog");
            const liveCatalog = await getLiveCatalog();
            const liveProvider = liveCatalog.find((p) => p.id === provider);
            const liveModel = liveProvider?.models.find((m) => m.id === model);

            if (provider && !liveProvider) {
                throw new Error("The saved AI provider is no longer available. Refresh the catalog and pick a new provider.");
            }
            if (provider && model && !liveModel) {
                throw new Error("The saved AI model is no longer available on this provider. Refresh the catalog and pick a live model.");
            }
        }

        await prisma.repository.update({
            where: { id: repository.id },
            data: {
                reviewStyle: serializeRepoReviewModes(
                    normalizeRepoReviewModes(data.reviewModes || data.reviewStyle),
                ),
                memesEnabled: Boolean(data.memesEnabled),
                customPrompt,
                reviewIgnoreGlobs,
                aiProvider: provider,
                aiModel: provider ? model : null,
                ...(data.reviewMode ? { reviewMode: data.reviewMode } : {}),
            },
        });

        revalidatePath("/repositories", "page");
        revalidatePath("/settings", "page");
        return { success: true };
    } catch (error) {
        console.error("Error updating repository behavior settings:", error);
        throw error instanceof Error ? error : new Error("Failed to update repository behavior settings");
    }
}
