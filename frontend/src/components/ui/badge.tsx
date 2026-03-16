import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-primary/20 text-primary font-black uppercase tracking-wider",
        movie: "border-transparent bg-primary-dark/20 text-primary-dark font-black uppercase tracking-wider",
        series: "border-transparent bg-emerald-500/20 text-emerald-400 font-black uppercase tracking-wider",
        secondary: "border-transparent bg-secondary/20 text-secondary font-black uppercase tracking-wider",
        destructive: "border-transparent bg-primary-dark/30 text-primary-dark font-bold",
        accent: "border-transparent bg-accent/20 text-accent font-black uppercase tracking-wider",
        outline: "border-white/10 text-white/50 font-medium",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  }
)

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />
}

export { Badge, badgeVariants }
