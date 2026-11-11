import { cn } from "@/lib/utils";
import Link from "next/link";
import { GithubIcon } from "@/components/github-icon";
import { XIcon } from "@/components/x-icon";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { FullWidthDivider } from "@/components/full-width-divider";

export function Footer() {
	return (
		<footer
			className={cn(
				"relative mx-auto max-w-5xl lg:border-x",
				"dark:bg-[radial-gradient(35%_80%_at_15%_0%,--theme(--color-foreground/.1),transparent)]"
			)}
		>
			<FullWidthDivider position="top" />
			<div className="grid max-w-5xl grid-cols-6 gap-6 p-4">
				<div className="col-span-6 flex flex-col gap-4 pt-5 md:col-span-4">
					<Link className="flex w-max items-center gap-2" href="/" aria-label="CodeTurtle home">
						<BrandMark className="h-7 w-auto" />
						<span className="font-brand font-semibold text-lg tracking-tight text-foreground">
							CodeTurtle
						</span>
					</Link>
					<p className="max-w-sm text-balance text-muted-foreground text-sm">
						AI-powered code reviews for your GitHub pull requests.
					</p>
					<div className="flex gap-2">
						{socialLinks.map((item, index) => (
							<Button
								asChild
								key={`social-${item.link}-${index}`}
								size="icon"
								variant="outline"
							>
								<a aria-label={item.label} href={item.link} target="_blank">
									{item.icon}
								</a>
							</Button>
						))}
					</div>
				</div>
				<div className="col-span-3 w-full md:col-span-1">
					<span className="text-muted-foreground text-xs">Product</span>
					<div className="mt-2 flex flex-col gap-2">
						{product.map(({ href, title }) => (
							<a
								className="w-max text-sm hover:underline"
								href={href}
								key={title}
							>
								{title}
							</a>
						))}
					</div>
				</div>
				<div className="col-span-3 w-full md:col-span-1">
					<span className="text-muted-foreground text-xs">Resources</span>
					<div className="mt-2 flex flex-col gap-2">
						{resources.map(({ href, title }) => (
							<a
								className="w-max text-sm hover:underline"
								href={href}
								key={title}
							>
								{title}
							</a>
						))}
					</div>
				</div>
			</div>
			<FullWidthDivider />
			<div className="flex items-center justify-center gap-2 py-4">
				<p className="text-center font-light text-muted-foreground text-sm">
					&copy; {new Date().getFullYear()} CodeTurtle, All rights reserved
				</p>
			</div>
		</footer>
	);
}

const product = [
	{
		title: "Features",
		href: "/#features",
	},
	{
		title: "Pricing",
		href: "/#pricing",
	},
	{
		title: "Dashboard",
		href: "/dashboard",
	},
	{
		title: "Sign in",
		href: "/login",
	},
];

const resources = [
	{
		title: "Documentation",
		href: "/docs",
	},
	{
		title: "Pricing",
		href: "/pricing",
	},
	{
		title: "Support",
		href: "/support",
	},
	{
		title: "Terms",
		href: "/terms",
	},
	{
		title: "Privacy",
		href: "/privacy",
	},
];

const socialLinks = [
	{
		icon: <GithubIcon />,
		link: "mailto:dhananiansh01@gmail.com",
		label: "Email",
	},
	{
		icon: <XIcon />,
		link: "https://x.com/anshcodez",
		label: "X",
	},
];
