import React, { useMemo } from 'react';
import { CompiledVector } from '@/types';

interface OrbitalDnaGraphProps {
  compiledVectors?: CompiledVector & { idNames?: Record<string, string> };
  getDnaName: (vectorKey: string) => string;
}

export function OrbitalDnaGraph({ compiledVectors, getDnaName }: OrbitalDnaGraphProps) {
  const nodes = useMemo(() => {
    if (!compiledVectors || !compiledVectors.V_final) return null;

    const finalVector = compiledVectors.V_final;
    const items = Object.entries(finalVector)
      .filter(([key]) => key.match(/^[gkda]:/)) // Only genres, keywords, directors, actors
      .sort((a, b) => b[1] - a[1]);

    if (items.length === 0) return null;

    // Take top 3 genres for the center
    const genres = items.filter(([k]) => k.startsWith('g:')).slice(0, 3);
    const others = items.filter(([k]) => !k.startsWith('g:')).slice(0, 10); // Top 10 other traits for orbit

    return { genres, others };
  }, [compiledVectors]);

  if (!nodes || nodes.genres.length === 0) {
    return <div className="text-center text-sm text-marrow-light/50 py-10">Dati DNA insufficienti per il grafo.</div>;
  }

  // Costellazione rendering
  return (
    <div className="relative w-full h-[400px] bg-[#0A0A0B] rounded-xl border border-white/5 overflow-hidden flex items-center justify-center mt-6">
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: 'radial-gradient(circle at center, rgba(16, 250, 150, 0.05) 0%, transparent 70%)'
      }} />

      {/* Orbits */}
      <div className="absolute w-[180px] h-[180px] border border-primary/20 rounded-full animate-[spin_60s_linear_infinite]" />
      <div className="absolute w-[280px] h-[280px] border border-primary/10 rounded-full animate-[spin_90s_linear_infinite_reverse]" />

      {/* Center: Genres */}
      <div className="relative z-10 flex flex-col items-center justify-center gap-2">
        {nodes.genres.map(([key, weight], i) => {
          const name = getDnaName(key);
          const size = i === 0 ? 'text-lg font-bold' : 'text-sm opacity-80';
          const bg = i === 0 ? 'bg-primary text-black shadow-[0_0_20px_rgba(16,250,150,0.5)]' : 'bg-[#121214] border border-primary/30 text-primary';
          return (
            <div key={key} className={`px-4 py-2 rounded-full ${bg} ${size} whitespace-nowrap transition-transform hover:scale-110 cursor-default`}>
              {name}
            </div>
          );
        })}
      </div>

      {/* Orbiting nodes (Keywords, People) */}
      {nodes.others.map(([key, weight], i) => {
        const name = getDnaName(key);
        const total = nodes.others.length;
        const angle = (i / total) * 2 * Math.PI;
        
        // Varying distance: closer if weight is higher
        // Max orbit radius is ~140px, min is ~90px
        const maxWeight = nodes.others[0][1];
        const normalizedW = weight / maxWeight; // 0 to 1
        const radius = 140 - (normalizedW * 50); // Higher weight = smaller radius (closer to center)

        const x = Math.cos(angle) * radius;
        const y = Math.sin(angle) * radius;

        const isPerson = key.startsWith('a:') || key.startsWith('d:');
        const colorClass = isPerson ? 'text-blue-400 border-blue-400/30 bg-blue-400/10' : 'text-purple-400 border-purple-400/30 bg-purple-400/10';

        return (
          <div 
            key={key} 
            className={`absolute px-3 py-1.5 rounded-full text-xs font-medium border whitespace-nowrap cursor-default hover:z-20 transition-all hover:scale-110 hover:brightness-125 shadow-lg ${colorClass}`}
            style={{
              transform: `translate(calc(-50% + ${x}px), calc(-50% + ${y}px))`
            }}
            title={`Peso VSM: ${weight.toFixed(2)}`}
          >
            {name}
          </div>
        );
      })}
    </div>
  );
}
