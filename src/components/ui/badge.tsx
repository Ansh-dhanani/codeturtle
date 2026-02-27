import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Badge styling variants using CVA (class-variance-authority)
 * Provides consistent styling for different badge types with focus and error states
 */
const badgeVariants = cva(
  "inline-flex items-center justify-center rounded-full border px-2 py-0.5 text-xs font-medium w-fit whitespace-nowrap shrink-0 [&>svg]:size-3 gap-1 [&>svg]:pointer-events-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive transition-[color,box-shadow] overflow-hidden",
  {
    variants: {
      variant: {
        /** Primary badge style (default) */
        default:
          "border-transparent bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
        /** Secondary badge style for less prominent badges */
        secondary:
          "border-transparent bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
        /** Destructive badge style for error/warning states */
        destructive:
          "border-transparent bg-destructive text-white [a&]:hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        /** Outlined badge style with accent hover effect */
        outline:
          "text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

/**
 * Badge component - A reusable badge element with multiple style variants
 * Supports composition via asChild prop for flexibility
 * 
 * @param variant - The style variant ('default', 'secondary', 'destructive', 'outline')
 * @param asChild - If true, uses Slot for component composition instead of rendering as span
 * @param className - Additional CSS classes to merge with variant styles
 * @param props - Standard span element props
 * 
 * @example
 * <Badge variant="default">New</Badge>
 * <Badge variant="destructive" asChild><Link href="/delete">Delete</Link></Badge>
 */
function Badge({
  className,
  variant,
  asChild = false,
  ...props
}: React.ComponentProps<"span"> &
  VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : "span"

  return (
    <Comp
      data-slot="badge"
      className={cn(badgeVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Badge, badgeVariants }
