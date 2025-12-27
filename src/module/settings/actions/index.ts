"use server";
import prisma from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { deleteWebhook } from "@/module/github/github";

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
        url: true,
        createdAt: true,
      },
      orderBy: { createdAt: "desc" },
    });
    return repositories;
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