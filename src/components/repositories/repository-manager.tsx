"use client";

import React, { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { useRepositories } from "@/module/repository/hooks/use-repositories";
import { useConnectRepository } from "@/module/repository/hooks/use-connect-repositorys";
import { getConnectedRepositories } from "@/module/settings/actions";
import {
  disconnectRepository,
  updateRepositoryBehaviorSettings,
} from "@/module/repository/actions";
import {
  REPO_REVIEW_STYLE_OPTIONS,
  normalizeRepoReviewModes,
  type RepoReviewStyle,
} from "@/module/repository/lib/settings";
import { useAvailableProviders } from "@/hooks/use-available-providers";
import { ModelPicker } from "@/components/settings/model-picker";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
  SheetFooter,
} from "@/components/ui/sheet";
import {
  Search,
  Star,
  ExternalLink,
  Plug,
  Settings2,
  Trash2,
  Loader2,
  ArrowRight,
  GitBranch,
  Lock,
} from "lucide-react";
import { useSubscription } from "@/hooks/use-subscription";
import { repoLimitFor, canUseCustomRulesFor } from "@/lib/billing";

interface Repository {
  id: number;
  name: string;
  full_name: string;
  fullName: string;
  description: string | null;
  html_url: string;
  stargazers_count: number;
  language: string | null;
  isConnected: boolean;
  connectedRepositoryId?: string | null;
  reviewStyle?: string;
  reviewModes?: string[];
  memesEnabled?: boolean;
  customPrompt?: string | null;
  reviewIgnoreGlobs?: string | null;
  aiProvider?: string | null;
  aiModel?: string | null;
  reviewMode?: "auto" | "ask";
  [key: string]: unknown;
}

type RepoDraft = {
  reviewModes: RepoReviewStyle[];
  memesEnabled: boolean;
  customPrompt: string;
  reviewIgnoreGlobs: string;
  aiProvider: string | null;
  aiModel: string | null;
  reviewMode: "auto" | "ask";
};

type Filter = "all" | "connected" | "not-connected";

type ConnectedRepo = {
  id: string;
  name: string;
  owner: string;
  fullName: string;
  url: string;
  reviewStyle: string;
  reviewModes?: string[];
  memesEnabled: boolean;
  customPrompt: string | null;
  reviewIgnoreGlobs?: string | null;
  aiProvider: string | null;
  aiModel: string | null;
  reviewMode?: "auto" | "ask";
  createdAt: Date;
};

const STYLE_LABELS: Record<RepoReviewStyle, string> = {
  balanced: "Balanced",
  professional: "Professional",
  short: "Short",
  funny: "Funny + playful",
  diagram: "Architecture diagrams",
};

const LANGUAGE_COLORS: Record<string, string> = {
  JavaScript: "bg-yellow-400",
  TypeScript: "bg-blue-500",
  Python: "bg-green-500",
  Java: "bg-red-500",
  "C++": "bg-purple-500",
  C: "bg-blue-600",
  Go: "bg-cyan-500",
  Rust: "bg-orange-500",
  Ruby: "bg-red-600",
  Swift: "bg-pink-500",
  Kotlin: "bg-purple-600",
  PHP: "bg-indigo-500",
};

function languageColor(language: string | null) {
  if (!language) return "bg-neutral-400";
  return LANGUAGE_COLORS[language] || "bg-neutral-400";
}

