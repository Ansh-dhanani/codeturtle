import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { FullWidthDivider } from "@/components/full-width-divider";

const quotes = [
	{
		quote:
			"The RAG context makes a real difference - it flagged a missing index because it knew the query path from elsewhere in the codebase, not just the diff.",
		name: "Maintainer",
		handle: "open-source project",
		initials: "OS",
	},
	{
		quote:
			"@codeturtle replies in the right thread with the right context. It's the first review bot our team actually keeps enabled.",
		name: "Staff engineer",
		handle: "platform team",
		initials: "ST",
	},
	{
		quote:
			"Progress-free review processes were a black box. Watching stages update on the PR itself is worth it alone.",
		name: "Tech lead",
		handle: "early adopter",
		initials: "TL",
	},
];

export function LandingTestimonials() {
	return (
		<section
			aria-labelledby="testimonials-heading"
			className="mx-auto w-full max-w-5xl border-x py-4"
		>
			<div className="flex flex-col gap-2 px-4 py-8 md:px-6 md:py-12">
				<h2
					className="font-heading text-balance font-medium text-3xl md:text-4xl"
					id="testimonials-heading"
				>
					What reviewers are{" "}
					<span className="font-serif italic">saying</span>
				</h2>
				<p className="max-w-lg text-pretty text-muted-foreground text-sm md:text-base">
					Feedback from teams running CodeTurtle on their pull requests.
				</p>
			</div>

			<div className="relative">
				<FullWidthDivider position="top" />
				<ul className="grid grid-cols-1 md:grid-cols-3">
					{quotes.map(({ quote, name, handle, initials }, index) => (
						<figure
							className={`flex h-full flex-col gap-4 px-4 py-8 md:px-6 md:py-10 ${
								index === 0
									? "md:border-r"
									: index === 1
										? "md:border-r"
										: ""
							}`}
							key={name}
						>
							<blockquote className="text-pretty text-muted-foreground text-sm">
								&ldquo;{quote}&rdquo;
							</blockquote>
							<figcaption className="mt-auto flex items-center gap-3">
								<Avatar className="size-8">
									<AvatarFallback className="bg-muted text-xs">
										{initials}
									</AvatarFallback>
								</Avatar>
								<div className="flex flex-col">
									<span className="text-sm font-medium">{name}</span>
									<span className="text-muted-foreground text-xs">
										{handle}
									</span>
								</div>
							</figcaption>
						</figure>
					))}
				</ul>
				<FullWidthDivider position="bottom" />
			</div>
		</section>
	);
}
