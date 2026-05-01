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
    serializeRepoReviewModes,
    type RepoReviewStyle,
} from "@/module/repository/lib/settings";
import { AI_PROVIDERS } from "@/lib/ai-providers";

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
                aiProvider: true,
                aiModel: true,
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
                    aiProvider: repo.aiProvider,
                    aiModel: repo.aiModel,
                },
            ]),
        );

        return repositories
            .map((repo: { id: number; full_name: string; [key: string]: unknown }) => {
                const connected = connectedRepoMap.get(String(repo.id));
                return {
                    ...repo,
                    fullName: repo.full_name,
                    isConnected: Boolean(connected),
                    connectedRepositoryId: connected?.connectedRepositoryId || null,
                    reviewStyle: connected?.reviewStyle || "balanced",
                    reviewModes: connected?.reviewModes || ["balanced"],
                    memesEnabled: connected?.memesEnabled ?? true,
                    customPrompt: connected?.customPrompt || null,
                    aiProvider: connected?.aiProvider || null,
                    aiModel: connected?.aiModel || null,
                };
            });
    } catch (error) {
        console.error('Error fetching user repositories:', error);
        const message = error instanceof Error ? error.message : 'Failed to fetch repositories';
        if (/bad credentials|authentication expired|reconnect your github/i.test(message)) {
            throw new Error('GitHub authentication expired. Reconnect your GitHub account in settings and try again.');
        }
        throw new Error('Failed to fetch repositories');
    }
}

export const connectRepository = async (owner: string,repo: string,githubId: number) => {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });
        if (!session) {
            throw new Error("User not authenticated");
        }
        const webhook = await createWebhook(owner,repo);

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
            },
        });

        //todo increment user's connected repository count
        try {
            await inngest.send({name: "repository.connected",
                data: {
                    owner,
                    repo,
                    userId: session.user.id,
                },
            });
        } catch (error) {
            console.error("Error sending inngest event:", error);
        }

        return webhook;
    } catch (error) {
        console.error('Error connecting repository:', error);
        const message = error instanceof Error ? error.message : 'Failed to connect repository';
        if (/bad credentials|authentication expired|reconnect your github/i.test(message)) {
            throw new Error('GitHub authentication expired. Reconnect your GitHub account in settings and try again.');
        }
        throw error; // Re-throw to let the hook handle it
    }
}

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
    aiProvider?: string | null;
    aiModel?: string | null;
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

        const provider = data.aiProvider?.trim() || null;
        const model = data.aiModel?.trim() || null;
        const providerConfig = provider ? AI_PROVIDERS.find((p) => p.id === provider) : null;
        const modelConfig = providerConfig && model
            ? providerConfig.models.find((m) => m.id === model)
            : null;

        if (provider && !providerConfig) {
            throw new Error("Invalid AI provider selection");
        }

        if (provider && model && !modelConfig) {
            throw new Error("Invalid AI model selection");
        }

        await prisma.repository.update({
            where: { id: repository.id },
            data: {
                reviewStyle: serializeRepoReviewModes(
                    normalizeRepoReviewModes(data.reviewModes || data.reviewStyle),
                ),
                memesEnabled: Boolean(data.memesEnabled),
                customPrompt: normalizeCustomPrompt(data.customPrompt, 2000),
                aiProvider: provider,
                aiModel: provider ? model : null,
            },
        });

        revalidatePath("/repositories", "page");
        revalidatePath("/settings", "page");
        return { success: true };
    } catch (error) {
        console.error("Error updating repository behavior settings:", error);
        throw new Error("Failed to update repository behavior settings");
    }
}
