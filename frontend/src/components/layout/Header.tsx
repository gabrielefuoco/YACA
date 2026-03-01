'use client';
import Image from 'next/image';

export function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-3 mb-6">
      <div className="flex items-center gap-3">
        <Image src="/logo.png" alt="YACA" width={36} height={36} className="rounded-lg" unoptimized />
        <div>
          <h1 className="text-lg font-bold text-white leading-none">YACA</h1>
          <p className="text-xs text-white/50 leading-none mt-0.5">Yet Another Catalog Addon</p>
        </div>
      </div>
    </header>
  );
}
