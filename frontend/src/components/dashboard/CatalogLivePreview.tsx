'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { PosterCard } from '@/components/shared/PosterCard';

interface CatalogLivePreviewProps {
  catalogId: string;
  userId: string;
  profileId: string;
}

export function CatalogLivePreview({ catalogId, userId, profileId }: CatalogLivePreviewProps) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    
    async function fetchPreview() {
      setLoading(true);
      try {
        // Fetch dal manifest locale di Stremio (la dashboard può chiamare le API relative se in locale,
        // ma essendo un'app separata usa `api.get` tramite proxy/backend).
        // Il manifest endpoint è /:userId/:configVersion/catalog/movie/:catalogId.json
        // Usiamo v1 come placeholder o recuperiamo la versione, ma proviamo a usare un endpoint API ad hoc.
        // Se non c'è, possiamo chiamare direttamente il formato manifest
        const res = await api.previewCatalog({ 
          profileId, 
          id: catalogId,
          type: catalogId.includes('series') ? 'series' : 'movie'
        });
        
        if (mounted) {
          const fetchedItems = res.metas || res.items || res.results;
          if (fetchedItems) {
            setItems(fetchedItems.slice(0, 20));
          } else {
            setItems([]);
          }
        }
      } catch (err) {
        if (mounted) {
          console.error(err);
          setError('Impossibile caricare la preview');
        }
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    }

    fetchPreview();
    return () => { mounted = false; };
  }, [catalogId, userId, profileId]);

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
    return <div className="text-red-400 text-sm p-4">{error}</div>;
  }

  if (items.length === 0) {
    return <div className="text-marrow-light/50 text-sm p-4">Nessun elemento trovato per il tuo DNA.</div>;
  }

  return (
    <div className="flex gap-4 overflow-x-auto p-2 snap-x pb-4 custom-scrollbar">
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
                <div className="bg-primary/90 text-black text-xs font-bold px-2 py-0.5 rounded shadow-lg backdrop-blur-sm">
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
