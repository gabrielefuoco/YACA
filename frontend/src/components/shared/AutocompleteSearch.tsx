'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { PosterCard } from '@/components/shared/PosterCard';

interface TmdbItem {
    id: number | string;
    name: string;
    poster?: string | null;
    media_type?: string;
    [key: string]: any;
}

interface AutocompleteSearchProps {
    placeholder: string;
    searchFn: (query: string) => Promise<{ results: TmdbItem[] }>;
    onSelect: (item: any) => void;
    className?: string;
    layout?: 'vertical' | 'horizontal';
    existingItems?: any[];
}

export function AutocompleteSearch({ 
    placeholder, 
    searchFn, 
    onSelect, 
    className, 
    layout = 'vertical',
    existingItems = []
}: AutocompleteSearchProps) {
    const [query, setQuery] = useState('');
    const [results, setResults] = useState<TmdbItem[]>([]);
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(false);
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target as Node)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    useEffect(() => {
        const fetchResults = async () => {
            if (!query.trim()) {
                setResults([]);
                setIsOpen(false);
                return;
            }

            setIsLoading(true);
            try {
                const data = await searchFn(query);
                setResults(data.results || []);
                setIsOpen(true);
            } catch (e) {
                console.error('Testo autocompletamento fallito', e);
            } finally {
                setIsLoading(false);
            }
        };

        const timeoutId = setTimeout(fetchResults, 400); // 400ms debounce
        return () => clearTimeout(timeoutId);
    }, [query, searchFn]);

    const handleSelect = (item: TmdbItem) => {
        onSelect(item);
        if (layout === 'vertical') {
            setQuery('');
            setIsOpen(false);
        }
    };

    if (layout === 'horizontal') {
        return (
            <div className="space-y-3">
              <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-marrow-light/50" />
                <Input
                  placeholder={placeholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={cn("bg-white/60 border-marrow-light/10 pl-9 text-marrow-deep font-black placeholder:text-marrow-light/40 text-base sm:text-sm h-11 min-h-[44px]", className)}
                />
                {isLoading && <Loader2 className="absolute right-3 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-marrow-light/50" />}
              </div>
              
              {results.length > 0 && (
                <div className="flex gap-2 overflow-x-auto pb-2 custom-scrollbar">
                  {results.map((item) => {
                    const isAdded = existingItems.some(i => String(i.tmdbId || i.id) === String(item.id) || String(i._id) === `tmdb:${item.id}` || String(i._id) === `tmdb:${item.media_type}:${item.id}`);
                    return (
                      <PosterCard
                        key={item.id}
                        poster={item.poster}
                        title={item.name}
                        size="sm"
                        showTitleOverlay={false}
                        overlay={
                          <div className="absolute inset-0 bg-black/60 opacity-0 group-hover/poster:opacity-100 pointer-coarse:opacity-100 transition-opacity flex items-center justify-center p-2">
                            <Button
                              size="sm"
                              variant={isAdded ? "secondary" : "default"}
                              className="h-11 min-h-[44px] px-3 text-xs font-bold touch-manipulation"
                              onClick={() => !isAdded && handleSelect(item)}
                              disabled={isAdded}
                            >
                              {isAdded ? 'Aggiunto' : '+ Aggiungi'}
                            </Button>
                          </div>
                        }
                      />
                    );
                  })}
                </div>
              )}
            </div>
        );
    }

    // Vertical layout (default)
    return (
        <div ref={wrapperRef} className="relative w-full">
            <div className="relative">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-marrow-light/50" />
                <Input
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={cn("pl-9 text-base sm:text-sm h-11 min-h-[44px]", className)}
                />
                {isLoading && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 h-4 w-4 animate-spin text-marrow-light/50" />
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-marrow-light/10 bg-background-light p-1 shadow-xl">
                    {results.map((item) => (
                        <div
                            key={item.id}
                            role="button"
                            tabIndex={0}
                            onClick={() => handleSelect(item)}
                            onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); handleSelect(item); } }}
                            className="relative flex cursor-pointer select-none items-center rounded-sm px-3 py-2.5 min-h-[44px] text-sm outline-none hover:bg-primary/10 hover:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 touch-manipulation"
                        >
                            {item.name}
                        </div>
                    ))}
                </div>
            )}
            {isOpen && !isLoading && query.trim() && results.length === 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-marrow-light/10 bg-background-light p-2 text-sm text-marrow-light/50 text-center shadow-xl">
                    Nessun risultato trovato.
                </div>
            )}
        </div>
    );
}
