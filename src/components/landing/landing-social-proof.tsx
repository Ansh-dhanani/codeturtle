import { FullWidthDivider } from "@/components/full-width-divider";

const stats = [
	{ value: "20", label: "Free reviews every month" },
	{ value: "$0", label: "To get started - no card" },
	{ value: "<60s", label: "Median review turnaround" },
	{ value: "99%", label: "In-house uptime" },
];

const stack = [
	"GitHub",
	"Next.js",
	"Prisma",
	"PostgreSQL",
	"Inngest",
	"Pinecone",
	"Tailwind CSS",
];

export function LandingSocialProof() {
	return (
		<section className="mx-auto w-full max-w-5xl border-x">
			<div className="relative">
				<FullWidthDivider position="top" />
				<div className="grid grid-cols-2 border-x-0 md:grid-cols-4">
					{stats.map(({ value, label }, index) => (
						<div
							className={`flex flex-col items-center gap-1 px-4 py-8 text-center ${
								index % 2 === 0 ? "border-r" : ""
							} md:border-r md:last:border-r-0`}
							key={label}
						>
							<span className="font-heading text-3xl font-semibold tracking-tight text-primary">
								{value}
							</span>
							<span className="text-pretty text-muted-foreground text-xs md:text-sm">
								{label}
							</span>
						</div>
					))}
				</div>
				<FullWidthDivider position="bottom" />
				<div className="flex flex-col items-center gap-4 px-4 py-8">
					<p className="text-muted-foreground text-xs tracking-wide uppercase">
						Built on a stack you already trust
					</p>
					<div className="flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
						{stack.map((name) => (
							<span
								className="font-heading text-muted-foreground/70 text-sm font-medium tracking-tight"
								key={name}
							>
								{name}
							</span>
						))}
					</div>
				</div>
			</div>
		</section>
	);
}
