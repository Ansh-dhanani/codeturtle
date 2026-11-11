import React from "react";
import { GithubIcon } from "@/components/github-icon";
import { XIcon } from "@/components/x-icon";
import { OpenCodeLogo } from "@/components/opencode-logo";
import { Mail } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";

export function TeamSection() {
	return (
		<section
			aria-labelledby="team-heading"
			className="mx-auto flex w-full max-w-5xl flex-col border-x"
		>
			<div className="flex flex-col gap-2 px-4 py-8 md:px-6 md:py-12">
				<h2
					className="font-heading text-balance font-medium text-3xl md:text-4xl"
					id="team-heading"
				>
					Built by <span className="font-serif italic">humans & AI</span>
				</h2>
				<p className="max-w-lg text-pretty text-muted-foreground text-sm md:text-base">
					CodeTurtle is developed in the open - one human maintainer and a roster
					of frontier AI models working in parallel.
				</p>
			</div>

			<div className="relative">
				<FullWidthDivider position="top" />
				<ul className="grid grid-cols-1 gap-px bg-border sm:grid-cols-2 lg:grid-cols-3">
					{models.map((model) => (
						<ModelCard key={model.name} model={model} />
					))}
				</ul>
				<FullWidthDivider position="bottom" />
			</div>

			<div className="relative flex flex-col items-start justify-between gap-4 px-4 py-8 md:flex-row md:items-center md:px-6">
				<FullWidthDivider position="bottom" />
				<div className="flex flex-col gap-1">
					<p className="font-medium text-foreground">Reach out</p>
					<p className="text-pretty text-muted-foreground text-sm">
						Questions, partnerships, security reports? We read everything.
					</p>
				</div>
				<Button asChild variant="outline">
					<a href="mailto:dhananiansh01@gmail.com">Email us</a>
				</Button>
			</div>
		</section>
	);
}

type ModelLink = {
	label: string;
	href: string;
	icon?: React.ReactNode;
};

type Model = {
	name: string;
	role: string;
	description: string;
	icon: React.ReactNode;
	links: ModelLink[];
};

const models: Model[] = [
	{
		name: "Ansh Dhanani",
		role: "Creator & Maintainer",
		description: "The human in the loop - owns the vision, writes the architecture, reviews the bots.",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
				<circle cx="12" cy="8" r="4" />
				<path d="M4 21c0-4.4 3.6-8 8-8s8 3.6 8 8" />
			</svg>
		),
		links: [
			{ label: "GitHub", href: "https://github.com/Ansh-dhanani", icon: <GithubIcon className="size-3.5" /> },
			{ label: "@anshcodez", href: "https://x.com/anshcodez", icon: <XIcon className="size-3.5" /> },
			{ label: "dhananiansh01@gmail.com", href: "mailto:dhananiansh01@gmail.com", icon: <Mail className="size-3.5" /> },
		],
	},
	{
		name: "Inkling 2 Small / OpenCode",
		role: "Primary coding agent",
		description: "The opencode-default reasoning MoE - 594B total, 17B active. Runs most of CodeTurtle's core logic.",
		icon: <OpenCodeLogo className="size-7" />,
		links: [
			{ label: "opencode.ai", href: "https://opencode.ai" },
		],
	},
	{
		name: "Gemini 2.5 Flash",
		role: "Diff & RAG analysis",
		description: "Google's flagship Flash - codebase indexing, context retrieval, and fast first-pass summaries.",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
				<path d="M12 3l2.1 5.4L20 10.5l-5.9 2.1L12 18l-2.1-5.4L4 10.5l5.9-2.1L12 3z" />
			</svg>
		),
		links: [
			{ label: "ai.google.dev", href: "https://ai.google.dev" },
		],
	},
	{
		name: "Claude Fable / Opus",
		role: "Schema-aware reviewer",
		description: "Anthropic's frontier models - deeply structured reviews, JSON validation, severity scoring.",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
				<rect x="3" y="4" width="18" height="16" rx="2" />
				<path d="M8 9h8M8 13h8M8 17h5" />
			</svg>
		),
		links: [
			{ label: "anthropic.com", href: "https://www.anthropic.com" },
		],
	},
	{
		name: "GPT-oss / gpt-oss",
		role: "Guardrail & fallback",
		description: "OpenAI open-weight models via OpenRouter - backup reviewer when primary agents time out or rate-limit.",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
				<path d="M12 3l8 4.5v9L12 21l-8-4.5v-9L12 3z" />
			</svg>
		),
		links: [
			{ label: "openai.com", href: "https://openai.com" },
		],
	},
	{
		name: "OpenRouter Free Pool",
		role: "Discovery & fallback router",
		description: "Auto-routes between live free models - Gemma 4, Nemotron 3, Inkling, Cohere North - with zero cost.",
		icon: (
			<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
				<circle cx="6" cy="12" r="2" />
				<circle cx="12" cy="6" r="2" />
				<circle cx="18" cy="12" r="2" />
				<circle cx="12" cy="18" r="2" />
			</svg>
		),
		links: [
			{ label: "openrouter.ai", href: "https://openrouter.ai" },
		],
	},
];

function ModelCard({ model }: { model: Model }) {
	const { name, role, description, icon, links } = model;

	return (
		<li className="flex flex-col gap-4 bg-background p-5">
			<div className="flex size-12 items-center justify-center rounded-lg bg-primary/10 text-primary [&_svg]:size-6">
				{icon}
			</div>
			<div className="flex min-w-0 flex-col gap-1">
				<h3 className="font-heading font-medium text-foreground">{name}</h3>
				<p className="text-primary text-xs font-semibold uppercase tracking-wide">
					{role}
				</p>
			</div>
			<p className="text-pretty text-muted-foreground text-xs leading-relaxed">
				{description}
			</p>
			<div className="mt-auto flex flex-wrap items-center gap-2">
				{links.map((link) => (
					<a
						key={link.label}
						href={link.href}
						target={link.href.startsWith("mailto:") ? undefined : "_blank"}
						rel="noreferrer noopener"
						className="inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-[11px] text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
					>
						{link.icon}
						{link.label}
					</a>
				))}
			</div>
		</li>
	);
}
