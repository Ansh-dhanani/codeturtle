"use client"

import {
  Settings,
  BadgeQuestionMark,
  LayoutDashboard,
  ChartLine,
  Book,
} from "lucide-react"
import { TicketPercentIcon } from "./ui/icons/lucide-ticket-percent"
import Link from "next/link"
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
  SidebarRail,
  useSidebar,
} from "@/components/ui/sidebar"
import { SidebarFooterContent } from "./sidebar-footer"
import { SidebarHeaderContent } from "./sidebar-header"

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType
}

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
]

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
]

export function AppSidebar() {
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <SidebarHeaderContent />
      </SidebarHeader>
      
      <SidebarContent>
        {/* Application Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Application</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={generalItems} />
          </SidebarGroupContent>
        </SidebarGroup>

        {/* Others Section */}
        <SidebarGroup>
          <SidebarGroupLabel>Others</SidebarGroupLabel>
          <SidebarGroupContent>
            <NavItems items={otherItems} />
          </SidebarGroupContent>
        </SidebarGroup>
      </SidebarContent>
      
      <SidebarFooter>
        <SidebarFooterContent />
      </SidebarFooter>
      
      <SidebarRail />
    </Sidebar>
  )
}

// Separate component to use useSidebar hook
function NavItems({ items }: { items: NavItem[] }) {
  const { isMobile, setOpenMobile } = useSidebar()

  const handleClick = () => {
    if (isMobile) {
      setOpenMobile(false)
    }
  }

  return (
    <SidebarMenu>
      {items.map((item) => (
        <SidebarMenuItem key={item.title}>
          <SidebarMenuButton asChild onClick={handleClick}>
            <Link href={item.url}>
              <item.icon />
              <span>{item.title}</span>
            </Link>
          </SidebarMenuButton>
        </SidebarMenuItem>
      ))}
    </SidebarMenu>
  )
}