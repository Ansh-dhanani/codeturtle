"use client"

import { memo } from "react"
import { SidebarHeader, SidebarTrigger, useSidebar } from "@/components/ui/sidebar"
import { Code2 } from "lucide-react"
import { cn } from "@/lib/utils"

export const SidebarHeaderContent = memo(function SidebarHeaderContent() {
  const { state, isMobile } = useSidebar()

  return (
    <SidebarHeader className="h-14 border-b">
      {state === "collapsed" && !isMobile ? (
        // Collapsed state: logo that transforms to trigger on hover
        // Added padding to create larger hover area and prevent edge glitching
        <div className="flex h-full items-center justify-center relative group/header px-2">
          {/* Logo - visible by default, hidden on hover */}
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              "bg-primary text-primary-foreground",
              "transition-all duration-200 ease-in-out",
              "group-hover/header:opacity-0 group-hover/header:scale-95",
              "group-hover/header:pointer-events-none"
            )}
            aria-label="Codeturtle Logo"
          >
            <Code2 className="h-4 w-4" />
          </div>
          
          {/* Trigger button - hidden by default, visible on hover */}
          <div
            className={cn(
              "absolute inset-0 flex items-center justify-center",
              "opacity-0 scale-95 transition-all duration-200 ease-in-out",
              "pointer-events-none",
              "group-hover/header:opacity-100 group-hover/header:scale-100",
              "group-hover/header:pointer-events-auto"
            )}
          >
            <SidebarTrigger />
          </div>
        </div>
      ) : (
        // Expanded state: full header with logo, title, and trigger
        <div className="flex h-full items-center justify-between gap-2 px-2">
          <div className="flex h-full items-center gap-3 min-w-0 flex-1">
            {/* Logo - always visible */}
            <div
              className={cn(
                "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
                "bg-primary text-primary-foreground"
              )}
              aria-label="Codeturtle Logo"
            >
              <Code2 className="h-4 w-4" />
            </div>

            {/* Title */}
            <div className="flex min-w-0 flex-col leading-tight">
              <span className="truncate text-sm font-semibold whitespace-nowrap">
                Codeturtle
              </span>
            </div>
          </div>
          
          {/* Trigger button - always visible when expanded */}
          <SidebarTrigger className="shrink-0" />
        </div>
      )}
    </SidebarHeader>
  )
})