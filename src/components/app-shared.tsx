import type { ReactNode } from "react";

import {
	LayoutDashboardIcon,
	GitBranchIcon,
	ClipboardCheckIcon,
	BellIcon,
	ChartPieIcon,
	SettingsIcon,
	CreditCardIcon,
	UserIcon,
	BookOpenIcon,
	LifeBuoyIcon,
} from "lucide-react";

type SidebarNavItem = {
	title: string;
	url: string;
	icon: ReactNode;
};

type SidebarNavGroup = {
	label?: string;
	items: SidebarNavItem[];
}

export type { SidebarNavItem, SidebarNavGroup };

export const navGroups: SidebarNavGroup[] = [
	{
		label: "Product",
		items: [
			{
				title: "Dashboard",
				url: "/dashboard",
				icon: <LayoutDashboardIcon />,
			},
			{
				title: "Repositories",
				url: "/repositories",
				icon: <GitBranchIcon />,
			},
			{
				title: "Notifications",
				url: "/notifications",
				icon: <BellIcon />,
			},
			{
				title: "Reviews",
				url: "/reviews",
				icon: <ClipboardCheckIcon />,
			},
			{
				title: "Analytics",
				url: "/analytics",
				icon: <ChartPieIcon />,
			},
		],
	},
	{
		label: "Account",
		items: [
			{
				title: "Billing",
				url: "/billing",
				icon: <CreditCardIcon />,
			},
			{
				title: "Account",
				url: "/account",
				icon: <UserIcon />,
			},
			{
				title: "Settings",
				url: "/settings",
				icon: <SettingsIcon />,
			},
		],
	},
];

export const footerNavLinks: SidebarNavItem[] = [
	{
		title: "Help Center",
		url: "/support",
		icon: <LifeBuoyIcon />,
	},
	{
		title: "Documentation",
		url: "/docs",
		icon: <BookOpenIcon />,
	},
];

export const navLinks: SidebarNavItem[] = [
	...navGroups.flatMap((group) => group.items),
	...footerNavLinks,
];
