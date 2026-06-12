import { cn } from "@/lib/utils"

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn("animate-pulse-subtle rounded-md bg-marrow-light/5 /5", className)}
      {...props}
    />
  )
}

export { Skeleton }
