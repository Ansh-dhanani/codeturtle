"use client";

import { useSyncExternalStore } from "react";
import Link from "next/link";
import { useTheme } from "next-themes";
import GradientASCII from "@/components/GradientASCII";
import { Button } from "@/components/ui/button";
import { BookOpenIcon, GitPullRequestIcon } from "lucide-react";
import {
	FullWidthDivider,
} from "@/components/full-width-divider";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";

const emptySubscribe = () => () => {};

export function LandingHero() {
	const { resolvedTheme } = useTheme();
	const mounted = useSyncExternalStore(emptySubscribe, () => true, () => false);

	const isLight = mounted ? resolvedTheme === "light" : false;

	return (
		<section className="relative mx-auto flex h-[480px] w-full max-w-5xl flex-col justify-center overflow-hidden lg:border-x">
			<FullWidthDivider position="bottom" />
			{/* ASCII backdrop - themed
			    dark: deep-navy ASCII field, light: soft pale wash */}
			<div
				aria-hidden
				className="pointer-events-none absolute inset-0 overflow-hidden bg-gradient-to-b from-[#e2edfa] via-[#f4f8fd] to-white dark:bg-none dark:bg-[#050b1a]/95"
			>
				{mounted && (
					<GradientASCII
						shape="horizon"
						lightMode={isLight}
						colors={
							isLight
								? ["#dfeefb", "#c3ddf3", "#9cc6e9", "#5b9bd8"]
								: ["#1e40af", "#1d4ed8", "#2563eb", "#38bdf8", "#7dd3fc", "#eef6ff"]
						}
						cellSize={16}
						density={isLight ? 0.6 : 0.9}
						glow={isLight ? 0.22 : 0.55}
						scale={1.6}
						speed={0.9}
						gradientOpacity={isLight ? 0.9 : 0.6}
						grain={0.05}
						dpr={2}
						style={{}}
						className="h-full w-full"
					/>
				)}
			</div>

			<div className="relative px-4 py-2 text-center md:px-6 md:py-4">
				<div className="relative mx-auto mt-4 flex max-w-3xl flex-col items-center gap-6 text-slate-900 md:mt-6 dark:text-white">
					<h1 className="font-heading text-balance text-3xl leading-[1.1] font-medium tracking-tight md:text-5xl">
						Free AI code review on every PR,{" "}
						<span className="font-serif italic">every month</span>
					</h1>
					<p className="max-w-xl text-pretty text-balance text-sm text-slate-800 md:text-base dark:text-sky-100">
						<strong>45+ free models</strong> powering 20 reviews/month on 5 repos -
						no credit card, no strings. <em>Works for any GitHub repository.</em>
					</p>
					<div className="flex flex-wrap items-center justify-center gap-3">
						<Button asChild size="lg">
							<Link href="/login" onClick={() => trackEvent(AnalyticsEvents.ctaStartReviewing)}>
								<GitPullRequestIcon data-icon="inline-start" />
								Start reviewing free
							</Link>
						</Button>
						<Button
							asChild
							size="lg"
							variant="outline"
							className="border-slate-300 bg-white text-slate-900 hover:bg-slate-100 dark:border-white/15 dark:bg-white/10 dark:text-white dark:hover:bg-white/20"
						>
							<Link href="/docs" onClick={() => trackEvent(AnalyticsEvents.ctaSeeHowItWorks)}>
								<BookOpenIcon data-icon="inline-start" />
								See how it works
							</Link>
						</Button>
					</div>

				</div>
			</div>
		</section>
	);
}
