import { Suspense } from "react";
import ReviewsList from "@/components/reviews/reviews-list";

export default async function ReviewsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const repoParam = params?.repo;
  const repoFullName =
    typeof repoParam === "string" ? repoParam : Array.isArray(repoParam) ? repoParam[0] : undefined;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Repository reviews</h1>
          <p className="text-muted-foreground">
            {repoFullName
              ? `AI review history for ${repoFullName}`
              : "AI-powered code review results for your repositories"}
          </p>
        </div>
        {repoFullName ? (
          <p className="text-xs text-muted-foreground">
            Filtering by repository.{" "}
            <a href="/reviews" className="text-primary underline-offset-2 hover:underline">
              Clear
            </a>
          </p>
        ) : null}
      </div>
      <Suspense>
        <ReviewsList initialRepoFullName={repoFullName} />
      </Suspense>
    </div>
  );
}