export function RepositoryManager() {
  const { data, isLoading, isError, hasNextPage, isFetchingNextPage, fetchNextPage } =
    useRepositories();
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const queryClient = useQueryClient();
  const connectMutation = useConnectRepository();
  const { data: subscription } = useSubscription();

  const {
    data: connectedRepos = [],
  } = useQuery({
    queryKey: ["connected-repositories"],
    queryFn: async () => (await getConnectedRepositories()) as ConnectedRepo[],
    staleTime: 30_000,
  });

  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<Record<string, Partial<RepoDraft>>>({});

  const githubRepos = (data?.pages.flat() as unknown as Repository[] | undefined) ?? [];

  // Connected repos come from the DB so they always show up, even if they
  // are outside the current GitHub page window (10 per page).
  const githubByFullName = new Map(
    githubRepos.map((repo) => [repo.fullName, repo] as const),
  );
  const dbOnlyConnected = connectedRepos
    .filter((repo) => !githubByFullName.has(repo.fullName))
    .map((repo) => {
      // Deterministic numeric id for stable React keys when GitHub data is unavailable
      let hash = 0;
      for (let i = 0; i < repo.fullName.length; i += 1) {
        hash = (hash * 31 + repo.fullName.charCodeAt(i)) | 0;
      }
      return {
        id: Math.abs(hash),
        name: repo.name,
        full_name: repo.fullName,
        fullName: repo.fullName,
        description: null,
        html_url: repo.url,
        stargazers_count: 0,
        language: null,
        isConnected: true,
        connectedRepositoryId: repo.id,
        reviewStyle: repo.reviewStyle,
        reviewModes: repo.reviewModes || normalizeRepoReviewModes(repo.reviewStyle),
        memesEnabled: repo.memesEnabled,
        customPrompt: repo.customPrompt,
        reviewIgnoreGlobs: repo.reviewIgnoreGlobs ?? null,
        aiProvider: repo.aiProvider,
        aiModel: repo.aiModel,
        reviewMode: repo.reviewMode ?? "auto",
      } as Repository
    });

  const allRepos = [
    ...githubRepos,
    ...dbOnlyConnected,
  ];

  const repos = allRepos.filter((repo) => {
    const matchesFilter =
      filter === "all"
        ? true
        : filter === "connected"
          ? repo.isConnected
          : !repo.isConnected;
    const q = query.trim().toLowerCase();
    if (!q) return matchesFilter;
    return (
      matchesFilter &&
      (repo.name.toLowerCase().includes(q) ||
        (repo.description ?? "").toLowerCase().includes(q) ||
        (repo.language ?? "").toLowerCase().includes(q) ||
        repo.fullName.toLowerCase().includes(q))
    );
  });

  const connectedCount = allRepos.filter((repo) => repo.isConnected).length;
  const repoLimit = repoLimitFor(subscription?.plan);
  const atRepoLimit = repoLimit !== -1 && connectedCount >= repoLimit;

  // Auto-fetch more GitHub pages as the user scrolls
  useEffect(() => {
    if (!hasNextPage || isFetchingNextPage) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) fetchNextPage();
      },
      { rootMargin: "200px" },
    );
    if (loadMoreRef.current) observer.observe(loadMoreRef.current);
    return () => observer.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  const selected = repos.find(
    (repo) =>
      String(repo.id) === selectedId || repo.connectedRepositoryId === selectedId,
  );

  const disconnectMutation = useMutation({
    mutationFn: async (repositoryId: string) =>
      disconnectRepository(repositoryId),

    // Optimistic: mark the repo as disconnected and drop it from the connected list
    // immediately - the sheet also closes right away.
    onMutate: async (repositoryId) => {
      setSelectedId(null); // close sheet immediately
      await queryClient.cancelQueries({ queryKey: ["repositories"] });
      await queryClient.cancelQueries({ queryKey: ["connected-repositories"] });
      const previousRepos = queryClient.getQueryData(["repositories"]);
      const previousConnected = queryClient.getQueryData(["connected-repositories"]);
      queryClient.setQueryData(["repositories"], (old: unknown) => {
        if (!old || typeof old !== "object") return old;
        const oldPages = (old as { pages?: Array<Array<Record<string, unknown>>> }).pages;
        if (!Array.isArray(oldPages)) return old;
        const updatedPages = oldPages.map((page) =>
          page.map((repo) =>
            String(repo.connectedRepositoryId) === repositoryId
              ? { ...repo, isConnected: false, connectedRepositoryId: null }
              : repo,
          ),
        );
        return { ...(old as Record<string, unknown>), pages: updatedPages };
      });
      queryClient.setQueryData(["connected-repositories"], (old: Array<{ id: string }> | undefined) => {
        if (!old) return old;
        return old.filter((r) => r.id !== repositoryId);
      });
      return { previousRepos, previousConnected };
    },

    onSuccess: () => {
      toast.success("Repository disconnected");
    },

    // Rollback on failure only
    onError: (_err, _vars, context) => {
      if (context?.previousRepos !== undefined) {
        queryClient.setQueryData(["repositories"], context.previousRepos);
      }
      if (context?.previousConnected !== undefined) {
        queryClient.setQueryData(["connected-repositories"], context.previousConnected);
      }
      toast.error("Failed to disconnect repository");
    },

    // Always resync from server after settle (in case of drift)
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      queryClient.invalidateQueries({ queryKey: ["connected-repositories"] });
    },
  });

  const saveMutation = useMutation({
    mutationFn: async ({
      repo,
      draft,
    }: {
      repo: Repository;
      draft: RepoDraft;
    }) =>
      updateRepositoryBehaviorSettings({
        repositoryId: repo.connectedRepositoryId!,
        reviewModes: draft.reviewModes,
        memesEnabled: draft.memesEnabled,
        customPrompt: draft.customPrompt,
        reviewIgnoreGlobs: draft.reviewIgnoreGlobs,
        aiProvider: draft.aiProvider,
        aiModel: draft.aiModel,
        reviewMode: draft.reviewMode,
      }),
    onSuccess: () => {
      toast.success("Repository settings saved");
      queryClient.invalidateQueries({ queryKey: ["repositories"] });
      queryClient.invalidateQueries({ queryKey: ["connected-repositories"] });
    },
    onError: () => {
      toast.error("Failed to save settings");
    },
  });

  const countFor = (value: Filter) => {
    if (value === "connected") return connectedCount;
    if (value === "not-connected") return allRepos.length - connectedCount;
    return allRepos.length;
  };

  const filters: { label: string; value: Filter }[] = [
    { label: "All", value: "all" },
    { label: "Connected", value: "connected" },
    { label: "Not connected", value: "not-connected" },
  ];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-2xl font-semibold tracking-tight">Projects</h1>
        <p className="text-sm text-muted-foreground">
          Your repositories - connect one, then configure how CodeTurtle reviews
          it.
        </p>
      </div>

      {atRepoLimit && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-500/25 bg-amber-500/5 px-4 py-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="text-amber-700 dark:text-amber-400">
            <span className="font-semibold">Repository limit reached.</span>{" "}
            Your plan allows up to <span className="font-medium">{repoLimit} repositories</span> ({connectedCount} connected).
          </div>
          <Link
            href="/billing"
            className="inline-flex shrink-0 items-center gap-1 font-semibold text-amber-700 underline hover:text-amber-800 dark:text-amber-400 dark:hover:text-amber-300"
          >
            Upgrade to connect more →
          </Link>
        </div>
      )}

      {/* Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="relative w-full sm:max-w-xs">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search repositories..."
            className="pl-9"
          />
        </div>
        <div className="flex items-center gap-1 rounded-lg border p-1">
          {filters.map(({ label, value }) => (
            <button
              key={value}
              onClick={() => setFilter(value)}
              className={cn(
                "rounded-md px-3 py-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground",
                filter === value && "bg-muted text-foreground",
              )}
            >
              {label}
              <span className="ml-1.5 text-xs text-muted-foreground">
                {countFor(value)}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* Project grid */}
      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, index) => (
            <Card key={index} className="p-4">
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="mt-3 h-3 w-2/3" />
              <Skeleton className="mt-6 h-2 w-1/2" />
            </Card>
          ))}
        </div>
      ) : isError ? (
        <div className="rounded-lg border p-8 text-center text-sm text-muted-foreground">
          Failed to load repositories. Check your GitHub connection.
        </div>
      ) : repos.length === 0 ? (
        <div className="rounded-lg border border-dashed p-12 text-center">
          <GitBranch className="mx-auto h-8 w-8 text-muted-foreground/40" />
          <p className="mt-3 text-sm font-medium">
            {query ? "No repositories match your search" : "No repositories found"}
          </p>
          <p className="mt-1 text-xs text-muted-foreground">
            {query
              ? "Try a different search term."
              : "Your GitHub account has no repositories yet."}
          </p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {repos.map((repo) => (
            <ProjectCard
              key={repo.id}
              repo={repo}
              onConfigure={() =>
                setSelectedId(repo.connectedRepositoryId || String(repo.id))
              }
              onConnect={() => {
                if (atRepoLimit) {
                  toast.error(`Your plan allows up to ${repoLimit} repositories - upgrade to connect more`);
                  return;
                }
                const [owner, name] = repo.fullName.split("/");
                connectMutation.mutate(
                  { owner, repo: name, githubId: repo.id },
                  {
                    onSuccess: () =>
                      toast.success(`Connected ${repo.fullName}`),
                    onError: () =>
                      toast.error(`Failed to connect ${repo.fullName}`),
                  },
                );
              }}
              connecting={connectMutation.isPending}
              connectDisabled={atRepoLimit}
            />
          ))}
        </div>
      )}

      {/* Auto-load sentinel for infinite scroll */}
      {hasNextPage && (
        <div ref={loadMoreRef} className="flex h-8 items-center justify-center pt-2">
          {isFetchingNextPage && (
            <p className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Loading more repositories...
            </p>
          )}
        </div>
      )}

      {/* Detail / settings sheet */}
      {selected && (
        <RepoSheet
          repo={selected}
          open={Boolean(selectedId)}
          onOpenChange={(open) => !open && setSelectedId(null)}
          drafts={drafts}
          setDrafts={setDrafts}
          onDisconnect={() =>
            selected.connectedRepositoryId &&
            disconnectMutation.mutate(selected.connectedRepositoryId)
          }
          disconnecting={disconnectMutation.isPending}
          onSave={(draft) => saveMutation.mutate({ repo: selected, draft })}
          saving={saveMutation.isPending}
        />
      )}
    </div>
  );
}

