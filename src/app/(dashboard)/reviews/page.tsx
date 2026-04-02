import ReviewsList from "@/components/reviews/reviews-list";

export default function ReviewsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Code Reviews</h1>
        <p className="text-muted-foreground">
          AI-powered code review results for your repositories
        </p>
      </div>
      <ReviewsList />
    </div>
  );
}
