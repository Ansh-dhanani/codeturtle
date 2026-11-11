"use client";

import React from "react";
import Link from "next/link";
import NumberFlow from "@number-flow/react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { type FREQUENCY, FrequencyToggle } from "@/components/frequency-toggle";
import { StarIcon, CheckCircleIcon, Loader2 } from "lucide-react";
import { trackEvent, AnalyticsEvents } from "@/lib/analytics";

export type Plan = {
	key: "free" | "pro" | "enterprise";
	name: string;
	info: string;
	price: {
		monthly: number;
		yearly: number; // yearly per month
	};
	/** Struck-through reference price (launch discount framing). */
	launch?: {
		listPrice: { monthly: number; yearly: number };
		label: string;
	};
	features: string[];
	btn: {
		text: string;
		href: string;
	};
	highlighted?: boolean;
};

export type PricingSectionProps = {
	currentPlan?: string;
	onSelectPlan?: (plan: string) => void;
	processingPlan?: string | null;
	heading?: string;
	subheading?: string;
};

const plans: Plan[] = [
	{
		key: "free",
		name: "Free",
		info: "For maintainers getting started",
		price: { monthly: 0, yearly: 0 },
		features: [
			"20 reviews/month",
			"5 repositories",
			"5 reviews per PR",
			"3 commits per PR max",
			"AI code review",
			"Community support",
		],
		btn: { text: "Start for free", href: "/login" },
	},
	{
		key: "pro",
		name: "Pro",
		info: "For maintainers who review a lot",
		highlighted: true,
		launch: {
			listPrice: { monthly: 40, yearly: 32 },
			label: "90% launch discount",
		},
		price: { monthly: 4, yearly: 3 },
		features: [
			"Unlimited reviews",
			"Unlimited repositories",
			"Unlimited reviews per PR",
			"Unlimited commits per PR",
			"Bring your own API keys",
			"Custom rules (custom prompts)",
			"Priority support",
		],
		btn: { text: "Get Pro", href: "/login" },
	},
	{
		key: "enterprise",
		name: "Enterprise",
		info: "For organizations at scale",
		launch: {
			listPrice: { monthly: 99, yearly: 79 },
			label: "50% launch discount",
		},
		price: { monthly: 49, yearly: 39 },
		features: [
			"Unlimited reviews",
			"Unlimited repositories",
			"Unlimited reviews & commits per PR",
			"Bring your own API keys",
			"Custom rules (custom prompts)",
			"Priority support",
			"Everything in Pro + org onboarding",
		],
		btn: { text: "Get Enterprise", href: "/login" },
	},
];

export function PricingSection({
	currentPlan,
	onSelectPlan,
	processingPlan,
	heading = "The most affordable review for maintainers",
	subheading = "Start free - 20 reviews a month, no credit card. Launch pricing: Pro $4/mo (90% off) and Enterprise $49/mo (50% off), locked in forever as long as you stay subscribed.",
}: PricingSectionProps = {}) {
	const [frequency, setFrequency] = React.useState<FREQUENCY>("monthly");

	return (
		<div className="flex w-full flex-col items-center justify-center space-y-7 p-4">
			<div className="mx-auto max-w-xl space-y-2">
				<h2 className="font-heading text-center font-bold text-2xl tracking-tight md:text-3xl lg:font-extrabold lg:text-4xl">
					{heading}
				</h2>
				<p className="text-center text-muted-foreground text-sm md:text-base">
					{subheading}
				</p>
			</div>

			<FrequencyToggle frequency={frequency} setFrequency={setFrequency} />
			<div className="mx-auto grid w-full max-w-5xl grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
				{plans.map((plan) => (
					<PricingCard
						currentPlan={currentPlan}
						frequency={frequency}
						key={plan.name}
						onSelectPlan={onSelectPlan}
						plan={plan}
						processingPlan={processingPlan}
					/>
				))}
			</div>
			<p className="text-center text-muted-foreground text-xs">
				Free tier ships 20 reviews/mo. Upgrade when you need unlimited reviews, custom rules, and bring-your-own keys.
			</p>
		</div>
	);
}