function ProjectCard({
  repo,
  onConfigure,
  onConnect,
  connecting,
  connectDisabled = false,
}: {
  repo: Repository;
  onConfigure: () => void;
  onConnect: () => void;
  connecting: boolean;
  connectDisabled?: boolean;
}) {
  return (
    <Card className="group flex flex-col gap-4 p-5 transition-colors hover:border-primary/40">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <a
            href={repo.html_url}
            target="_blank"
            rel="noreferrer noopener"
            className="flex items-center gap-1.5 font-medium hover:underline"
          >
            <span className="truncate">{repo.name}</span>
            <ExternalLink className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
          </a>
          <p className="mt-1 truncate text-xs text-muted-foreground">
            {repo.description || "No description"}
          </p>
        </div>
        <Badge variant={repo.isConnected ? "default" : "secondary"} className="shrink-0">
          {repo.isConnected ? "Connected" : "Not connected"}
        </Badge>
      </div>

      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        {repo.language && (
          <span className="flex items-center gap-1.5">
            <span
              className={cn("h-2.5 w-2.5 rounded-full", languageColor(repo.language))}
            />
            {repo.language}
          </span>
        )}
        <span className="flex items-center gap-1">
          <Star className="h-3.5 w-3.5" />
          {repo.stargazers_count}
        </span>
        <span className="font-mono text-[10px]">{repo.fullName}</span>
      </div>

      <div className="mt-auto flex items-center justify-between border-t pt-3">
        {repo.isConnected ? (
          <>
            <Button variant="ghost" size="sm" className="h-8 px-2 text-muted-foreground" asChild>
              <Link href={`/repositories/${repo.connectedRepositoryId}`}>
                Reviews
                <ArrowRight className="ml-1.5 h-3.5 w-3.5" />
              </Link>
            </Button>
            <Button size="sm" variant="outline" className="h-8" onClick={onConfigure}>
              <Settings2 className="mr-1.5 h-4 w-4" />
              Configure
            </Button>
          </>
        ) : (
          <Button
            size="sm"
            className="h-8"
            variant={connectDisabled ? "secondary" : "default"}
            asChild={connectDisabled}
            disabled={connecting}
            onClick={connectDisabled ? undefined : onConnect}
          >
            {connectDisabled ? (
              <Link href="/billing">
                <Lock className="mr-1.5 h-4 w-4" />
                Upgrade
              </Link>
            ) : connecting ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Connecting...
              </>
            ) : (
              <>
                <Plug className="mr-1.5 h-4 w-4" />
                Connect
              </>
            )}
          </Button>
        )}
      </div>
    </Card>
  );
}

