'use client';

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between whitespace-nowrap border-b border-solid border-primary/10 bg-background-light dark:bg-background-dark/80 backdrop-blur-md px-6 md:px-10 py-3 sticky top-0 z-50">
      <div className="flex items-center gap-4">
        <div className="h-8 w-8 flex items-center justify-center">
          <img src="/fiamma_yaca.png" alt="YACA Logo" className="h-8 w-8 object-contain" />
        </div>
        <div className="flex flex-col">
          <h2 className="text-zinc-900 dark:text-zinc-50 text-lg font-black leading-tight tracking-tighter">YACA</h2>
          <span className="text-[10px] uppercase tracking-widest font-bold text-zinc-500 dark:text-zinc-500 hidden sm:block">Yet Another Catalog Addon</span>
        </div>
      </div>
      <div className="flex flex-1 justify-end gap-8">
        {children}
        <button className="hidden md:flex min-w-[84px] cursor-pointer items-center justify-center rounded-lg h-10 px-4 bg-primary/10 text-primary text-sm font-bold leading-normal border border-primary/20">
          <span className="truncate">v2.4.0-beta</span>
        </button>
      </div>
    </header>
  );
}
