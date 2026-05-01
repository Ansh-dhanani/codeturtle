'use client'
import { useInfiniteQuery } from "@tanstack/react-query";
import { fetchUserRepositories } from "@/module/repository/actions";

export const useRepositories = () => {
    return useInfiniteQuery({
        queryKey: ["repositories"],
        queryFn: async ({ pageParam = 1 }) => {
            const data = await fetchUserRepositories(pageParam, 10);
            if (data && !Array.isArray(data) && 'error' in data) {
                throw new Error(data.error as string);
            }
            return data as any[];
        }
        ,
        getNextPageParam: (lastPage, allPages) => {
            if (lastPage.length < 10) {
                return undefined;
            }
            return allPages.length + 1;
        },
        initialPageParam: 1,
    });
}