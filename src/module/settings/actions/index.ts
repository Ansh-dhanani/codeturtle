"use server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { deleteWebhook } from "@/module/github/github";
import { AI_PROVIDERS } from "@/lib/ai-providers";
import {
  normalizeCustomPrompt,
  normalizeRepoReviewModes,
  serializeRepoReviewModes,
  type RepoReviewStyle,
} from "@/module/repository/lib/settings";

function isApiKeyFormatValidForProvider(provider: string, apiKey: string): boolean {
  const key = apiKey.trim();
  if (!key) return true;

  if (provider === "openrouter") return key.startsWith("sk-or-");
  if (provider === "groq") return key.startsWith("gsk_");
  if (provider === "anthropic") return key.startsWith("sk-ant-");
  if (provider === "openai") return key.startsWith("sk-") && !key.startsWith("sk-or-") && !key.startsWith("sk-ant-");
  return true;
}

export async function getUserProfile() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      throw new Error("User not authenticated");
    }
    const user = await prisma.user.findFirst({
      where: {
        id: session.user.id,
      },
      select: {
        id: true,
        name: true,
        aiModel: true,
      },
    });
    return user;
  } catch (error) {
    console.error("Error fetching user profile type:", error);
    throw new Error("Failed to fetch user profile type");
  }
}

export async function updateUserProfile(data: { name: string }) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) {
      throw new Error("User not authenticated");
    }
    const updateUser = await prisma.user.update({
      where: {
        id: session.user.id,
      },
      data: {
        name: data.name,
      },
      select: {
        id: true,
        name: true,
      },
    });
    revalidatePath("/settings", "page");
    return {
      success: true,
      user: updateUser,
    };
  } catch (error) {
    console.error("Error updating user profile type:", error);
    throw new Error("Failed to update user profile type");
  }
}

export async function updateUserAIModel(provider: string, model: string, apiKey?: string) {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session?.user) {
      throw new Error("User not authenticated");
    }

    let normalizedModel = model;
    if (provider === "openrouter") {
      if (model === "moonshotai/kimi-k2:free") {
        normalizedModel = "moonshotai/kimi-k2";
      } else if (model === "qwen/qwen3-32b:free") {
        normalizedModel = "qwen/qwen3.6-plus:free";
      }
    }

    const providerConfig = AI_PROVIDERS.find((p) => p.id === provider);
    const modelConfig = providerConfig?.models.find((m) => m.id === normalizedModel);
    if (!providerConfig || !modelConfig) {
      throw new Error("Invalid AI provider or model selection");
    }

    if (apiKey && !isApiKeyFormatValidForProvider(provider, apiKey)) {
      throw new Error(`The provided API key does not match ${providerConfig.name}.`);
    }

    await prisma.user.update({
      where: { id: session.user.id },
      data: {
        aiProvider: provider,
        aiModel: normalizedModel,
        ...(apiKey ? { aiApiKey: apiKey } : {}),
      },
    });
    revalidatePath("/settings", "page");
    return { success: true, provider, model: normalizedModel };
  } catch (error) {
    console.error("Error updating AI model:", error);
    throw new Error("Failed to update AI model");
  }
}

export async function getConnectedRepositories() {
  try {
    const session = await auth.api.getSession({
      headers: await headers(),
    });
    if (!session) {
      throw new Error("User not authenticated");
    }
    const repositories = await prisma.repository.findMany({
      where: {
        userId: session.user.id,
      },
      select: {
        id: true,
        name: true,
        owner: true,
        fullName: true,
        url: true,
        reviewStyle: true,
        memesEnabled: true,
        customPrompt: true,
        aiProvider: true,
        aiModel: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return repositories.map((repository) => ({
      ...repository,
      reviewModes: normalizeRepoReviewModes(repository.reviewStyle),
    }));
  } catch (error) {
    console.error("Error fetching connected repositories:", error);
    throw new Error("Failed to fetch connected repositories");
  }
}

export async function disconnectRepository(repositoryId: string) {
  try {
    const session = await auth.api.getSession({
        headers: await headers(),
        });
    if (!session) {
        throw new Error("User not authenticated");
    }
    const repository = await prisma.repository.findUnique({
        where: {
            id: repositoryId,
            userId: session.user.id,
        },
        select: {
            owner: true,
            name: true,
            hookId: true,
        },
    });
    if(!repository){
        throw new Error("Repository not found");
    }
    if (repository.hookId) {
        await deleteWebhook(repository.owner, repository.name, Number(repository.hookId));
    }
    await prisma.repository.delete({
        where: {
            id: repositoryId,
            userId: session.user.id,
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

export async function disconnectAllRepository() {
    try {
        const session = await auth.api.getSession({
            headers: await headers(),
        });
        if (!session) {
            throw new Error("User not authenticated");
        }
        const repositories = await prisma.repository.findMany({
            where: {
                userId: session.user.id,
            },
        });
        await Promise.allSettled(repositories.map(async (repository) => {
          if (repository.hookId) {
            try {
              await deleteWebhook(repository.owner, repository.name, Number(repository.hookId));
            } catch (err) {
              console.error(`Failed to delete webhook for ${repository.owner}/${repository.name}:`, err);
            }
          }
        }));
        await prisma.repository.deleteMany({
            where: {
                userId: session.user.id,
            },
        });

        revalidatePath("/repositories", "page");
        revalidatePath("/settings", "page");
        return { success: true };
    } catch (error) {
        console.error("Error disconnecting all repositories:", error);
      throw new Error("Failed to disconnect all repositories");
    }
}

export async function updateRepositoryBehaviorSettings(data: {
  repositoryId: string;
  reviewStyle?: RepoReviewStyle;
  reviewModes?: RepoReviewStyle[];
  memesEnabled: boolean;
  customPrompt?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
}) {
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
      where: { id: data.repositoryId },
      data: {
        reviewStyle: serializeRepoReviewModes(
          normalizeRepoReviewModes(data.reviewModes || data.reviewStyle),
        ),
        memesEnabled: Boolean(data.memesEnabled),
        customPrompt,
        aiProvider: provider,
        aiModel: provider ? model : null,
      },
    });

    revalidatePath("/repositories", "page");
    revalidatePath("/settings", "page");
    return { success: true };
  } catch (error) {
    console.error("Error updating repository behavior settings:", error);
    throw new Error("Failed to update repository settings");
  }
}
