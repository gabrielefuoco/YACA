'use client';
import { useState, useEffect, useRef } from 'react';
import { PosterItem } from '@/types';
import { api } from '@/lib/api';
import { PosterCard } from '@/components/shared/PosterCard';

interface PosterRowProps {
  presetId?: string;
  filters?: Record<string, unknown>;
  type?: string;
  prompt?: string;
  /** Modalità dell'elenco che si sta guardando: l'anteprima va chiesta con le SUE leve. */
  modo?: string;
}

export function PosterRow({ presetId, filters, type, prompt, modo }: PosterRowProps) {
  const [items, setItems] = useState<PosterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const requestKey = JSON.stringify({ presetId, filters, type, prompt, modo });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setItems([]);
    setLoaded(false);
  }, [requestKey]);

  useEffect(() => {
    if (loaded) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setLoading(true);
          api
            .previewCatalog({ id: presetId, filters, type, prompt, modo })
            .then((data) => setItems(data.items || data.results || []))
            .catch((err) => { 
              console.error('Failed to preview catalog:', err);
              setItems([]); // Clear items on error to display fallback
            })
            .finally(() => {
              setLoading(false);
              setLoaded(true);
            });
          observer.disconnect();
        }
      },
      { threshold: 0.1 }
    );
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [presetId, filters, type, prompt, modo, loaded]);

  return (
    <div ref={ref} className="mt-2 w-full max-w-full overflow-hidden">
      {loading && (
        <div className="flex max-w-full gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[180px] w-[120px] sm:h-[225px] sm:w-[150px] shrink-0 animate-pulse rounded-xl bg-primary/10 border border-primary/5" />
          ))}
        </div>
      )}
      {!loading && items.length > 0 && (
        <div className="flex max-w-full gap-2 sm:gap-3 overflow-x-auto pb-4 snap-x hide-scrollbar">
          {items.map((item) => (
            <PosterCard
              key={item.id}
              poster={item.poster}
              title={item.title}
              year={item.year}
              size="md"
              className="snap-start"
            />
          ))}
        </div>
      )}
      {!loading && loaded && items.length === 0 && (
        <div className="flex flex-col items-center justify-center py-6 px-4 rounded-xl bg-white/30 border border-marrow-light/10 text-center">
          <p className="text-xs text-marrow-light/70 font-medium">Nessun titolo disponibile in anteprima al momento</p>
          <span className="text-[11px] text-marrow-light/40 mt-0.5">I contenuti si aggiorneranno con la tua attività</span>
        </div>
      )}
    </div>
  );
}
