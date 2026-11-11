"use client";

import { usePathname } from "next/navigation";
import { AppShell } from "@/components/app-shell";

/**
 * Dashboard shell wiring the app-shell components to the current route so the
 * sidebar highlights the active page and the header shows the right crumb.
 */
export function DashboardShell({ children }: { children: React.ReactNode }) {
	const pathname = usePathname();

	return <AppShell pathname={pathname}>{children}</AppShell>;
}
