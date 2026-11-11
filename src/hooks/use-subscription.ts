"use client";

import { useQuery } from "@tanstack/react-query";
import { getUserSubscription } from "@/module/review/actions";

/** Shared subscription query - one fetch per session window, shared across components. */
export function useSubscription() {
  return useQuery({
    queryKey: ["subscription"],
    queryFn: async () => await getUserSubscription(),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });
}
