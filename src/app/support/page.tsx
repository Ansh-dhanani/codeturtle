import type { Metadata } from "next";
import { LandingHeader } from "@/components/landing/landing-header";
import { Footer } from "@/components/footer";
import Support from "@/components/pages/support";

export const metadata: Metadata = {
	title: "Support - CodeTurtle",
	description:
		"Help, documentation, and direct email support for CodeTurtle - the repository-aware AI code reviewer for GitHub pull requests.",
};

export default function SupportPage() {
	return (
		<main className="min-h-screen bg-background text-foreground">
			<LandingHeader />
			<div className="mx-auto w-full max-w-6xl px-4 py-10 md:px-6">
				<Support />
			</div>
			<Footer />
		</main>
	);
}
