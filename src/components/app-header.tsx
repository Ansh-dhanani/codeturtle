import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { SidebarTrigger } from "@/components/ui/sidebar";
import { AppBreadcrumbs } from "@/components/app-breadcrumbs";
import { navLinks } from "@/components/app-shared";
import { HeadsetIcon } from "lucide-react";
import Link from "next/link";
import { ThemeSwitcher } from "@/components/theme-switcher";
import { CommandPalette } from "@/components/command-palette";
import { NotificationsBell } from "@/components/notifications-bell";

export function AppHeader({ pathname }: { pathname?: string }) {
	const activeItem = navLinks.find((item) => item.url === pathname);
	return (
		<header
			className={cn(
				"sticky top-0 z-50 flex h-14 shrink-0 items-center justify-between gap-2 bg-background px-4 md:px-6"
			)}
		>
			<div className="flex items-center gap-2">
				<SidebarTrigger className="md:hidden" />
				<Separator
					className="mr-2 data-[orientation=vertical]:h-4 md:hidden"
					orientation="vertical"
				/>
				<AppBreadcrumbs page={activeItem} />
			</div>
			<div className="flex items-center gap-2">
				<ThemeSwitcher />
				<CommandPalette />
				<NotificationsBell />
				<Button aria-label="Support" size="icon" variant="ghost" asChild>
					<Link href="/support"><HeadsetIcon /></Link>
				</Button>
			</div>
		</header>
	);
}
