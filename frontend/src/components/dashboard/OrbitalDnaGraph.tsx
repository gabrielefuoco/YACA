'use client';
import React, { useMemo, useRef, useState, useEffect } from 'react';
import { CompiledVector } from '@/types';

interface OrbitalDnaGraphProps {
  compiledVectors?: CompiledVector & { idNames?: Record<string, string> };
  getDnaName: (vectorKey: string) => string;
}

export function OrbitalDnaGraph({ compiledVectors, getDnaName }: OrbitalDnaGraphProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [containerWidth, setContainerWidth] = useState<number>(400);

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;

    const updateDimensions = () => {
      if (el && el.clientWidth > 0) {
        setContainerWidth(el.clientWidth);
      }
    };

    updateDimensions();

    if (typeof ResizeObserver !== 'undefined') {
      const observer = new ResizeObserver((entries) => {
        for (const entry of entries) {
          if (entry.contentRect.width > 0) {
            setContainerWidth(entry.contentRect.width);
          }
        }
      });
      observer.observe(el);
      return () => observer.disconnect();
    } else {
      window.addEventListener('resize', updateDimensions);
      return () => window.removeEventListener('resize', updateDimensions);
    }
  }, []);

  const nodes = useMemo(() => {
    if (!compiledVectors || !compiledVectors.V_final) return null;

    const finalVector = compiledVectors.V_final;
    const items = Object.entries(finalVector)
      .filter(([key]) => key.match(/^[gkda]:/)) // Only genres, keywords, directors, actors
      .sort((a, b) => b[1] - a[1]);

    if (items.length === 0) return null;

    const genres = items.filter(([k]) => k.startsWith('g:'));
    const nonGenres = items.filter(([k]) => !k.startsWith('g:'));

    // Center uses up to 3 items: genres first, then fallback to others
    const center = [...genres, ...nonGenres].slice(0, 3);
    const others = items.filter(i => !center.includes(i)).slice(0, 10);

    return { center, others };
  }, [compiledVectors]);

  if (!nodes || nodes.center.length === 0) {
    return <div className="text-center text-sm text-marrow-light/50 py-10">Dati DNA insufficienti per il grafo.</div>;
  }

  // Responsive radius calculation based on measured container width to mathematically prevent clipping
  const effectiveWidth = containerWidth > 0 ? containerWidth : 380;
  const isCompact = effectiveWidth < 480;
  const isVeryCompact = effectiveWidth < 360;

  // Maximum radius horizontally so pills (up to ~105px width on mobile) never clip container edge
  const maxPillHalfWidth = isVeryCompact ? 44 : isCompact ? 50 : 70;
  const safeMargin = 10;
  const maxAllowedRadius = Math.max(70, Math.min(160, (effectiveWidth / 2) - maxPillHalfWidth - safeMargin));

  const baseRadius = maxAllowedRadius;
  const innerOrbitSize = Math.round(baseRadius * 1.35);
  const outerOrbitSize = Math.round(baseRadius * 2.05);

  // Prevent overlapping pills on narrow screens: show top 5-6 on mobile, 10 on tablet/desktop
  const othersToDisplay = nodes.others.slice(0, isVeryCompact ? 5 : isCompact ? 6 : 10);

  return (
    <div
      ref={containerRef}
      className={`relative w-full ${isCompact ? 'h-[320px] sm:h-[340px]' : 'h-[400px]'} bg-marrow-light/5 rounded-2xl border border-marrow-light/10 overflow-hidden flex items-center justify-center mt-4 sm:mt-6 transition-[height] duration-300`}
    >
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at center, rgba(175, 41, 35, 0.05) 0%, transparent 70%)'
      }} />

      {/* Orbits - centered explicitly and non-blocking */}
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-primary/20 rounded-full animate-[spin_60s_linear_infinite] pointer-events-none"
        style={{ width: `${innerOrbitSize}px`, height: `${innerOrbitSize}px` }}
      />
      <div
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 border border-primary/10 rounded-full animate-[spin_90s_linear_infinite_reverse] pointer-events-none"
        style={{ width: `${outerOrbitSize}px`, height: `${outerOrbitSize}px` }}
      />

      {/* Center: Top Nodes */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-1.5 sm:gap-2 max-w-[70%] px-2">
        {nodes.center.map(([key], i) => {
          const name = getDnaName(key);
          const isTop = i === 0;
          const size = isTop
            ? (isCompact ? 'text-xs font-bold px-3 py-1' : 'text-sm sm:text-lg font-bold px-4 py-2')
            : (isCompact ? 'text-[10px] font-semibold px-2 py-0.5' : 'text-xs sm:text-sm font-semibold opacity-90 px-3 py-1');
          const bg = isTop
            ? 'bg-primary text-white shadow-[0_0_20px_rgba(175,41,35,0.4)]'
            : 'bg-white/90 border border-primary/30 text-primary shadow-sm';
          return (
            <div
              key={key}
              className={`rounded-full ${bg} ${size} truncate max-w-full whitespace-nowrap transition-transform hover:scale-105 cursor-default text-center`}
              title={name}
            >
              {name}
            </div>
          );
        })}
      </div>

      {/* Orbiting nodes (Keywords, People) */}
      {othersToDisplay.map(([key, weight], i) => {
        const name = getDnaName(key);
        const total = othersToDisplay.length;
        const angle = (i / total) * 2 * Math.PI;

        const maxWeight = othersToDisplay[0]?.[1] || 1;
        const normalizedW = weight / maxWeight; // 0 to 1
        const radius = baseRadius - (normalizedW * (isCompact ? 16 : 28)) + ((i % 2 === 0 ? 8 : -8));

        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        const isPerson = key.startsWith('a:') || key.startsWith('d:');
        const colorClass = isPerson
          ? 'text-blue-700 border-blue-500/40 bg-blue-500/10'
          : 'text-purple-700 border-purple-500/40 bg-purple-500/10';

        const pillSize = isVeryCompact
          ? 'px-2 py-0.5 text-[9px] max-w-[90px]'
          : isCompact
          ? 'px-2.5 py-0.5 text-[10px] max-w-[105px]'
          : 'px-3 py-1.5 text-xs max-w-[150px]';

        return (
          <div
            key={key}
            className={`absolute left-1/2 top-1/2 ${pillSize} rounded-full font-medium border truncate whitespace-nowrap cursor-default hover:z-20 transition-all hover:scale-110 hover:brightness-125 shadow-lg ${colorClass}`}
            style={{
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
            }}
            title={`${name} (Peso VSM: ${weight.toFixed(2)})`}
          >
            {name}
          </div>
        );
      })}
    </div>
  );
}
