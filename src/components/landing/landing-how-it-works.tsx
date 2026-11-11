import { FullWidthDivider } from "@/components/full-width-divider";
import {
	PlugZapIcon,
	GitPullRequestIcon,
	MessageSquareQuoteIcon,
} from "lucide-react";

const steps = [
	{
		icon: PlugZapIcon,
		step: "01",
		title: "Connect your repository",
		description:
			"Sign in with GitHub, pick a repository, and grant the webhook scope. CodeTurtle starts indexing your codebase into a private vector index so reviews have context from day one.",
	},
	{
		icon: GitPullRequestIcon,
		step: "02",
		title: "Open a pull request",
		description:
			"That's it - the webhook fires, an Inngest function picks up the event, and CodeTurtle posts a progress comment on your PR within seconds.",
	},
	{
		icon: MessageSquareQuoteIcon,
		step: "03",
		title: "Get an actionable review",
		description:
			"Findings arrive schema-validated with severity, file and line references, and concrete fixes. Mention @codeturtle in any thread to ask follow-ups.",
	},
];

export function LandingHowItWorks() {
	return (
		<section
			aria-labelledby="how-it-works-heading"
			className="mx-auto w-full max-w-5xl border-x py-4"
		>
			<div className="flex flex-col gap-2 px-4 py-8 md:px-6 md:py-12">
				<h2
					className="font-heading text-balance font-medium text-3xl md:text-4xl"
					id="how-it-works-heading"
				>
					Up and running in{" "}
					<span className="font-serif italic">minutes</span>
				</h2>
				<p className="max-w-lg text-pretty text-muted-foreground text-sm md:text-base">
					No CI configuration, no YAML, no bot account to babysit.
				</p>
			</div>

			<div className="relative">
				<FullWidthDivider position="top" />
				<ol className="grid grid-cols-1 md:grid-cols-3">
					{steps.map(({ icon: Icon, step, title, description }) => (
						<li
							className="relative flex flex-col gap-3 px-4 py-8 md:border-r md:px-6 md:py-10 md:last:border-r-0"
							key={step}
						>
							<div className="flex items-center justify-between">
								<div className="flex size-9 items-center justify-center rounded-lg bg-muted">
									<Icon className="size-4.5 text-foreground" />
								</div>
								<span className="font-heading text-muted-foreground/40 text-4xl font-semibold">
									{step}
								</span>
							</div>
							<h3 className="font-heading font-medium text-foreground">
								{title}
							</h3>
							<p className="text-pretty text-muted-foreground text-sm">
								{description}
							</p>
						</li>
					))}
				</ol>
				<FullWidthDivider position="bottom" />
			</div>
		</section>
	);
}
