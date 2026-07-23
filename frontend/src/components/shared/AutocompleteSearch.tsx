'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';

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
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-marrow-light/50" />
                <Input
                  placeholder={placeholder}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  className={cn("bg-white/60 border-marrow-light/10 pl-9 text-marrow-deep font-black placeholder:text-marrow-light/40", className)}
                />
                {isLoading && <Loader2 className="absolute right-3 top-2.5 h-4 w-4 animate-spin text-marrow-light/50" />}
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
                            onClick={() => !isAdded && handleSelect(item)}
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

    // Vertical layout (default)
    return (
        <div ref={wrapperRef} className="relative w-full">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-marrow-light/50" />
                <Input
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className={cn("pl-9", className)}
                />
                {isLoading && (
                    <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-marrow-light/50" />
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-marrow-light/10 bg-background-light p-1 shadow-xl">
                    {results.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => handleSelect(item)}
                            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-primary/10 hover:text-primary data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer"
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
