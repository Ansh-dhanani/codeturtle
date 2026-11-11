import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/landing-header";
import { Footer } from "@/components/footer";
import { PricingSection } from "@/components/pricing-section";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingCta } from "@/components/landing/landing-cta";

export const metadata: Metadata = {
	title: "Pricing - CodeTurtle",
	description:
		"The most affordable AI code review for maintainers. 20 free reviews every month, no credit card, bring your own model or let us handle it.",
};

export default function PricingPage() {
	return (
		<main className="w-full overflow-x-hidden">
			<LandingHeader />
			<section className="mx-auto w-full max-w-5xl border-x py-12 md:py-16">
				<PricingSection />
			</section>
			<LandingFaq />
			<LandingCta />
			<Footer />
		</main>
	);
}