function RepoSheet({
  repo,
  open,
  onOpenChange,
  drafts,
  setDrafts,
  onDisconnect,
  disconnecting,
  onSave,
  saving,
}: {
  repo: Repository;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  drafts: Record<string, Partial<RepoDraft>>;
  setDrafts: React.Dispatch<React.SetStateAction<Record<string, Partial<RepoDraft>>>>;
  onDisconnect: () => void;
  disconnecting: boolean;
  onSave: (draft: RepoDraft) => void;
  saving: boolean;
}) {
  const key = repo.connectedRepositoryId || String(repo.id);
  const { data: AI_PROVIDERS = [], forceRefresh } = useAvailableProviders();
  const { data: subscription } = useSubscription();
  const customRulesLocked = !canUseCustomRulesFor(subscription?.plan);
  const base: RepoDraft = {
    reviewModes: normalizeRepoReviewModes(repo.reviewModes || repo.reviewStyle),
    memesEnabled: repo.memesEnabled ?? true,
    customPrompt: repo.customPrompt || "",
    reviewIgnoreGlobs: repo.reviewIgnoreGlobs || "",
    aiProvider: repo.aiProvider || null,
    aiModel: repo.aiModel || null,
    reviewMode: (repo.reviewMode as "auto" | "ask" | undefined) ?? "auto",
  };
  const merged = { ...base, ...(drafts[key] || {}) };
  const update = (patch: Partial<RepoDraft>) =>
    setDrafts((prev) => ({ ...prev, [key]: { ...(prev[key] || {}), ...patch } }));

  const providerData = AI_PROVIDERS.find((p) => p.id === merged.aiProvider);
  const isStaleModel = Boolean(merged.aiProvider && merged.aiModel && providerData && !providerData.models.find((m) => m.id === merged.aiModel));

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-2xl">
        <SheetHeader>
          <SheetTitle>{repo.name}</SheetTitle>
          <SheetDescription>
            {repo.fullName}
            {repo.isConnected ? " - connected" : ""}
          </SheetDescription>
        </SheetHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-5 overflow-y-auto px-4 py-5">
          {/* Review mode */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Review mode
            </Label>
            <div className="flex flex-col gap-1.5">
              {([
                { value: "auto", label: "Auto (review on PR open)" },
                { value: "ask", label: "Ask (confirm before review)" },
              ] as const).map(({ value, label }) => (
                <label
                  key={value}
                  className={`flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 hover:bg-muted/50 ${
                    merged.reviewMode === value ? "border-primary bg-primary/5" : ""
                  }`}
                >
                  <input
                    type="radio"
                    name="review-mode"
                    value={value}
                    checked={merged.reviewMode === value}
                    onChange={() => update({ reviewMode: value })}
                    className="accent-primary"
                  />
                  <span className="text-xs leading-tight">{label}</span>
                </label>
              ))}
            </div>
          </div>

          {/* Review behavior */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <Label className="text-[11px] uppercase tracking-wide text-muted-foreground">
              Review style
            </Label>
            <div className="flex flex-col gap-1.5">
              {REPO_REVIEW_STYLE_OPTIONS.map((style) => {
                const checked = merged.reviewModes.includes(style);
                return (
                  <label
                    key={style}
                    className="flex cursor-pointer items-center gap-2 rounded-md border p-2 hover:bg-muted/50"
                  >
                    <Checkbox
                      checked={checked}
                      onCheckedChange={(next) => {
                        if (style === "balanced") {
                          update({
                            reviewModes: next ? ["balanced"] : merged.reviewModes,
                          });
                          return;
                        }
                        const current = merged.reviewModes.filter(
                          (mode) => mode !== "balanced",
                        );
                        const updated = next
                          ? [...current, style]
                          : current.filter((mode) => mode !== style);
                        update({
                          reviewModes: updated.length ? updated : ["balanced"],
                        });
                      }}
                    />
                    <span className="text-xs leading-tight">{STYLE_LABELS[style]}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Memes */}
          <label className="flex cursor-pointer items-center justify-between rounded-md border p-3 hover:bg-muted/50">
            <span>
              <span className="text-sm font-medium">Memes in review</span>
              <span className="mt-0.5 block text-xs text-muted-foreground">
                Allows playful, context-aware memes when relevant.
              </span>
            </span>
            <Switch
              checked={merged.memesEnabled}
              onCheckedChange={(checked) => update({ memesEnabled: checked })}
            />
          </label>

          {/* Custom prompt */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label htmlFor={`prompt-${key}`} className="text-xs uppercase text-muted-foreground">
                Custom instructions
              </Label>
              {customRulesLocked && (
                <Badge variant="outline" className="gap-1 border-amber-500/40 bg-amber-500/10 text-[10px] text-amber-600 dark:text-amber-400">
                  <Lock className="h-3 w-3" />
                  Pro
                </Badge>
              )}
            </div>
            <Textarea
              id={`prompt-${key}`}
              rows={4}
              maxLength={2000}
              placeholder="e.g. Focus on security, migration risk, and API stability."
              value={merged.customPrompt}
              onChange={(event) => update({ customPrompt: event.target.value })}
              disabled={customRulesLocked}
              className={customRulesLocked ? "opacity-60" : undefined}
            />
            {customRulesLocked ? (
              <p className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                Custom rules are a <span className="font-semibold text-amber-600 dark:text-amber-400">Pro feature</span>.
                <Link href="/billing" className="font-medium text-primary hover:underline">
                  Upgrade →
                </Link>
              </p>
            ) : (
              <p className="text-[10px] text-muted-foreground">
                {merged.customPrompt.length}/2000 - appended to every review for this repository.
              </p>
            )}
          </div>

          {/* Ignore paths */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <Label htmlFor={`ignore-${key}`} className="text-xs uppercase text-muted-foreground">
              Ignore paths (globs)
            </Label>
            <Textarea
              id={`ignore-${key}`}
              rows={2}
              maxLength={500}
              placeholder="e.g. docs/, **/*.test.ts, src/generated/, *.snap"
              value={merged.reviewIgnoreGlobs}
              onChange={(event) => update({ reviewIgnoreGlobs: event.target.value })}
            />
            <p className="text-[10px] text-muted-foreground">
              Comma- or newline-separated globs skipped during review - lockfiles, minified assets, and binary-ish files are always skipped. {merged.reviewIgnoreGlobs.length}/500
            </p>
          </div>

          {/* AI provider */}
          <div className="flex flex-col gap-2 border-t pt-4">
            <div className="flex items-center justify-between">
              <Label className="text-xs uppercase text-muted-foreground">
                AI provider (this repository only)
              </Label>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await forceRefresh();
                    toast.success("Live catalog refreshed");
                  } catch (err) {
                    toast.error(err instanceof Error ? err.message : "Failed to refresh catalog");
                  }
                }}
                aria-label="Refresh live catalog"
                title="Refresh live catalog"
                className="text-xs text-muted-foreground hover:text-foreground"
              >
                ↻ Refresh
              </button>
            </div>
            {isStaleModel && (
              <div className="rounded-md border border-amber-500/30 bg-amber-500/5 p-3 text-xs text-amber-700 dark:text-amber-400">
                <p className="font-semibold">Your saved model is stale</p>
                <p className="mt-0.5">
                  <code className="rounded bg-amber-500/10 px-1">{merged.aiModel}</code> is no longer available on {providerData?.name}. The live catalog was refreshed - pick a live model below.
                </p>
              </div>
            )}
            <Select
              value={merged.aiProvider ?? "__default__"}
              onValueChange={(value) =>
                update({
                  aiProvider: value === "__default__" ? null : value,
                  aiModel: value === "__default__" ? null : merged.aiModel || "",
                })
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Use account default" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="__default__">Use account default</SelectItem>
                {AI_PROVIDERS.map((provider) => (
                  <SelectItem key={provider.id} value={provider.id}>
                    {provider.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {merged.aiProvider && (
              <ModelPicker
                models={AI_PROVIDERS.find((p) => p.id === merged.aiProvider)?.models || []}
                value={merged.aiModel || null}
                onChange={(value) => update({ aiModel: value })}
                placeholder="Select model"
              />
            )}
          </div>
        </div>

        <SheetFooter className="justify-between border-t">
          <Button
            variant="destructive"
            size="sm"
            onClick={onDisconnect}
            disabled={disconnecting || !repo.connectedRepositoryId}
          >
            {disconnecting ? (
              <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
            ) : (
              <Trash2 className="mr-1.5 h-4 w-4" />
            )}
            Disconnect
          </Button>
          <Button
            size="sm"
            onClick={() => onSave(merged)}
            disabled={saving || !repo.connectedRepositoryId}
          >
            {saving ? (
              <>
                <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />
                Saving...
              </>
            ) : (
              "Save changes"
            )}
          </Button>
        </SheetFooter>
      </SheetContent>
    </Sheet>
  );
}

export default RepositoryManager;
