import React, { useMemo } from "react"
import {
  Breadcrumb,
  BreadcrumbItem,
  BreadcrumbLink,
  BreadcrumbList,
  BreadcrumbPage,
  BreadcrumbSeparator,
} from "@/components/ui/breadcrumb"

/**
 * Format a URL path segment into a human-readable label.
 *
 * @param segment - A single URL segment, typically lowercase and may contain dashes
 * @returns The segment with dashes replaced by spaces and each word capitalized
 */
function formatSegment(segment: string) {
  return segment.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase())
}

/**
 * Render a breadcrumb trail derived from a pathname string.
 *
 * Splits `pathname` on '/' into segments, formats each segment (replacing dashes with spaces and capitalizing words),
 * and renders prior segments as links to their cumulative path while rendering the final segment as a non-clickable page label.
 *
 * @param pathname - Optional pathname (e.g. "/projects/my-project/items"); if falsy or empty, nothing is rendered.
 * @returns The breadcrumb JSX element, or `null` when there are no path segments.
 */
export function Breadcrumbs({ pathname }: { pathname?: string | null }) {
  const segments = useMemo(() => {
    if (!pathname) return []
    return pathname.split("/").filter(Boolean)
  }, [pathname])

  if (segments.length === 0) return null

  return (
    <Breadcrumb>
      <BreadcrumbList>
        {segments.map((segment, index) => {
          const href = "/" + segments.slice(0, index + 1).join("/")
          const isLast = index === segments.length - 1

          return (
            <React.Fragment key={href}>
              <BreadcrumbItem>
                {isLast ? (
                  <BreadcrumbPage>{formatSegment(segment)}</BreadcrumbPage>
                ) : (
                  <BreadcrumbLink href={href}>{formatSegment(segment)}</BreadcrumbLink>
                )}
              </BreadcrumbItem>

              {!isLast && <BreadcrumbSeparator />}
            </React.Fragment>
          )
        })}
      </BreadcrumbList>
    </Breadcrumb>
  )
}