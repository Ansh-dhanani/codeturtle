import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/landing-header";
import { Footer } from "@/components/footer";
import { TeamSection } from "@/components/team-section";
import { LandingTestimonials } from "@/components/landing/landing-testimonials";
import { LandingCta } from "@/components/landing/landing-cta";

export const metadata: Metadata = {
	title: "Team - CodeTurtle",
	description:
		"Meet the maintainers behind CodeTurtle - the humans and AI models keeping code review affordable for every repo.",
};

export default function TeamPage() {
	return (
		<main className="w-full overflow-x-hidden">
			<LandingHeader />
			<TeamSection />
			<LandingTestimonials />
			<LandingCta />
			<Footer />
		</main>
	);
}
