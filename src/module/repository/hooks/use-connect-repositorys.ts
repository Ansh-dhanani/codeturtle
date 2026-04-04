'use client'

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { connectRepository as connectRepositoryAction } from '../actions';
import { toast } from 'sonner';


export const useConnectRepository = () => {
  const queryClient = useQueryClient();
    return useMutation({
        mutationFn: ({ owner, repo, githubId }: { owner: string; repo: string; githubId: number }) => connectRepositoryAction(owner, repo, githubId),
        onSuccess: () => {
            toast("Repository connected: The repository has been successfully connected.");
            queryClient.invalidateQueries({ queryKey: ['repositories'] });
        },
        onError: (error: unknown) => {
            const message = error && typeof error === 'object' && 'message' in error 
                ? (error as { message: string }).message 
                : "An error occurred while connecting the repository.";
            toast("Error connecting repository: " + message);
            console.error(error);
        },
    });
}