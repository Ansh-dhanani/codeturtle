"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from "@/components/ui/command";
import { navGroups } from "@/components/app-shared";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";
import { getConnectedRepositories } from "@/module/settings/actions";
import { getReviews } from "@/module/review/actions";
import { useQuery } from "@tanstack/react-query";
import {
  Home,
  BarChart3,
  FolderGit2,
  GitPullRequest,
  CreditCard,
  User,
  Settings as SettingsIcon,
  LifeBuoy,
  BookOpen,
  SearchIcon,
  ArrowRight,
  ChevronRight,
  type LucideIcon,
} from "lucide-react";

const routeIndex: Array<{ id: string; label: string; hint?: string; href: string; icon: LucideIcon }> = [
  { id: "page-dashboard", label: "Overview", hint: "Dashboard home", href: "/dashboard", icon: Home },
  { id: "page-analytics", label: "Analytics", hint: "Reviews, scores, weekly trends", href: "/analytics", icon: BarChart3 },
  { id: "page-repositories", label: "Repositories", hint: "Connect & configure repos", href: "/repositories", icon: FolderGit2 },
  { id: "page-reviews", label: "Reviews", hint: "All your completed & failed reviews", href: "/reviews", icon: GitPullRequest },
  { id: "page-billing", label: "Billing", hint: "Plan, usage, upgrade", href: "/billing", icon: CreditCard },
  { id: "page-account", label: "Account", hint: "Profile & security", href: "/account", icon: User },
  { id: "page-settings", label: "Settings", hint: "AI model, API keys, profile", href: "/settings", icon: SettingsIcon },
  { id: "page-support", label: "Support", hint: "FAQs, contact", href: "/support", icon: LifeBuoy },
  { id: "page-docs", label: "Docs", hint: "How CodeTurtle works", href: "/docs", icon: BookOpen },
];

const allSidebarItems = navGroups.flatMap((g) =>
  g.items.map((item) => ({ label: item.title, href: item.url, hint: g.label ?? "Pages" })),
);

// Trigger button + modal palette in one component
export function CommandPalette() {
  const router = useRouter();
  const [open, setOpen] = useState(false);

  const openPalette = () => {
    trackEvent(AnalyticsEvents.commandPaletteOpened);
    setOpen(true);
  };

  const { data: connectedRepos = [] } = useQuery({
    queryKey: ["palette-repos"],
    queryFn: async () => (await getConnectedRepositories()) as Array<{ id: string; fullName: string; owner: string; name: string }>,
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: open,
  });

  const { data: recentReviews = [] } = useQuery({
    queryKey: ["palette-reviews"],
    queryFn: async () => await getReviews({ limit: 20 }),
    staleTime: 60_000,
    refetchOnWindowFocus: false,
    enabled: open,
  });

  useEffect(() => {
    const down = (event: KeyboardEvent) => {
      if ((event.key === "k" && (event.metaKey || event.ctrlKey)) || event.key === "K") {
        event.preventDefault();
        setOpen((prev) => {
          if (!prev) trackEvent(AnalyticsEvents.commandPaletteOpened, { source: "keyboard" });
          return !prev;
        });
      } else if (event.key === "/" && !isEditableTarget(event.target as HTMLElement)) {
        event.preventDefault();
        trackEvent(AnalyticsEvents.commandPaletteOpened, { source: "slash" });
        setOpen(true);
      }
    };
    document.addEventListener("keydown", down);
    return () => document.removeEventListener("keydown", down);
  }, []);

  const navigate = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        className="group flex h-8 items-center gap-2 rounded-md border bg-background px-3 text-xs text-muted-foreground shadow-sm transition hover:border-primary/40 hover:text-foreground w-64 md:w-80 lg:w-96"
        aria-label="Open search (⌘K)"
      >
        <SearchIcon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">Search pages, repos, reviews…</span>
        <kbd className="flex shrink-0 items-center gap-1 rounded border bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground/70">
          <span>⌘</span>
          <span>K</span>
        </kbd>
      </button>

      <CommandDialog open={open} onOpenChange={setOpen}>
        <CommandInput placeholder="Search pages, repos, reviews..." />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>

          <CommandGroup heading="Navigate">
            {routeIndex.map((item) => {
              const Icon = item.icon;
              return (
                <CommandItem
                  key={item.id}
                  value={`navigate ${item.label} ${item.hint ?? ""} ${item.href}`}
                  onSelect={() => navigate(item.href)}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" />
                  <span>{item.label}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                    {item.href}
                  </span>
                </CommandItem>
              );
            })}
            {allSidebarItems
              .filter((item) => !routeIndex.some((r) => r.href === item.href))
              .map((item) => (
                <CommandItem
                  key={`s-${item.href}`}
                  value={`nav ${item.label} ${item.hint} ${item.href}`}
                  onSelect={() => navigate(item.href)}
                >
                  <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" />
                  <span>{item.label}</span>
                  <span className="ml-auto font-mono text-[10px] text-muted-foreground/60">
                    {item.href}
                  </span>
                </CommandItem>
              ))}
          </CommandGroup>

          {connectedRepos.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Connected repositories">
                {connectedRepos.slice(0, 10).map((repo) => (
                  <CommandItem
                    key={repo.id}
                    value={`repo ${repo.fullName}`}
                    onSelect={() => navigate(`/repositories/${repo.id}`)}
                  >
                    <FolderGit2 className="size-4 shrink-0 text-primary" />
                    <span className="font-mono text-xs">{repo.fullName}</span>
                    <ChevronRight className="ml-auto size-3 text-muted-foreground/70" />
                  </CommandItem>
                ))}
              </CommandGroup>
            </>
          )}

          {recentReviews.length > 0 && (
            <>
              <CommandSeparator />
              <CommandGroup heading="Recent reviews">
                {recentReviews.slice(0, 8).map((review) => {
                  const files = review.files as { overallScore?: number } | null | undefined;
                  const score = files?.overallScore;
                  return (
                    <CommandItem
                      key={review.id}
                      value={`review ${review.owner}/${review.repo} ${review.prNumber} ${review.prTitle ?? ""}`}
                      onSelect={() => navigate("/reviews")}
                    >
                      <GitPullRequest className="size-4 shrink-0 text-muted-foreground" />
                      <span className="font-mono text-xs">{review.owner}/{review.repo} #{review.prNumber}</span>
                      {typeof score === "number" && (
                        <span className="ml-auto inline-flex h-5 min-w-6 items-center justify-center rounded bg-primary/10 px-1.5 text-[10px] font-semibold text-primary tabular-nums">
                          {score}/10
                        </span>
                      )}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </>
          )}

          <CommandSeparator />
          <CommandGroup heading="Actions">
            <CommandItem value="action download report" onSelect={() => navigate("/analytics")}>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              Download analytics report
            </CommandItem>
            <CommandItem value="action upgrade pro enterprise" onSelect={() => navigate("/billing")}>
              <CreditCard className="size-4 shrink-0 text-muted-foreground" />
              Upgrade to Pro or Enterprise
            </CommandItem>
            <CommandItem value="action theme dark light" onSelect={() => document.documentElement.classList.toggle("dark")}>
              <ArrowRight className="size-4 shrink-0 text-muted-foreground" />
              Toggle theme
            </CommandItem>
          </CommandGroup>
        </CommandList>
      </CommandDialog>
    </>
  );
}

function isEditableTarget(target: HTMLElement | null) {
  if (!target) return false;
  const tag = target.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target.isContentEditable;
}
