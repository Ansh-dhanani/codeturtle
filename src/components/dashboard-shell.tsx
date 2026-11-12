"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";

/**
 * Dashboard shell wiring the app-shell components to the current route so the
 * sidebar highlights the active page and the header shows the right crumb.
 */
export function DashboardShell({ children, isAdmin = false }: { children: React.ReactNode; isAdmin?: boolean }) {
	const pathname = usePathname();

	return <AppShell pathname={pathname} isAdmin={isAdmin}>{children}</AppShell>;
}
