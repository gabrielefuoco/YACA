import { Skeleton } from "@/components/ui/skeleton"

export function DashboardSkeleton() {
  return (
    <div className="flex flex-col w-full gap-8 animate-in fade-in duration-500">
      <div className="flex flex-col gap-2">
        <Skeleton className="h-9 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Profiles Selection Skeleton */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between">
          <Skeleton className="h-7 w-32" />
          <Skeleton className="h-9 w-24" />
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex flex-col items-center p-4 rounded-xl border-2 border-zinc-200 dark:border-zinc-700/50 bg-zinc-100 dark:bg-zinc-800/40 gap-3">
              <Skeleton className="size-12 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </section>

      {/* Profile Settings Panel Skeleton */}
      <div className="rounded-2xl glass-panel p-6 border border-zinc-200 dark:border-zinc-700/50">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <Skeleton className="size-16 rounded-2xl" />
            <div className="space-y-2">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-4 w-48" />
            </div>
          </div>
          <div className="flex gap-2">
            <Skeleton className="h-10 w-28 rounded-lg" />
            <Skeleton className="h-10 w-10 rounded-lg" />
          </div>
        </div>
      </div>

      {/* Tabs Skeleton */}
      <div className="flex flex-col gap-6 items-center w-full mt-4">
        <div className="inline-flex p-1 bg-zinc-100 dark:bg-zinc-800/60 rounded-xl w-fit mb-4 mx-auto">
          {[...Array(4)].map((_, i) => (
            <Skeleton key={i} className="h-10 w-32 mx-1 rounded-lg" />
          ))}
        </div>
        
        {/* Content Area Skeleton */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 w-full">
          {[...Array(6)].map((_, i) => (
            <div key={i} className="p-4 rounded-xl border border-zinc-200 dark:border-zinc-700/50 bg-zinc-50 dark:bg-zinc-800/40 space-y-3">
              <div className="flex items-center gap-3">
                <Skeleton className="size-10 rounded-lg" />
                <Skeleton className="h-5 w-32" />
              </div>
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-2/3" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
