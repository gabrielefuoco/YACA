'use client';
import Image from 'next/image';

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-solid border-primary/10 bg-background/80 px-3 sm:px-6 md:px-10 py-2 sm:py-3 sticky top-0 z-50 gap-2">
      <div className="flex items-center gap-2 sm:gap-4 shrink-0">
        <div className="h-7 w-7 sm:h-8 sm:w-8 flex items-center justify-center">
          <Image src="/fiamma_yaca.png" alt="YACA Logo" width={32} height={32} className="object-contain" />
        </div>
        <div className="flex flex-col">
          <h2 className="text-marrow-deep text-base sm:text-lg font-black leading-tight tracking-tighter">YACA</h2>
          <span className="text-[10px] uppercase tracking-widest font-bold text-marrow-light hidden sm:block">Yet Another Catalog Addon</span>
        </div>
      </div>
      <div className="flex flex-1 justify-end items-center gap-2 sm:gap-8 min-w-0">
        {children}
        <button className="hidden md:flex min-w-[84px] cursor-pointer items-center justify-center rounded-lg h-10 px-4 bg-primary/10 text-primary text-sm font-bold leading-normal border border-primary/20">
          <span className="truncate">v2.4.0-beta</span>
        </button>
      </div>
    </header>
  );
}
