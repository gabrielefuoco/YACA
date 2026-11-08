'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PosterCard } from '@/components/shared/PosterCard';
import { EngineSliders } from '@/types';

interface CatalogLivePreviewProps {
  catalogId: string;
  userId: string;
  profileId: string;
  sliders?: EngineSliders;
  type?: 'movie' | 'series';
}

export function CatalogLivePreview({ catalogId, userId, profileId, sliders, type }: CatalogLivePreviewProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    const abortController = new AbortController();
    
    async function fetchPreview() {
      setLoading(true);
      setError(null);
      try {
        const valTonalita = sliders?.tonalita ?? sliders?.cozy ?? 0;
        const valNotorieta = sliders?.notorieta ?? sliders?.canone ?? 0;
        const quantizedSliders = sliders ? {
          tonalita: Math.round(valTonalita * 10) / 10,
          notorieta: Math.round(valNotorieta * 10) / 10,
          cozy: Math.round(valTonalita * 10) / 10,
          canone: Math.round(valNotorieta * 10) / 10,
        } : undefined;

        const res = await api.previewCatalog({ 
          profileId, 
          id: catalogId,
          type: type || (catalogId.includes('series') ? 'series' : 'movie'),
          sliders: quantizedSliders,
        }, { signal: abortController.signal });
        
        if (mounted && !abortController.signal.aborted) {
          const fetchedItems = res?.metas || res?.cards || res?.items || res?.results;
          if (fetchedItems) {
            setItems(fetchedItems.slice(0, 20));
          } else {
            setItems([]);
          }
        }
      } catch (err: any) {
        if (err?.name === 'AbortError' || abortController.signal.aborted) {
          return;
        }
        if (mounted) {
          console.error('[CatalogLivePreview] Errore caricamento preview:', err);
          setError('Impossibile caricare la preview');
        }
      } finally {
        if (mounted && !abortController.signal.aborted) {
          setLoading(false);
        }
      }
    }

    fetchPreview();
    return () => {
      mounted = false;
      abortController.abort();
    };
  }, [catalogId, userId, profileId, sliders?.tonalita, sliders?.notorieta, sliders?.cozy, sliders?.canone, type]);

  if (loading) {
    return (
      <div className="flex gap-4 overflow-x-hidden p-2 opacity-50">
        {[...Array(5)].map((_, i) => (
          <div key={i} className="w-[120px] h-[180px] sm:w-[150px] sm:h-[225px] shrink-0 bg-marrow-light/10 animate-pulse rounded-xl" />
        ))}
      </div>
    );
  }

  if (error) {
    return <div className="text-destructive font-semibold text-sm p-4">{error}</div>;
  }

  if (items.length === 0) {
    return <div className="text-marrow-light/70 text-sm p-4 italic">Nessun elemento trovato per il tuo DNA.</div>;
  }

  return (
    <div className="flex gap-2 sm:gap-3 overflow-x-auto p-2 snap-x pb-4 hide-scrollbar">
      {items.map((meta) => {
        // Injected by StremioFormatter modified explicitly for our WebUI
        const matchPercent = meta._yacaMatch; 
        
        return (
          <PosterCard
            key={meta.id}
            poster={meta.poster}
            title={meta.name || meta.title || 'Senza titolo'}
            year={meta.releaseInfo || meta.year}
            size="md"
            className="snap-start"
            badge={
              matchPercent !== undefined && matchPercent !== null ? (
                <div className="bg-primary/90 text-white text-xs font-bold px-2 py-0.5 rounded shadow-lg backdrop-blur-sm">
                  {matchPercent}% Match
                </div>
              ) : null
            }
          />
        );
      })}
    </div>
  );
}
