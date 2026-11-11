import Link from "next/link";
import { BrandMark } from "@/components/brand-mark";
import { Button } from "@/components/ui/button";
import { ThemeSwitcher } from "@/components/theme-switcher";

const navLinks = [
	{ title: "Features", href: "/features" },
	{ title: "Pricing", href: "/pricing" },
	{ title: "Team", href: "/team" },
	{ title: "Docs", href: "/docs" },
];

export function LandingHeader() {
	return (
		<header className="sticky top-0 z-50 mx-auto w-full max-w-5xl border-b border-border/60 bg-background/80 backdrop-blur-xl lg:border-x">
			<nav className="flex h-14 items-center justify-between gap-1 px-4 md:px-6">
				<Link aria-label="CodeTurtle home" className="flex w-max items-center gap-1.5" href="/">
					<BrandMark className="h-6 w-auto md:h-7" />
					<span className="font-brand font-semibold text-lg tracking-tight text-foreground">
						CodeTurtle
					</span>
				</Link>
				<div className="hidden items-center gap-6 md:flex">
					{navLinks.map(({ title, href }) => (
						<Link
							className="text-muted-foreground text-sm transition-colors hover:text-foreground"
							href={href}
							key={title}
						>
							{title}
						</Link>
					))}
				</div>
				<div className="flex items-center gap-2">
					<ThemeSwitcher />
					<Button asChild size="sm" variant="ghost">
						<Link href="/login">Sign in</Link>
					</Button>
					<Button asChild size="sm">
						<Link href="/login">Get started</Link>
					</Button>
				</div>
			</nav>
		</header>
	);
}
