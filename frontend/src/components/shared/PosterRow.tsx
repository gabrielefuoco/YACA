'use client';
import { useState, useEffect, useRef } from 'react';
import { PosterItem } from '@/types';
import { api } from '@/lib/api';

interface PosterRowProps {
  presetId?: string;
  filters?: Record<string, unknown>;
  type?: string;
  prompt?: string;
}

export function PosterRow({ presetId, filters, type, prompt }: PosterRowProps) {
  const [items, setItems] = useState<PosterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const requestKey = JSON.stringify({ presetId, filters, type, prompt });

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
            .previewCatalog({ presetId, filters, type, prompt })
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
  }, [presetId, filters, type, prompt, loaded]);

  return (
    <div ref={ref} className="mt-2 w-full max-w-full overflow-hidden">
      {loading && (
        <div className="flex max-w-full gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-[225px] w-[150px] shrink-0 animate-pulse rounded-lg bg-primary/10 border border-primary/5" />
          ))}
        </div>
      )}
      {!loading && items.length > 0 && (
        <div className="flex max-w-full gap-2 overflow-x-auto pb-4 hide-scrollbar">
          {items.map((item) => (
            <div key={item.id} className="group/poster relative shrink-0 cursor-pointer">
              {item.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.poster}
                  alt={item.title}
                  className="h-[225px] w-[150px] rounded-lg object-cover transition-all duration-300 group-hover/poster:scale-105 group-hover/poster:shadow-2xl group-hover/poster:shadow-primary/30 shadow-md shadow-marrow-light/20"
                />
              ) : (
                <div className="flex h-[225px] w-[150px] items-center justify-center rounded-lg bg-marrow-light/5 text-xs text-marrow-light/60 border border-marrow-light/20">
                  {item.title.slice(0, 2)}
                </div>
              )}
              <div className="absolute inset-0 flex flex-col justify-end rounded-lg bg-gradient-to-t from-primary-dark/90 via-primary-dark/30 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100">
                <p className="text-[12px] font-black text-white line-clamp-2 leading-tight drop-shadow-md uppercase tracking-tight">{item.title}</p>
                {item.year && <p className="text-[10px] text-accent font-bold mt-0.5">{item.year}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && loaded && items.length === 0 && (
        <p className="text-xs text-marrow-light/40 py-8 text-center italic font-medium uppercase tracking-widest">Nessun risultato trovato</p>
      )}
    </div>
  );
}
