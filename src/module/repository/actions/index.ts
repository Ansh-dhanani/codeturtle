"use server"
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createWebhook, getRepositories } from "@/module/github/github";
import { inngest } from "@/inngest/client";

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
        });
        const connectedRepoIds = new Set(dbRepos.map((repo) => repo.githubId));

        return repositories
            .map((repo:any) => ({
                ...repo,
                fullName: repo.full_name,
                isConnected: connectedRepoIds.has(BigInt(repo.id)),
            }));
    } catch (error) {
        console.error('Error fetching user repositories:', error);
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
                hookSecret: (webhook as any).secret || undefined,
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
        throw error; // Re-throw to let the hook handle it
    }
}
