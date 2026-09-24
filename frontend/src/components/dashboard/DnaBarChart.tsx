'use client';

import React, { useMemo } from 'react';
import { CompiledVector } from '@/types';
import { groupDnaItems, DnaCategoryGroup, DnaRawItem } from '@/lib/dnaChart';

export interface DnaBarChartProps {
  compiledVectors?: (CompiledVector & { idNames?: Record<string, string> }) | null;
  getDnaName?: (vectorKey: string) => string;
  items?: DnaRawItem[];
  maxItemsPerCategory?: number;
  className?: string;
}

export function DnaBarChart({
  compiledVectors,
  getDnaName,
  items,
  maxItemsPerCategory = 10,
  className = '',
}: DnaBarChartProps) {
  const groups: DnaCategoryGroup[] = useMemo(() => {
    if (items && items.length > 0) {
      return groupDnaItems(items, getDnaName, { maxItemsPerCategory });
    }

    if (!compiledVectors) return [];

    const finalVector = (compiledVectors.V_final && Object.keys(compiledVectors.V_final).length > 0)
      ? compiledVectors.V_final
      : compiledVectors.V_static;

    if (!finalVector || Object.keys(finalVector).length === 0) return [];

    return groupDnaItems(finalVector, getDnaName, { maxItemsPerCategory });
  }, [compiledVectors, getDnaName, items, maxItemsPerCategory]);

  if (groups.length === 0) {
    return (
      <div className="w-full text-center text-sm text-marrow-light/50 py-10 rounded-2xl border border-marrow-light/10 bg-marrow-light/5">
        Dati DNA insufficienti per il grafico.
      </div>
    );
  }

  return (
    <div
      className={`w-full rounded-2xl bg-marrow-light/5 border border-marrow-light/10 p-4 sm:p-6 flex flex-col gap-6 shadow-xs ${className}`}
      role="region"
      aria-label="Grafico a barre del DNA del profilo"
    >
      {/* ── Chart Header: Title & Axis ── */}
      <div className="flex items-center justify-between pb-3 border-b border-marrow-light/10">
        <div className="flex items-center gap-2">
          <span className="text-xs sm:text-sm font-black uppercase tracking-widest text-marrow-deep">
            DNA del Profilo
          </span>
        </div>
        <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-marrow-light/60">
          Peso
        </span>
      </div>

      {/* ── Category Groups Grid: Responsive (1 col mobile, 2 cols on wide screens for short categories) ── */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 sm:gap-8 items-start">
        {groups.map((group) => {
          // Short categories (<= 3 items) occupy 1 column on desktop, longer categories span full width
          const isShort = group.items.length <= 3;
          const colSpanClass = isShort ? 'md:col-span-1' : 'md:col-span-2';

          return (
            <section
              key={group.id}
              className={`flex flex-col gap-3 rounded-xl p-3 sm:p-4 bg-white/40 border border-marrow-light/5 shadow-2xs ${colSpanClass}`}
              aria-label={group.title}
            >
              {/* Category Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-primary font-black text-xs sm:text-sm uppercase tracking-wider">
                  <span className="text-base select-none" aria-hidden="true">{group.icon}</span>
                  <h2>{group.title}</h2>
                </div>
                <span className="text-[10px] text-marrow-light/50 font-mono font-semibold">
                  {group.items.length} {group.items.length === 1 ? 'voce' : 'voci'}
                </span>
              </div>

              {/* Items List */}
              <div className="flex flex-col gap-2.5 mt-1">
                {group.items.map((item) => (
                  <div
                    key={item.key}
                    className="flex items-center gap-2 sm:gap-3 group/row transition-colors"
                  >
                    {/* Item Name (Truncated with native title tooltip) */}
                    <span
                      className="w-24 sm:w-32 md:w-36 shrink-0 truncate text-xs sm:text-sm font-medium text-marrow-deep select-none cursor-default"
                      title={item.name}
                    >
                      {item.name}
                    </span>

                    {/* Horizontal Bar (CSS only, accessible progressbar) */}
                    <div
                      className="flex-1 bg-marrow-light/10 h-2.5 sm:h-3 rounded-full overflow-hidden relative shadow-inner"
                      role="progressbar"
                      aria-valuenow={item.percentage}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      aria-label={`${item.name}: ${item.percentage}%`}
                    >
                      <div
                        className="h-full rounded-full bg-gradient-to-r from-primary to-accent transition-all duration-300 group-hover/row:brightness-110"
                        style={{ width: `${item.percentage}%` }}
                      />
                    </div>

                    {/* Percentage */}
                    <span className="w-9 sm:w-11 text-right shrink-0 text-xs font-bold font-mono text-marrow-deep/80">
                      {item.percentage}%
                    </span>
                  </div>
                ))}
              </div>
            </section>
          );
        })}
      </div>
    </div>
  );
}

export default DnaBarChart;
