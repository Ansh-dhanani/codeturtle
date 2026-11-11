import { auth } from "@/lib/auth";
import { headers } from "next/headers";
import prisma from "@/lib/prisma";
import { notFound } from "next/navigation";
import { RepositoryReviewFeed } from "@/components/repositories/repository-review-feed";
import { formatDistanceToNow } from "date-fns";
import Link from "next/link";

export const dynamic = "force-dynamic";

export default async function RepositoryDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;

  const repo = await prisma.repository.findFirst({
    where: { id, userId: session.user.id },
    select: {
      id: true,
      name: true,
      owner: true,
      fullName: true,
      url: true,
      reviewStyle: true,
      memesEnabled: true,
      aiProvider: true,
      aiModel: true,
      createdAt: true,
    },
  });
  if (!repo) return notFound();

  const reviews = await prisma.codeReview.findMany({
    where: { repositoryId: repo.id, userId: session.user.id },
    orderBy: { createdAt: "desc" },
    take: 50,
    select: {
      id: true,
      prNumber: true,
      prTitle: true,
      prUrl: true,
      sha: true,
      summary: true,
      files: true,
      status: true,
      createdAt: true,
    },
  });

  const completed = reviews.filter((r) => r.status === "completed");
  const scores = completed
    .map((r) => (r.files as Record<string, unknown> | null)?.overallScore as number)
    .filter((s): s is number => typeof s === "number" && !Number.isNaN(s));
  const avgScore = scores.length > 0 ? Math.round((scores.reduce((a, b) => a + b, 0) / scores.length) * 10) / 10 : null;
  const lastSha = completed[0]?.sha || null;
  const lastReviewAt = completed[0]?.createdAt || null;

  const prsReviewed = new Set(reviews.map((r) => r.prNumber).filter((n) => n != null)).size;

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="space-y-2">
          <Link
            href="/repositories"
            className="text-xs text-muted-foreground hover:text-foreground"
          >
            ← Repositories
          </Link>
          <div className="flex items-center gap-3">
            <h1 className="text-2xl font-semibold tracking-tight">{repo.name}</h1>
            <a
              href={repo.url}
              target="_blank"
              rel="noreferrer noopener"
              className="text-xs text-muted-foreground hover:text-foreground hover:underline"
            >
              Open on GitHub →
            </a>
          </div>
          <p className="text-sm text-muted-foreground">{repo.fullName}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <span className="rounded-md border bg-card px-2 py-1 text-[11px] text-muted-foreground">
            Style: <strong className="text-foreground">{repo.reviewStyle}</strong>
          </span>
          <span className="rounded-md border bg-card px-2 py-1 text-[11px] text-muted-foreground">
            Provider:{" "}
            <strong className="text-foreground">
              {repo.aiProvider || "account default"}
            </strong>{" "}
            {repo.aiModel ? <code className="text-foreground">{repo.aiModel}</code> : null}
          </span>
          <span className="rounded-md border bg-card px-2 py-1 text-[11px] text-muted-foreground">
            Memes:{" "}
            <strong className="text-foreground">
              {repo.memesEnabled ? "Enabled" : "Disabled"}
            </strong>
          </span>
        </div>
      </div>

      {/* Stats bar */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Total reviews" value={String(reviews.length)} />
        <StatCard label="PRs reviewed" value={String(prsReviewed)} />
        <StatCard
          label="Avg score"
          value={avgScore != null ? String(avgScore) : "-"}
        />
        <StatCard
          label="Last review"
          value={
            lastReviewAt
              ? formatDistanceToNow(new Date(lastReviewAt), { addSuffix: true })
              : "Never"
          }
          sub={lastSha?.slice(0, 7)}
        />
      </div>

      {/* Reviews feed */}
      <RepositoryReviewFeed reviews={reviews} repoFullName={repo.fullName} />
    </div>
  );
}

function StatCard({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-lg border bg-card p-4">
      <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
        {label}
      </p>
      <p className="mt-1 text-2xl font-semibold tabular-nums">{value}</p>
      {sub ? (
        <p className="mt-1 font-mono text-xs text-muted-foreground">{sub}</p>
      ) : null}
    </div>
  );
}
