'use client';
import { useState, useEffect, useRef } from 'react';
import { PosterItem } from '@/types';
import { api } from '@/lib/api';

interface PosterRowProps {
  presetId?: string;
  filters?: Record<string, unknown>;
  type?: string;
}

export function PosterRow({ presetId, filters, type }: PosterRowProps) {
  const [items, setItems] = useState<PosterItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (loaded) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          setLoading(true);
          api
            .previewCatalog({ presetId, filters, type })
            .then((data) => setItems(data.items ?? []))
            .catch(() => {})
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
  }, [presetId, filters, type, loaded]);

  return (
    <div ref={ref} className="mt-2">
      {loading && (
        <div className="flex gap-2 overflow-hidden">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-28 w-20 shrink-0 animate-pulse rounded-md bg-white/10" />
          ))}
        </div>
      )}
      {!loading && items.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {items.map((item) => (
            <div key={item.id} className="group relative shrink-0 cursor-pointer">
              {item.poster ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.poster}
                  alt={item.title}
                  className="h-28 w-20 rounded-md object-cover transition-transform group-hover:scale-105"
                />
              ) : (
                <div className="flex h-28 w-20 items-center justify-center rounded-md bg-white/10 text-xs text-white/40">
                  {item.title.slice(0, 2)}
                </div>
              )}
              <div className="absolute inset-0 flex flex-col justify-end rounded-md bg-gradient-to-t from-black/70 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100">
                <p className="text-[10px] font-medium text-white line-clamp-2">{item.title}</p>
                {item.year && <p className="text-[10px] text-white/60">{item.year}</p>}
              </div>
            </div>
          ))}
        </div>
      )}
      {!loading && loaded && items.length === 0 && (
        <p className="text-xs text-white/40 py-2">Nessun risultato</p>
      )}
    </div>
  );
}
