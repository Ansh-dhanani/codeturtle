"use client";

import { useCallback } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { getAvailableProviders, refreshAvailableProviders, type AvailableProvider } from "@/module/ai/actions";

export function useAvailableProviders() {
  const queryClient = useQueryClient();
  const query = useQuery<AvailableProvider[]>({
    queryKey: ["ai-providers"],
    queryFn: getAvailableProviders,
    staleTime: 1000 * 60 * 5, // 5 minutes
    refetchOnMount: "always",
    refetchOnWindowFocus: false,
  });

  const forceRefresh = useCallback(async () => {
    const fresh = await refreshAvailableProviders();
    queryClient.setQueryData(["ai-providers"], fresh);
    return fresh;
  }, [queryClient]);

  return { ...query, forceRefresh };
}
