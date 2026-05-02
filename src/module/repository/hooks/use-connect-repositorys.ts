'use client'

import { useMutation, useQueryClient, type InfiniteData } from '@tanstack/react-query';
import { connectRepository as connectRepositoryAction } from '../actions';
import { toast } from 'sonner';

type RepositoryRow = {
    id: number;
    isConnected: boolean;
    [key: string]: unknown;
};

type RepositoryPage = RepositoryRow[];

type ConnectVariables = {
    owner: string;
    repo: string;
    githubId: number;
};

import { authenticateWithGithub } from '@/utils/auth';

export const useConnectRepository = () => {
    const queryClient = useQueryClient();
    return useMutation({
        mutationFn: async ({ owner, repo, githubId }: ConnectVariables) => {
            const result = await connectRepositoryAction(owner, repo, githubId);
            if (result && 'error' in result) {
                throw new Error(result.error as string);
            }
            return result;
        },
        onMutate: async ({ githubId }: ConnectVariables) => {
            await queryClient.cancelQueries({ queryKey: ['repositories'] });

            const previousRepositories = queryClient.getQueryData<InfiniteData<RepositoryPage>>(['repositories']);

            queryClient.setQueryData<InfiniteData<RepositoryPage>>(['repositories'], (old) => {
                if (!old) return old;
                return {
                    ...old,
                    pages: old.pages.map((page) =>
                        page.map((repo) =>
                            repo.id === githubId
                                ? { ...repo, isConnected: true }
                                : repo,
                        ),
                    ),
                };
            });

            return { previousRepositories };
        },
        onSuccess: () => {
            toast.success("Repository connected successfully!");
            queryClient.invalidateQueries({ queryKey: ['repositories'] });
            queryClient.invalidateQueries({ queryKey: ['connected-repositories'] });
        },
        onError: (error: unknown, _variables, context) => {
            if (context?.previousRepositories) {
                queryClient.setQueryData(['repositories'], context.previousRepositories);
            }
            const message = error && typeof error === 'object' && 'message' in error
                ? (error as { message: string }).message
                : "An error occurred while connecting the repository.";

            // Automatically re-authenticate if GitHub blocks the token due to old app integration or scope issues
            if (
                message.toLowerCase().includes("resource not accessible by integration") ||
                message.toLowerCase().includes("reconnect your github account") ||
                message.toLowerCase().includes("webhook permission denied")
            ) {
                toast.error("Auth expired or insufficient scopes. Redirecting to GitHub to re-authorize...");
                authenticateWithGithub().catch(console.error);
                return;
            }

            toast.error("Error connecting repository: " + message);
            console.error(error);
        },
    });
}
