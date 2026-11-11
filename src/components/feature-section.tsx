import { cn } from "@/lib/utils";
import type React from "react";
import { FullWidthDivider } from "@/components/full-width-divider";
import {
	ZapIcon,
	ShieldCheckIcon,
	ActivityIcon,
	MessagesSquareIcon,
	WorkflowIcon,
	SparklesIcon,
} from "lucide-react";

type FeatureType = {
	title: string;
	icon: React.ReactNode;
	description: string;
};

export function FeatureSection() {
	return (
		<div className="mx-auto w-full max-w-5xl space-y-12 border-x py-12">
			<div className="relative grid grid-cols-1 gap-px bg-border md:grid-cols-2 lg:grid-cols-3">
				<FullWidthDivider position="top" />
				{features.map((feature) => (
					<FeatureCard feature={feature} key={feature.title} />
				))}
				<FullWidthDivider position="bottom" />
			</div>
		</div>
	);
}

export function FeatureCard({
	feature,
	className,
	...props
}: React.ComponentProps<"div"> & {
	feature: FeatureType;
}) {
	return (
		<div
			className={cn(
				"relative flex flex-col justify-between overflow-hidden bg-background p-4 md:p-6",
				className
			)}
			{...props}
		>
			<div
				className={cn(
					"relative z-10 flex items-center pt-4 pb-6",
					"[&_svg]:size-5 [&_svg]:text-primary"
				)}
			>
				{feature.icon}
			</div>

			<div className="relative z-10 space-y-2">
				<h3 className="font-heading font-medium text-foreground text-lg">{feature.title}</h3>
				<p className="text-muted-foreground text-xs leading-relaxed">
					{feature.description}
				</p>
			</div>
		</div>
	);
}

const features: FeatureType[] = [
	{
		title: "Repository-aware context",
		icon: (
			<ZapIcon
			/>
		),
		description:
			"Reviews combine the PR diff with code retrieved from your indexed codebase, so findings point at related code and conventions.",
	},
	{
		title: "Live progress updates",
		icon: (
			<ActivityIcon
			/>
		),
		description:
			"A progress comment updates through every stage - diff, retrieval, model, findings - so you always know what's happening.",
	},
	{
		title: "Threaded mentions",
		icon: (
			<MessagesSquareIcon
			/>
		),
		description:
			"Mention @codeturtle in any PR or review comment and it replies in that same thread, with the surrounding discussion in context.",
	},
	{
		title: "Mermaid diagrams",
		icon: (
			<WorkflowIcon
			/>
		),
		description:
			"When architecture or flow needs explaining, reviews render diagrams instead of drowning you in prose.",
	},
	{
		title: "Severity you can act on",
		icon: (
			<ShieldCheckIcon
			/>
		),
		description:
			"Findings arrive schema-validated with severity levels, file and line references, and concrete suggested fixes.",
	},
	{
		title: "Bring your own AI",
		icon: (
			<SparklesIcon
			/>
		),
		description:
			"Configure Anthropic, Google, or OpenAI models per repository - you control the cost of every review.",
	},
];
