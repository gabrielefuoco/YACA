'use client';
import Image from 'next/image';

export function Header({ children }: { children?: React.ReactNode }) {
  return (
    <header className="flex items-center justify-between border-b border-solid border-primary/10 bg-[#F5E2C3]/70 px-3 sm:px-6 md:px-10 py-2 sm:py-3 sticky top-0 z-50 gap-2">
      <div className="flex items-center gap-2.5 sm:gap-4 shrink-0">
        <div className="h-9 w-9 sm:h-11 sm:w-11 flex items-center justify-center">
          <Image src="/fiamma_yaca.png" alt="YACA Logo" width={44} height={44} className="object-contain" />
        </div>
        <div className="flex flex-col">
          <h2 className="text-marrow-deep text-lg sm:text-2xl font-black leading-tight tracking-tighter">YACA</h2>
          <span className="text-xs uppercase tracking-widest font-bold text-marrow-light hidden sm:block">Yet Another Catalog Addon</span>
        </div>
      </div>
      <div className="flex flex-1 justify-end items-center gap-2 sm:gap-8 min-w-0">
        {children}
      </div>
    </header>
  );
}
