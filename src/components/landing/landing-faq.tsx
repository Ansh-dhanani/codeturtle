import {
	Accordion,
	AccordionContent,
	AccordionItem,
	AccordionTrigger,
} from "@/components/ui/accordion";
import { FullWidthDivider } from "@/components/full-width-divider";

const faqs = [
	{
		question: "How does CodeTurtle get context about my codebase?",
		answer:
			"When you connect a repository, CodeTurtle indexes it into a private Pinecone vector index. Reviews then combine the PR diff with retrieval over that index, so findings reference related code and conventions - not just the changed lines.",
	},
	{
		question: "Which AI models does it use?",
		answer:
			"Your choice of Anthropic, Google, or OpenAI - configured per repository from the dashboard. Repository-specific settings let you trade cost for depth on the repos that matter.",
	},
	{
		question: "What does a review actually post on GitHub?",
		answer:
			"A summary comment with findings tagged by severity and file/line references, inline review comments where relevant, and Mermaid diagrams when architecture or flow needs explaining. A progress comment updates live while the review runs.",
	},
	{
		question: "Is my code used for training?",
		answer:
			"No. Codebase indexing is per-repository and private to your account. Your code is only sent to the AI provider you configure, for the review you requested.",
	},
	{
		question: "How do mentions work?",
		answer:
			"Add @codeturtle in any PR comment or review comment and it replies in that same thread, using the surrounding discussion and repository context to answer.",
	},
	{
		question: "What happens when I hit my plan limit?",
		answer:
			"Reviews pause for the rest of the billing month and your PRs stay untouched - nothing fails, nothing is blocked. Usage and limits are visible on the dashboard.",
	},
	{
		question: "I maintain an open-source project - is this really free?",
		answer:
			"Yes. The free tier gives 20 reviews per month with no credit card required. Pro and Enterprise plans unlock unlimited reviews, custom rules, and bring-your-own API keys for larger codebases.",
	},
];

export function LandingFaq() {
	return (
		<section
			aria-labelledby="faq-heading"
			className="mx-auto w-full max-w-5xl border-x py-4"
		>
			<div className="flex flex-col gap-2 px-4 py-8 md:px-6 md:py-12">
				<h2
					className="font-heading text-balance font-medium text-3xl md:text-4xl"
					id="faq-heading"
				>
					Questions, <span className="font-serif italic">answered</span>
				</h2>
			</div>

			<div className="relative">
				<FullWidthDivider position="top" />
				<div className="px-4 md:px-6">
					<Accordion type="single" collapsible>
						{faqs.map(({ question, answer }, index) => (
							<AccordionItem key={question} value={`faq-${index}`}>
								<AccordionTrigger className="text-left text-base">
									{question}
								</AccordionTrigger>
								<AccordionContent className="text-muted-foreground text-sm">
									{answer}
								</AccordionContent>
							</AccordionItem>
						))}
					</Accordion>
				</div>
				<FullWidthDivider position="bottom" />
			</div>
		</section>
	);
}
