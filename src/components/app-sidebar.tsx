import Link from "next/link";
import {
	Sidebar,
	SidebarContent,
	SidebarFooter,
	SidebarGroup,
	SidebarGroupLabel,
	SidebarHeader,
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
} from "@/components/ui/sidebar";
import { footerNavLinks, navGroups, adminNavItem } from "@/components/app-shared";
import { NavUser } from "@/components/nav-user";
import { BrandMark } from "@/components/brand-mark";

export function AppSidebar({ pathname, isAdmin = false }: { pathname?: string; isAdmin?: boolean }) {
	const groups = isAdmin
		? navGroups.map((group, index) =>
				index === navGroups.length - 1
					? { ...group, items: [...group.items, adminNavItem] }
					: group,
			)
		: navGroups;

	return (
		<Sidebar
			className="static min-h-full *:data-[slot=sidebar-inner]:bg-background"
			collapsible="offcanvas"
			variant="sidebar"
		>
			<SidebarHeader className="relative h-14 justify-center border-b px-2 py-0">
				<Link
					className="flex h-9 w-max items-center gap-2 rounded-md px-2 hover:bg-muted dark:hover:bg-muted/50"
					href="/dashboard"
				>
					<BrandMark className="h-5 w-auto md:h-6" />
					<span className="font-brand font-semibold text-base tracking-tight text-foreground">
						CodeTurtle
					</span>
				</Link>
			</SidebarHeader>
			<SidebarContent>
				{groups.map((group) => (
					<SidebarGroup key={group.label}>
						{group.label ? (
							<SidebarGroupLabel className="font-normal">
								{group.label}
							</SidebarGroupLabel>
						) : null}
						<SidebarMenu>
							{group.items.map((item) => (
								<SidebarMenuItem key={item.title}>
									<SidebarMenuButton
										asChild
										isActive={item.url === pathname}
										tooltip={item.title}
									>
										<Link href={item.url}>
											{item.icon}
											<span>{item.title}</span>
										</Link>
									</SidebarMenuButton>
								</SidebarMenuItem>
							))}
						</SidebarMenu>
					</SidebarGroup>
				))}
			</SidebarContent>
			<SidebarFooter className="gap-0 p-0">
				<SidebarMenu className="border-t p-2">
					{footerNavLinks.map((item) => (
						<SidebarMenuItem key={item.title}>
							<SidebarMenuButton
								asChild
								className="text-muted-foreground"
								isActive={item.url === pathname}
								size="sm"
							>
								<Link href={item.url}>
									{item.icon}
									<span>{item.title}</span>
								</Link>
							</SidebarMenuButton>
						</SidebarMenuItem>
					))}
				</SidebarMenu>
				<NavUser />
			</SidebarFooter>
		</Sidebar>
	);
}
