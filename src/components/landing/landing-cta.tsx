import Link from "next/link";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";
import { ArrowRightIcon } from "lucide-react";

export function LandingCta() {
	return (
		<section className="relative mx-auto w-full max-w-5xl overflow-hidden border-x">
			<div className="relative flex flex-col items-center gap-6 px-4 py-12 text-center md:px-6 md:py-16">
				<div className="relative flex flex-col items-center gap-6">
					<h2 className="font-heading text-balance text-3xl font-medium tracking-tight md:text-5xl">
						The most{" "}
						<span className="font-serif italic">maintainer-friendly</span>{" "}
						review bot on GitHub
					</h2>
					<p className="max-w-md text-pretty text-muted-foreground md:text-lg">
						Free to start, cheap to scale, and comfortable to keep - connect
						a repository and get your first review in under a minute.
					</p>
					<div className="flex flex-wrap items-center justify-center gap-3">
						<Button asChild size="lg">
							<Link href="/login">
								Start reviewing free
								<ArrowRightIcon data-icon="inline-end" />
							</Link>
						</Button>
					</div>
					<p className="text-muted-foreground text-xs">
						20 free reviews every month &middot; no credit card &middot; open
						source
					</p>
				</div>
			</div>
			<FullWidthDivider position="top" />
			<FullWidthDivider position="bottom" />
		</section>
	);
}
