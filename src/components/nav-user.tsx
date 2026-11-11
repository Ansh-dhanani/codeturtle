"use client";

import Link from "next/link";
import {
	Avatar,
	AvatarFallback,
	AvatarImage,
} from "@/components/ui/avatar";
import {
	DropdownMenu,
	DropdownMenuContent,
	DropdownMenuGroup,
	DropdownMenuItem,
	DropdownMenuLabel,
	DropdownMenuSeparator,
	DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
	SidebarMenu,
	SidebarMenuButton,
	SidebarMenuItem,
	useSidebar,
} from "@/components/ui/sidebar";
import { ChevronsUpDownIcon, CreditCardIcon, LifeBuoyIcon, LogOutIcon, SettingsIcon, SparklesIcon, UserIcon } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useSignOut } from "@/hooks/use-signout";
import { Spinner } from "@/components/ui/spinner";

export function NavUser() {
	const { isMobile } = useSidebar();
	const { session, isLoading } = useAuth();
	const { isSigningOut, handleSignOut } = useSignOut();

	const user = session?.user;
	const name = user?.name || "You";
	const email = user?.email || "";
	const avatar = user?.image || "";

	return (
		<SidebarMenu className="border-t p-2">
			<SidebarMenuItem>
				<DropdownMenu>
					<DropdownMenuTrigger asChild>
						<SidebarMenuButton className="text-muted-foreground h-10">
							{isLoading ? (
								<div className="size-5 animate-pulse rounded-full bg-muted" />
							) : (
								<Avatar className="size-5">
									{avatar ? <AvatarImage alt={name} src={avatar} /> : null}
									<AvatarFallback>{name.charAt(0).toUpperCase()}</AvatarFallback>
								</Avatar>
							)}
							<span className="font-medium text-sm truncate">
								{name.split(" ")[0]}
							</span>
							<ChevronsUpDownIcon className="ml-auto size-3!" />
						</SidebarMenuButton>
					</DropdownMenuTrigger>
					<DropdownMenuContent
						align="end"
						className="min-w-52"
						side={isMobile ? "bottom" : "right"}
						sideOffset={4}
					>
						<DropdownMenuLabel className="flex items-center gap-2">
							<Avatar className="size-6">
								{avatar ? <AvatarImage alt={name} src={avatar} /> : null}
								<AvatarFallback className="text-[10px]">{name.charAt(0).toUpperCase()}</AvatarFallback>
							</Avatar>
							<div className="min-w-0">
								<p className="text-sm font-medium leading-none">{name}</p>
								<p className="text-xs text-muted-foreground truncate">{email}</p>
							</div>
						</DropdownMenuLabel>
						<DropdownMenuSeparator />
						<DropdownMenuGroup>
							<DropdownMenuItem asChild>
								<Link href="/billing">
									<SparklesIcon />
									Account
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link href="/account">
									<UserIcon />
									Profile
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link href="/billing">
									<CreditCardIcon />
									Plans &amp; Billing
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link href="/settings">
									<SettingsIcon />
									Settings
								</Link>
							</DropdownMenuItem>
							<DropdownMenuItem asChild>
								<Link href="/docs">
									<LifeBuoyIcon />
									Help Center
								</Link>
							</DropdownMenuItem>
						</DropdownMenuGroup>
						<DropdownMenuSeparator />
						<DropdownMenuItem
							disabled={isSigningOut}
							onClick={handleSignOut}
							variant="destructive"
						>
							{isSigningOut ? <Spinner /> : <LogOutIcon />}
							{isSigningOut ? "Signing out..." : "Log out"}
						</DropdownMenuItem>
					</DropdownMenuContent>
				</DropdownMenu>
			</SidebarMenuItem>
		</SidebarMenu>
	);
}
