"use client";
import React, { useState, useEffect } from "react";
import { ActivityCalendar } from "react-activity-calendar";
import { useTheme } from "next-themes";
import { useQuery } from "@tanstack/react-query";
import { getContributionGraph } from "@/module/dashboard/actions";
import { getReviews } from "@/module/review/actions";
import { Spinner } from "../ui/spinner";

const ContributionGraph = () => {
  const { theme } = useTheme();
  const [screenSize, setScreenSize] = useState<"sm" | "md" | "lg">("lg");
  const [year, setYear] = useState<number>(0); // 0 = trailing 12 months
  const currentYear = new Date().getFullYear();
  const [reviewHover, setReviewHover] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  const { data: allReviews } = useQuery({
    queryKey: ["contribution-graph-reviews"],
    queryFn: async () => await getReviews({ limit: 200 }),
    staleTime: 1000 * 60 * 5,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    const updateScreenSize = () => {
      if (window.innerWidth < 640) {
        setScreenSize("sm");
      } else if (window.innerWidth < 1024) {
        setScreenSize("md");
      } else {
        setScreenSize("lg");
      }
    };

    updateScreenSize();
    window.addEventListener("resize", updateScreenSize);
    return () => window.removeEventListener("resize", updateScreenSize);
  }, []);

  const { data, isLoading, error } = useQuery({
    queryKey: ["contribution-graph", year],
    queryFn: async () => {
      try {
        const result = await getContributionGraph(year === 0 ? undefined : year);
        // Ensure contributions is always an array
        if (!result.contributions || !Array.isArray(result.contributions)) {
          console.warn("Invalid contributions data:", result);
          return { contributions: [], totalContributions: 0, reviewsPerDay: {} as Record<string, number>, githubCreatedAt: null };
        }
        return result;
      } catch (err) {
        console.error("Error in contribution graph query:", err);
        // Re-throw to let React Query handle it
        throw err;
      }
    },
    staleTime: 1000 * 60 * 5,        // serve from cache for 5 minutes
    refetchOnWindowFocus: true,      // pick up new contributions on tab focus
    refetchInterval: 1000 * 60 * 5,  // refresh every 5 minutes while visible
    refetchIntervalInBackground: false,
  });
  if (isLoading) {
    return (
      <div className="flex min-h-60 items-center justify-center text-sm text-muted-foreground">
        <Spinner className="mr-2" /> Loading Contribution Graph...
      </div>
    );
  }
  if (error) {
    console.error("Contribution graph error:", error);
    return (
      <div className="w-full flex flex-col items-center justify-center p-8">
        <div className="text-sm text-muted-foreground">
          Failed to load contribution data
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          {error.message?.includes("GitHub account not linked")
            ? "Please connect your GitHub account in settings."
            : "Please check your GitHub connection and try again."}
        </div>
      </div>
    );
  }
  if (!data || !data.contributions || data.contributions.length === 0) {
    console.log("No contribution data available. Data received:", data);
    return (
      <div className="w-full flex flex-col items-center justify-center p-8">
        <div className="text-sm text-muted-foreground">
          No contribution data available
        </div>
        <div className="text-xs text-muted-foreground mt-2">
          Make sure your GitHub account is connected and has contribution data.
        </div>
      </div>
    );
  }

  const today = new Date();
  const datesInYear: { date: string; count: number; level: number; hasReview: boolean }[] = [];

  // Render either the pinned calendar year, or trailing 12 months (default)
  const end = year === 0 ? today : year === currentYear ? today : new Date(Date.UTC(year, 11, 31, 23, 59, 59));
  const start = year === 0 ? new Date(Date.UTC(today.getFullYear() - 1, today.getMonth(), today.getDate())) : new Date(Date.UTC(year, 0, 1));

  // Map contribution date -> count/level
  const contributionByDate = new Map(
    data.contributions.map((d: { date: string; count: number; level: number }) => [d.date, d] as const)
  );
  const reviewsPerDay: Record<string, number> = (data as { reviewsPerDay?: Record<string, number> }).reviewsPerDay ?? {};
  const dropdownStartYear = (data as { githubCreatedAt?: string | null }).githubCreatedAt
    ? Math.max(2020, new Date((data as { githubCreatedAt?: string | null }).githubCreatedAt as string).getFullYear())
    : 2020;

  const cursor = new Date(start);
  while (cursor <= end) {
    const iso = cursor.toISOString().split("T")[0];
    const c = contributionByDate.get(iso);
    datesInYear.push({
      date: iso,
      count: c?.count ?? 0,
      level: c?.level ?? 0,
      hasReview: (reviewsPerDay[iso] ?? 0) > 0,
    });
    cursor.setDate(cursor.getDate() + 1);
  }

  return (
    <div className="w-full flex flex-col items-center justify-center">
      <div className="mb-1 flex flex-wrap items-center justify-between gap-3 w-full">
        <div className="flex items-center gap-3 flex-wrap text-xs text-muted-foreground">
          <span className="leading-none">
            <span className="font-semibold text-foreground">{data.totalContributions}</span>{" "}
            {year === 0 ? "contributions in the last 12 months" : year === currentYear ? "contributions this year" : `contributions in ${year}`}
          </span>
          <span className="hidden md:flex items-center gap-1.5 leading-none">
            <span className="text-muted-foreground">Less</span>
            {(theme === "dark" ? ["#0f3b57", "#16557c", "#0284c7", "#38bdf8"] : ["#cfe8f9", "#7ec0ee", "#3298dc", "#1f6fa8"]).map((c) => (
              <span key={c} className="h-3 w-3 rounded-[3px]" style={{ background: c }} aria-hidden />
            ))}
            <span className="text-muted-foreground">More</span>
            <span className="ml-1 h-3 w-3 rounded-[3px] ring-1 ring-inset" style={{ background: theme === "dark" ? "#f59e0b" : "#fde68a", boxShadow: theme === "dark" ? "0 0 0 1px #fbbf24" : "0 0 0 1px #f59e0b" }} aria-hidden />
            <span>Review completed</span>
          </span>
        </div>
        <select
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
          className="h-7 rounded-md border bg-background px-2 text-xs text-foreground shadow-sm focus:outline-none focus:ring-1 focus:ring-ring"
          aria-label="Select year"
        >
          <option value={0}>Last 12 months</option>
          {Array.from({ length: currentYear - dropdownStartYear + 1 }, (_, i) => currentYear - i).map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </select>
      </div>
      <div className="w-full overflow-hidden">
        <div className="w-full px-0">
          <div className="w-full min-w-max">
            {data.contributions && data.contributions.length > 0 ? (
              <ActivityCalendar
                data={datesInYear}
                colorScheme={theme === "dark" ? "dark" : "light"}
                renderBlock={(block, activity: { date: string; count: number; level: number; hasReview?: boolean }) => {
                  if (activity.hasReview) {
                    const isSelected = selectedDate === activity.date;
                    return (
                      <rect
                        {...block.props}
                        fill={theme === "dark" ? "#f59e0b" : "#fde68a"}
                        className="transition-opacity duration-150 cursor-pointer"
                        onMouseEnter={() => setReviewHover(true)}
                        onMouseLeave={() => setReviewHover(false)}
                        onClick={() => setSelectedDate(isSelected ? null : activity.date)}
                        stroke={theme === "dark" ? "#fbbf24" : "#f59e0b"}
                        strokeWidth={isSelected ? 2.5 : 1.5}
                      />
                    );
                  }
                  return (
                    <rect
                      {...block.props}
                      className={`transition-opacity duration-150 ${reviewHover ? "opacity-20" : "opacity-100"}`}
                    />
                  );
                }}
                blockSize={
                  screenSize === "sm" ? 7 : screenSize === "md" ? 9 : 12
                }
                blockMargin={screenSize === "sm" ? 2 : 2}
                fontSize={screenSize === "sm" ? 12 : 12}
                showWeekdayLabels={screenSize !== "sm"}
                showMonthLabels={screenSize !== "sm"}
                showTotalCount={false}
                theme={{
                  light: [
                    "var(--muted)",
                    "#cfe8f9",
                    "#7ec0ee",
                    "#3298dc",
                    "#1f6fa8",
                  ],
                  dark: [
                    "var(--muted)",
                    "#0f3b57",
                    "#16557c",
                    "#0284c7",
                    "#38bdf8",
                  ],
                }}
                
              />
              
            ) : (
              <div className="text-sm text-muted-foreground">
                No contributions to display
              </div>
            )}
            
          </div>
        </div>
      </div>

      {/* Day details */}
      <div className="w-full mt-3 rounded-lg border bg-card text-card-foreground">
        <div className="flex items-center justify-between border-b px-3 py-2">
          <div className="text-xs font-medium">
            {selectedDate
              ? `Activity on ${new Date(`${selectedDate}T00:00:00Z`).toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric", timeZone: "UTC" })}`
              : "Click an amber cell to see what happened that day"}
          </div>
          {selectedDate && (
            <button
              className="text-xs text-muted-foreground hover:text-foreground"
              onClick={() => setSelectedDate(null)}
            >
              Clear
            </button>
          )}
        </div>
        {selectedDate && (
          <div className="divide-y">
            {(() => {
              const matches = (allReviews ?? []).filter((r) => {
                const d = new Date(r.createdAt).toISOString().split("T")[0];
                return d === selectedDate;
              });
              if (matches.length === 0) {
                return (
                  <div className="px-3 py-4 text-center text-xs text-muted-foreground">
                    No completed reviews or other events on this date. Commits from GitHub may still appear in the heatmap.
                  </div>
                );
              }
              return matches.map((r) => (
                <a
                  key={r.id}
                  href={r.prUrl ?? `https://github.com/${r.owner}/${r.repo}/pull/${r.prNumber}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-start gap-2 px-3 py-3 hover:bg-muted/40"
                >
                  <span className="inline-flex h-6 min-w-7 items-center justify-center rounded-md bg-primary/10 px-1.5 text-[10px] font-semibold text-primary tabular-nums">
                    {(r.files as { overallScore?: number } | null | undefined)?.overallScore ?? "-"}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-xs font-medium text-foreground">{r.owner}/{r.repo} #{r.prNumber}</span>
                    <span className="mt-0.5 block line-clamp-1 text-[11px] text-muted-foreground">{r.prTitle ?? "(untitled)"}</span>
                    <span className="mt-1 block text-[10px] text-muted-foreground">{r.status}</span>
                  </span>
                </a>
              ));
            })()}
          </div>
        )}
      </div>
    </div>
  );
};

export default ContributionGraph;
