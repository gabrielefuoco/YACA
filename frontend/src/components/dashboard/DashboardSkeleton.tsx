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
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2 sm:gap-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="flex flex-col items-center p-4 rounded-xl border-2 border-marrow-light/10 bg-white/40 gap-3">
              <Skeleton className="size-12 rounded-full" />
              <Skeleton className="h-4 w-20" />
            </div>
          ))}
        </div>
      </section>

      {/* Profile Settings Panel Skeleton */}
      <div className="rounded-2xl glass-panel p-6 border border-marrow-light/10">
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

      {/* Tabs Skeleton — mirror della tab bar reale: 5 voci, 2 colonne sotto 420px.
          Prima era un inline-flex rigido da 552px: su un telefono sfondava il viewport. */}
      <div className="flex flex-col gap-6 items-center w-full mt-4">
        <div className="grid grid-cols-2 min-[420px]:grid-cols-3 sm:flex sm:flex-wrap sm:w-fit p-1.5 bg-white/40 rounded-2xl border border-marrow-light/20 gap-1.5 sm:gap-2 mb-4 mx-auto">
          {[...Array(5)].map((_, i) => (
            <Skeleton key={i} className="h-11 sm:h-10 w-full sm:w-28 rounded-xl" />
          ))}
        </div>
        
        {/* Content Area Skeleton — la vista di default è una lista verticale a colonna singola */}
        <div className="flex flex-col gap-4 sm:gap-6 w-full">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="p-3 sm:p-5 rounded-xl border border-marrow-light/10 bg-white/40 space-y-3">
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
