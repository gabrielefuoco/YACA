'use client';
import Image from 'next/image';

export function Header() {
  return (
    <header className="flex items-center justify-between px-4 py-4 mb-6">
      <div className="flex items-center gap-3">
        <div className="relative">
          <Image src="/logo.png" alt="YACA" width={40} height={40} className="rounded-xl shadow-lg shadow-[#8a5aeb]/20" unoptimized />
          <div className="absolute -inset-1 rounded-xl bg-[#8a5aeb]/20 blur-md -z-10" />
        </div>
        <div>
          <h1 className="text-xl font-bold text-white leading-none tracking-tight">YACA</h1>
          <p className="text-xs text-white/40 leading-none mt-1">Yet Another Catalog Addon</p>
        </div>
      </div>
    </header>
  );
}
