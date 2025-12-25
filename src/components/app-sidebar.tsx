import {
  Settings,
  BadgeQuestionMark,
  LayoutDashboard,
  ChartLine,
  Book,
} from "lucide-react";
import { TicketPercentIcon } from "./ui/icons/lucide-ticket-percent";
import Link from "next/link";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar";
import { SidebarFooterContent } from "./sidebar-footer";
import { SidebarHeaderContent } from "./sidebar-header";

const generalItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: ChartLine,
  },
  {
    title: "Settings",
    url: "/settings",
    icon: Settings,
  },
];

const otherItems = [
  {
    title: "Docs",
    url: "/docs",
    icon: Book,
  },
  {
    title: "Support",
    url: "/support",
    icon: BadgeQuestionMark,
  },
  {
    title: "Pricing",
    url: "/pricing",
    icon: TicketPercentIcon,
  },
];

export function AppSidebar() {
  return (
    <Sidebar>
      <SidebarHeader>
        <SidebarHeaderContent />
      </SidebarHeader>
      <SidebarContent>
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {generalItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      <SidebarFooter>
        <SidebarGroupLabel>Others</SidebarGroupLabel>
          <SidebarGroupContent>
            <SidebarMenu>
              {otherItems.map((item) => (
                <SidebarMenuItem key={item.title}>
                  <SidebarMenuButton asChild>
                    <Link href={item.url}>
                      <item.icon />
                      <span>{item.title}</span>
                    </Link>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              ))}
            </SidebarMenu>
          </SidebarGroupContent>
        <SidebarFooterContent />
      </SidebarFooter>
    </Sidebar>
  );
}
