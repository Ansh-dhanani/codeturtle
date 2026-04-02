"use client"

import {
  Settings,
  BadgeQuestionMark,
  LayoutDashboard,
  ChartLine,
  Book,
  FileSearch,
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
/**
 * NavItem Interface
 * 
 * Represents a single navigation menu item with:
 * - title: Display text for the menu item
 * - url: Navigation path for the link
 * - icon: Lucide React icon component to display
 */

interface NavItem {
  title: string
  url: string
  icon: React.ComponentType
}
/**
 * Main navigation items for the application
 * Includes core functionality: Dashboard, Repositories, Analytics, and Settings
 */

const generalItems = [
  {
    title: "Dashboard",
    url: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    title: "Repositories",
    url: "/repositories",
    icon: Book,
  },
  {
    title: "Reviews",
    url: "/reviews",
    icon: FileSearch,
  },
  {
    title: "Analytics",
    url: "/analytics",
    icon: ChartLine,
  },
  /**
 * Secondary navigation items for support and information
 * Includes: Docs, Support, and Pricing pages
 */
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
/**
 * AppSidebar Component
 * 
 * Main sidebar wrapper that organizes navigation into two groups:
 * 1. Application: Core features for managing projects and insights
 * 2. Others: Additional resources and account management
 * 
 * Renders header, content sections with nav items, and footer.
 * Supports collapsible icon-only mode on smaller screens.
 */

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
/**
 * NavItems Component
 * 
 * Renders a list of navigation menu items with links.
 * Automatically closes the sidebar on mobile when a link is clicked.
 * 
 * @param items - Array of navigation items to display
 */

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
