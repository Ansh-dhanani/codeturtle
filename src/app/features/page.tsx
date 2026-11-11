import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/landing-header";
import { Footer } from "@/components/footer";
import { FeatureSection } from "@/components/feature-section";
import { LandingDeepDive } from "@/components/landing/landing-deep-dive";
import { LandingCta } from "@/components/landing/landing-cta";

export const metadata: Metadata = {
	title: "Features - CodeTurtle",
	description:
		"Repository-aware context, live progress updates, threaded mentions, Mermaid diagrams, and bring-your-own AI for GitHub pull request reviews.",
};

export default function FeaturesPage() {
	return (
		<main className="w-full overflow-x-hidden">
			<LandingHeader />
			<section className="mx-auto w-full max-w-5xl px-4 pt-16 pb-8 text-center md:px-6 md:pt-24">
				<h1 className="font-heading text-balance text-4xl font-medium tracking-tight md:text-6xl">
					Everything a{" "}
					<span className="font-serif italic">maintainer</span> needs
				</h1>
				<p className="mx-auto mt-4 max-w-xl text-pretty text-muted-foreground md:text-lg">
					A review pipeline designed to run itself - from the webhook to the
					final finding, every stage is observable and configurable.
				</p>
			</section>
			<FeatureSection />
			<LandingDeepDive />
			<LandingCta />
			<Footer />
		</main>
	);
}
