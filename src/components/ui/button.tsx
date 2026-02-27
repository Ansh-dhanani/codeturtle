import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@/lib/utils"

/**
 * Button styling variants using CVA (class-variance-authority)
 * Provides multiple visual variants and sizes with comprehensive focus and disabled states
 */
const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all disabled:pointer-events-none disabled:opacity-50 [&_svg]:pointer-events-none [&_svg:not([class*='size-'])]:size-4 shrink-0 [&_svg]:shrink-0 outline-none focus-visible:border-ring focus-visible:ring-ring/50 focus-visible:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        /** Primary button style (default) */
        default: "bg-primary text-primary-foreground hover:bg-primary/90",
        /** Destructive button style for delete/dangerous actions */
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:focus-visible:ring-destructive/40 dark:bg-destructive/60",
        /** Outlined button with border and background */
        outline:
          "border bg-background shadow-xs hover:bg-accent hover:text-accent-foreground dark:bg-input/30 dark:border-input dark:hover:bg-input/50",
        /** Secondary button style for less prominent actions */
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        /** Ghost button with minimal styling, hover effect only */
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        /** Link-style button with underline on hover */
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        /** Default button size */
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        /** Small button size */
        sm: "h-8 rounded-md gap-1.5 px-3 has-[>svg]:px-2.5",
        /** Large button size */
        lg: "h-10 rounded-md px-6 has-[>svg]:px-4",
        /** Icon-only button (medium) */
        icon: "size-9",
        /** Icon-only button (small) */
        "icon-sm": "size-8",
        /** Icon-only button (large) */
        "icon-lg": "size-10",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

/**
 * Button component - A versatile button element with multiple style and size variants
 * Supports composition via asChild prop for flexible rendering
 * 
 * @param variant - The style variant ('default', 'destructive', 'outline', 'secondary', 'ghost', 'link')
 * @param size - The button size ('default', 'sm', 'lg', 'icon', 'icon-sm', 'icon-lg')
 * @param asChild - If true, uses Slot for component composition instead of rendering as button
 * @param className - Additional CSS classes to merge with variant and size styles
 * @param props - Standard button element props
 * 
 * @example
 * <Button>Click me</Button>
 * <Button variant="destructive" size="sm">Delete</Button>
 * <Button variant="ghost" size="icon"><Icon /></Button>
 * <Button asChild><a href="/link">Link Button</a></Button>
 */
function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
