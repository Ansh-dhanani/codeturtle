"use server"
import { prisma } from "@/lib/prisma";
import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import { createWebhook, getRepositories } from "@/module/github/github";

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
        //TODO check if user can connect more repositories
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
            },
        });

        //todo increment user's connected repository count
        //todo trigger repository indexing for rag (fire and forget)

        return webhook;
    } catch (error) {
        console.error('Error connecting repository:', error);
        throw error; // Re-throw to let the hook handle it
    }
}
