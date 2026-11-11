import { SidebarInset, SidebarProvider } from "@/components/ui/sidebar";
import { FullWidthDivider } from "@/components/full-width-divider";
import { AppHeader } from "@/components/app-header";
import { AppSidebar } from "@/components/app-sidebar";

export function AppShell({
	children,
	pathname = "#/overview",
}: {
	children: React.ReactNode;
	pathname?: string;
}) {
	return (
		<div className="overflow-hidden">
			<SidebarProvider className="relative h-svh w-full lg:border-x">
				<FullWidthDivider contained className="top-14 z-60 -translate-y-px" />
				<AppSidebar pathname={pathname} />
				<SidebarInset className="min-w-0 overflow-hidden">
					<AppHeader pathname={pathname} />
					<div className="flex flex-1 flex-col gap-4 overflow-x-hidden overflow-y-auto p-4 md:p-6">
						{children}
					</div>
				</SidebarInset>
			</SidebarProvider>
		</div>
	);
}
