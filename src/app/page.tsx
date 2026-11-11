import { LandingHeader } from "@/components/landing/landing-header";
import { LandingHero } from "@/components/landing/landing-hero";
import { LandingSocialProof } from "@/components/landing/landing-social-proof";
import { LandingHowItWorks } from "@/components/landing/landing-how-it-works";
import { LandingFeatures } from "@/components/landing/landing-features";
import { LandingDeepDive } from "@/components/landing/landing-deep-dive";
import { LandingTestimonials } from "@/components/landing/landing-testimonials";
import { LandingFaq } from "@/components/landing/landing-faq";
import { LandingCta } from "@/components/landing/landing-cta";
import { Footer } from "@/components/footer";

export default function Home() {
	return (
		<main className="w-full overflow-x-clip">
			<LandingHeader />
			{/* 1. Promise - what it is, for whom, with visual proof */}
			<LandingHero />
			{/* 2. Credibility - numbers and stack */}
			<LandingSocialProof />
			{/* 3. Mechanics - how it works in 3 steps */}
			<LandingHowItWorks />
			{/* 4. Breadth - capability grid */}
			<LandingFeatures />
			{/* 5. Depth - one claim per section, with product visuals */}
			<LandingDeepDive />
			{/* 6. Proof - testimonials */}
			<LandingTestimonials />
			{/* 7. Objections - FAQ */}
			<LandingFaq />
			{/* 8. Conversion - final CTA */}
			<LandingCta />
			<Footer />
		</main>
	);
}
