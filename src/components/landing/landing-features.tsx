import { FullWidthDivider } from "@/components/full-width-divider";
import {
	BotIcon,
	GitBranchIcon,
	MessagesSquareIcon,
	ShieldCheckIcon,
	SparklesIcon,
	ActivityIcon,
} from "lucide-react";

const features = [
	{
		icon: BotIcon,
		title: "Repository-aware context",
		description:
			"Reviews use the PR diff plus related code indexed from your codebase, so feedback lands where it matters - not just on changed lines.",
	},
	{
		icon: ActivityIcon,
		title: "Live progress updates",
		description:
			"CodeTurtle posts a progress comment and keeps it updated as the review runs, so you always know what's happening.",
	},
	{
		icon: MessagesSquareIcon,
		title: "Threaded mentions",
		description:
			"Mention @codeturtle in any PR or review comment and it replies in the same thread with the context you asked about.",
	},
	{
		icon: GitBranchIcon,
		title: "Mermaid diagrams",
		description:
			"When architecture or flow needs explaining, reviews include rendered Mermaid diagrams instead of walls of text.",
	},
	{
		icon: ShieldCheckIcon,
		title: "Severity you can act on",
		description:
			"Findings arrive schema-validated with severity levels, file and line references, and concrete suggested fixes.",
	},
	{
		icon: SparklesIcon,
		title: "Bring your own AI",
		description:
			"Configure Anthropic, Google, or OpenAI models per repository - you control the cost, and the free tier is the most generous of any review bot.",
	},
];

export function LandingFeatures() {
	return (
		<section
			aria-labelledby="features-heading"
			className="mx-auto w-full max-w-5xl border-x py-4"
		>
			<div className="flex flex-col gap-2 px-4 py-8 md:px-6 md:py-12">
				<h2
					className="font-heading text-balance font-medium text-3xl md:text-4xl"
					id="features-heading"
				>
					Everything a{" "}
					<span className="font-serif italic">maintainer</span> needs, nothing
					they don&rsquo;t
				</h2>
				<p className="max-w-lg text-pretty text-muted-foreground text-sm md:text-base">
					Zero CI config, zero YAML, zero bot account to babysit - the
					features are chosen so the review runs itself.
				</p>
			</div>

			<div className="relative">
				<FullWidthDivider position="top" />
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-1/2 hidden w-px bg-border sm:block lg:hidden"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-1/3 hidden w-px bg-border lg:block"
				/>
				<div
					aria-hidden="true"
					className="pointer-events-none absolute inset-y-0 left-2/3 hidden w-px bg-border lg:block"
				/>
				<ul className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3">
					{features.map((feature) => (
						<li
							className="flex flex-col gap-3 border-b px-4 py-6 sm:border-b-0 md:px-6 md:py-8"
							key={feature.title}
						>
							<div className="flex size-9 items-center justify-center rounded-lg bg-muted">
								<feature.icon className="size-4.5 text-foreground" />
							</div>
							<h3 className="font-heading font-medium text-foreground">
								{feature.title}
							</h3>
							<p className="text-pretty text-muted-foreground text-sm">
								{feature.description}
							</p>
						</li>
					))}
				</ul>
				<FullWidthDivider position="bottom" />
			</div>
		</section>
	);
}
