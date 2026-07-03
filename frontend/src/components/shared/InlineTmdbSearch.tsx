'use client';
import { useState, useEffect } from 'react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';
import { api } from '@/lib/api';

interface InlineTmdbSearchProps {
  onSelect: (item: any) => void;
  existingItems: any[];
  type: 'movie' | 'series';
}

export function InlineTmdbSearch({ onSelect, existingItems, type }: InlineTmdbSearchProps) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (!query.trim()) {
      setResults([]);
      return;
    }
    const fetchResults = async () => {
      setIsLoading(true);
      try {
        // use an existing route if searchTmdbMulti is not available. Wait, searchTmdbMulti is not in api.ts? I'll check.
        const res = await fetch(`/api/tmdb/search/multi?query=${encodeURIComponent(query)}`).then(r => r.json());
        const formatted = (res.results || []).map((r: any) => ({
          id: String(r.id),
          name: r.title || r.name,
          poster: r.poster_path ? `https://image.tmdb.org/t/p/w92${r.poster_path}` : null,
          media_type: r.media_type || type
        }));
        setResults(formatted);
      } catch (e) {
        console.error(e);
      } finally {
        setIsLoading(false);
      }
    };
    const timeoutId = setTimeout(fetchResults, 400);
    return () => clearTimeout(timeoutId);
  }, [query, type]);

  return (
    <div className="space-y-3">
      <div className="relative">
        <Input
          placeholder="Cerca film o serie TV su TMDB..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="bg-white/60 border-marrow-light/10 text-marrow-deep font-black placeholder:text-marrow-light/40"
        />
        {isLoading && <Loader2 className="absolute right-3 top-3 h-4 w-4 animate-spin text-marrow-light/50" />}
      </div>
      
      {results.length > 0 && (
        <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
          {results.map((item) => {
            const isAdded = existingItems.some(i => String(i.tmdbId || i.id) === String(item.id) || String(i._id) === `tmdb:${item.id}` || String(i._id) === `tmdb:${item.media_type}:${item.id}`);
            return (
              <div key={item.id} className="min-w-[100px] w-[100px] flex-shrink-0 flex flex-col gap-1 relative group">
                {item.poster ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={item.poster} alt={item.name} className="w-full aspect-[2/3] object-cover rounded-md shadow-sm" />
                ) : (
                  <div className="w-full aspect-[2/3] bg-marrow-light/10 flex items-center justify-center text-center p-2 rounded-md">
                    <span className="text-[10px] font-bold text-marrow-deep/50">{item.name}</span>
                  </div>
                )}
                
                <div className="absolute inset-0 bg-black/60 opacity-0 group-hover:opacity-100 transition-opacity rounded-md flex items-center justify-center">
                  <Button
                    size="sm"
                    variant={isAdded ? "secondary" : "default"}
                    className="h-8 text-[10px] font-bold"
                    onClick={() => !isAdded && onSelect(item)}
                    disabled={isAdded}
                  >
                    {isAdded ? 'Aggiunto' : '+ Aggiungi'}
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
