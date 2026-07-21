'use client';

import React, { useEffect, useState } from 'react';
import { api } from '@/lib/api';

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
          userId, 
          profileId, 
          id: catalogId,
          type: catalogId.includes('series') ? 'series' : 'movie'
        });
        
        if (mounted) {
          if (res.metas) {
            setItems(res.metas.slice(0, 20));
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
          <div key={i} className="min-w-[150px] w-[150px] aspect-[2/3] bg-marrow-light/10 animate-pulse rounded-md" />
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
          <div key={meta.id} className="min-w-[140px] w-[140px] snap-start relative group/poster cursor-pointer">
            {meta.poster ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={meta.poster}
                alt={meta.name}
                className="h-[210px] w-[140px] rounded-lg object-cover transition-all duration-300 group-hover/poster:scale-105 group-hover/poster:shadow-2xl group-hover/poster:shadow-primary/30 shadow-md shadow-marrow-light/20"
              />
            ) : (
              <div className="flex h-[210px] w-[140px] items-center justify-center rounded-lg bg-marrow-light/5 text-xs text-marrow-light/60 border border-marrow-light/20">
                {meta.name?.slice(0, 2)}
              </div>
            )}
            
            <div className="absolute inset-0 flex flex-col justify-end rounded-lg bg-gradient-to-t from-primary-dark/90 via-primary-dark/30 to-transparent p-3 opacity-0 transition-opacity duration-300 group-hover/poster:opacity-100 pointer-events-none">
              <p className="text-[12px] font-black text-white line-clamp-2 leading-tight drop-shadow-md uppercase tracking-tight">{meta.name}</p>
              {meta.releaseInfo && <p className="text-[10px] text-accent font-bold mt-0.5">{meta.releaseInfo}</p>}
            </div>
            
            {/* YACA Match Badge */}
            {matchPercent !== undefined && matchPercent !== null && (
              <div className="absolute top-2 left-2 z-20 pointer-events-none">
                <div className="bg-primary/90 text-black text-[10px] font-bold px-2 py-0.5 rounded shadow-lg backdrop-blur-sm">
                  {matchPercent}% Match
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
