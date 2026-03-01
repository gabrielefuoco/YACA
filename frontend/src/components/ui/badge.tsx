import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"

const badgeVariants = cva(
  "inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
  {
    variants: {
      variant: {
        default: "border-transparent bg-[#8a5aeb]/20 text-[#8a5aeb]",
        movie: "border-transparent bg-blue-500/20 text-blue-400",
        series: "border-transparent bg-emerald-500/20 text-emerald-400",
        secondary: "border-transparent bg-white/10 text-white/80",
        destructive: "border-transparent bg-red-500/20 text-red-400",
        outline: "border-white/20 text-white/80",
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