export function PricingCard({
	plan,
	className,
	frequency = "monthly",
	currentPlan,
	onSelectPlan,
	processingPlan,
	...props
}: PricingCardProps) {
	const dashboardMode = typeof onSelectPlan === "function";
	const isCurrent = dashboardMode && currentPlan === plan.key;
	const isProcessing = processingPlan === plan.key;
	const isPaidPlan = plan.key !== "free";

	const renderAction = () => {
		if (!dashboardMode) {
			const href = plan.key === "free" ? plan.btn.href : `${plan.btn.href}?next=/billing`;
			return (
				<Button
					asChild
					className="w-full"
					variant={plan.highlighted ? "default" : "outline"}
				>
					<Link
						href={href}
						onClick={() =>
							trackEvent(AnalyticsEvents.planClicked, { plan: plan.key, frequency })
						}
					>
						{plan.btn.text}
					</Link>
				</Button>
			);
		}

		if (isCurrent) {
			return (
				<Button className="w-full" disabled variant="secondary">
					Current Plan
				</Button>
			);
		}

		if (!isPaidPlan) {
			return (
				<Button className="w-full" disabled variant="outline">
					Free included
				</Button>
			);
		}

		return (
			<Button
				className="w-full"
				disabled={isProcessing}
				onClick={() => {
					trackEvent(AnalyticsEvents.upgradeStarted, { plan: plan.key });
					onSelectPlan?.(plan.key);
				}}
				variant={plan.highlighted ? "default" : "outline"}
			>
				{isProcessing ? (
					<Loader2 className="mr-2 h-4 w-4 animate-spin" />
				) : null}
				Upgrade to {plan.name}
			</Button>
		);
	};

	return (
		<div
			className={cn(
				"relative flex w-full flex-col overflow-hidden rounded-lg border shadow-xs",
				plan.highlighted && "scale-105 border-primary/60 shadow-primary/20 shadow-2xl",
				className
			)}
			key={plan.name}
			{...props}
		>
			{plan.highlighted && (
				<>
					{/* Soft halo glow behind the price */}
					<div
						aria-hidden
						className="pointer-events-none absolute -top-24 left-1/2 z-0 h-48 w-72 -translate-x-1/2 rounded-full bg-primary/30 blur-3xl"
					/>
					{/* Diagonal shimmer */}
					<div
						aria-hidden
						className="pointer-events-none absolute inset-0 z-0 bg-gradient-to-br from-primary/20 via-transparent to-primary/10"
					/>
					{/* Bottom edge glow */}
					<div
						aria-hidden
						className="pointer-events-none absolute -bottom-16 left-1/2 z-0 h-32 w-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl"
					/>
				</>
			)}
			<div
				className={cn(
					"relative z-[1] border-b border-primary/20 p-4",
					plan.highlighted && "bg-transparent"
				)}
			>
				<div className="flex flex-wrap items-center gap-1.5">
					{plan.launch && (
						<div className="flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-0.5 text-[11px] font-semibold text-primary">
							{plan.launch.label}
						</div>
					)}
					{plan.highlighted && (
						<div className="flex items-center gap-1 rounded-md border bg-background px-2 py-0.5 text-[11px]">
							<StarIcon className="size-3 fill-current" />
							Best value
						</div>
					)}
					{frequency === "yearly" &&
						plan.price.monthly > plan.price.yearly && (
							<div className="flex items-center gap-1 rounded-md border bg-primary px-2 py-0.5 text-primary-foreground text-[11px]">
								{Math.round(
									((plan.price.monthly - plan.price.yearly) /
										plan.price.monthly) *
										100
								)}
								% off
							</div>
						)}
				</div>

				<div className="mt-3 font-medium text-lg">{plan.name}</div>
				<p className="font-normal text-muted-foreground text-sm">{plan.info}</p>
				<h3 className="font-heading mt-6 mb-1 flex w-max items-end gap-2">
					{plan.launch && (
						<span className="mb-0.5 font-semibold text-muted-foreground/70 line-through tabular-nums text-xl">
							${plan.launch.listPrice[frequency]}
						</span>
					)}
					<NumberFlow
						className="font-extrabold text-3xl [&::part(suffix)]:font-normal [&::part(suffix)]:text-base [&::part(suffix)]:text-muted-foreground"
						format={{
							style: "currency",
							currency: "USD",
							notation: "compact",
						}}
						suffix="/month"
						value={plan.price[frequency]}
					/>
				</h3>
				<p className="mb-2 font-normal text-muted-foreground text-xs">
					{plan.price[frequency] === 0
						? "free forever"
						: plan.launch
							? `billed ${frequency} · launch price locked in forever`
							: `billed ${frequency}`}
				</p>
			</div>
			<div
				className={cn(
					"relative z-[1] space-y-3 px-4 pt-6 pb-8 text-muted-foreground text-sm",
					plan.highlighted && "bg-primary/5"
				)}
			>
				{plan.features.map((feature) => (
					<div className="flex items-center gap-2" key={feature}>
						<CheckCircleIcon className="size-3.5 text-foreground" />
						<p>{feature}</p>
					</div>
				))}
			</div>
			<div
				className={cn(
					"relative z-[1] mt-auto w-full border-t border-primary/20 p-3",
					plan.highlighted && "bg-primary/5"
				)}
			>
				{renderAction()}
			</div>
		</div>
	);
}

type PricingCardProps = React.ComponentProps<"div"> & {
	plan: Plan;
	frequency?: FREQUENCY;
	currentPlan?: string;
	onSelectPlan?: (plan: string) => void;
	processingPlan?: string | null;
};
