import { FullWidthDivider } from "@/components/full-width-divider";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import {
	ActivityIcon,
	MessagesSquareIcon,
	GitBranchIcon,
	ArrowUpRightIcon,
	CheckCircleIcon,
} from "lucide-react";

export function LandingDeepDive() {
	return (
		<section
			aria-labelledby="deep-dive-heading"
			className="mx-auto w-full max-w-5xl border-x py-4"
		>
			<div className="flex flex-col gap-2 px-4 py-8 md:px-6 md:py-12">
				<h2
					className="font-heading text-balance font-medium text-3xl md:text-4xl"
					id="deep-dive-heading"
				>
					A review pipeline, not a{" "}
					<span className="font-serif italic">chatbot</span>
				</h2>
				<p className="max-w-lg text-pretty text-muted-foreground text-sm md:text-base">
					Every stage is observable, rate-limited, and asynchronous - designed
					like production infrastructure.
				</p>
			</div>

			<div className="relative">
				<FullWidthDivider position="top" />

				<div className="grid grid-cols-1 items-center gap-8 px-4 py-10 md:grid-cols-2 md:gap-12 md:px-6 md:py-14">
					<div className="flex flex-col gap-3">
						<Badge variant="outline">Live progress</Badge>
						<h3 className="font-heading text-2xl font-medium">
							Watch the review run in real time
						</h3>
						<p className="text-pretty text-muted-foreground text-sm md:text-base">
							CodeTurtles posts a progress comment the moment your PR is
							opened, then updates it through every stage - fetching the diff,
							retrieving codebase context, running the model, and posting
							findings. No wondering whether anything is happening.
						</p>
						<ul className="mt-2 flex flex-col gap-2">
							{[
								"Stage-by-stage status updates",
								"Per-PR usage tracked against your plan",
								"Rate-limited, idempotent retries via Inngest",
							].map((item) => (
								<li
									className="flex items-start gap-2 text-muted-foreground text-sm"
									key={item}
								>
									<CheckCircleIcon className="mt-0.5 size-4 shrink-0 text-primary" />
									{item}
								</li>
							))}
						</ul>
					</div>
					<ProgressVisual />
				</div>

				<FullWidthDivider />

				<div className="grid grid-cols-1 items-center gap-8 px-4 py-10 md:grid-cols-2 md:gap-12 md:px-6 md:py-14">
					<div className="order-2 flex flex-col gap-3 md:order-1">
						<Badge variant="outline">Threaded mentions</Badge>
						<h3 className="font-heading text-2xl font-medium">
							Ask follow-ups where they belong
						</h3>
						<p className="text-pretty text-muted-foreground text-sm md:text-base">
							Every reply lands in the exact thread you asked in - a review
							comment about auth logic stays on that review comment, with
							nothing taken out of context.
						</p>
					</div>
					<div className="order-1 md:order-2">
						<MentionVisual />
					</div>
				</div>

				<FullWidthDivider />

				<div className="grid grid-cols-1 items-center gap-8 px-4 py-10 md:grid-cols-2 md:gap-12 md:px-6 md:py-14">
					<div className="flex flex-col gap-3">
						<Badge variant="outline">Mermaid diagrams</Badge>
						<h3 className="font-heading text-2xl font-medium">
							Architecture explained visually
						</h3>
						<p className="text-pretty text-muted-foreground text-sm md:text-base">
							When a change affects flow - new routes, webhook lifecycles,
							data models - CodeTurtle renders a Mermaid diagram instead of
							drowning you in prose.
						</p>
					</div>
					<DiagramVisual />
				</div>

				<FullWidthDivider position="bottom" />
			</div>
		</section>
	);
}

function ProgressVisual() {
	const stages = [
		{ label: "Fetched PR diff", done: true, value: 100 },
		{ label: "Retrieved codebase context", done: true, value: 100 },
		{ label: "Running model review", done: false, value: 64 },
	];
	return (
		<div className="rounded-xl border bg-card p-4 shadow-sm">
			<div className="mb-4 flex items-center gap-2 text-sm">
				<ActivityIcon className="size-4 text-primary" />
				<span className="font-medium">codeturtle - reviewing PR #128</span>
				<span className="ml-auto text-muted-foreground text-xs">41s elapsed</span>
			</div>
			<div className="flex flex-col gap-4">
				{stages.map((stage) => (
					<div className="flex flex-col gap-1.5" key={stage.label}>
						<div className="flex items-center justify-between text-xs">
							<span
								className={
									stage.done ? "text-foreground" : "text-muted-foreground"
								}
							>
								{stage.label}
							</span>
							<span className="text-muted-foreground">
								{stage.done ? "done" : "running"}
							</span>
						</div>
						<Progress value={stage.value} aria-label={stage.label} />
					</div>
				))}
			</div>
		</div>
	);
}

function MentionVisual() {
	return (
		<div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
			<div className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3">
				<span className="text-muted-foreground text-xs">
					<strong className="text-foreground">priya</strong> commented on{" "}
					<span className="font-mono">src/lib/auth.ts</span>
				</span>
				<p className="text-sm">
					@codeturtle why is the webhook scope this broad here?
				</p>
			</div>
			<div className="ml-6 flex flex-col gap-1 rounded-lg border p-3">
				<span className="text-xs">
					<strong>codeturtle</strong>{" "}
					<span className="text-muted-foreground">replied</span>
				</span>
				<p className="text-muted-foreground text-sm">
					The OAuth flow requests <span className="font-mono">admin:repo_hook</span>{" "}
					because webhook subscriptions are managed server-side. If your app
					only reads repos, you can drop to{" "}
					<span className="font-mono">repo</span> - see lines 51-60 and the
					scope table in the docs.
				</p>
			</div>
		</div>
	);
}

function DiagramVisual() {
	return (
		<div className="flex flex-col gap-3 rounded-xl border bg-card p-4 shadow-sm">
			<div className="flex items-center gap-2 text-sm">
				<GitBranchIcon className="size-4 text-primary" />
				<span className="font-medium">Review flow for this PR</span>
				<ArrowUpRightIcon className="ml-auto size-4 text-muted-foreground" />
			</div>
			<div className="rounded-lg bg-muted/60 p-3 font-mono text-xs leading-relaxed text-muted-foreground">
				<pre className="max-w-full overflow-x-auto whitespace-pre-wrap break-words">{`graph LR
  PR --> Webhook --> Inngest
  Inngest --> Diff
  Inngest --> VectorIndex[(Pinecone)]
  Diff --> Model
  VectorIndex --> Model
  Model --> Findings --> PR`}</pre>
			</div>
		</div>
	);
}
