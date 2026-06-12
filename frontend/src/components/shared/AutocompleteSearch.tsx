'use client';

import React, { useState, useEffect, useRef } from 'react';
import { Input } from '@/components/ui/input';
import { Loader2, Search } from 'lucide-react';

interface TmdbItem {
    id: number;
    name: string;
}

interface AutocompleteSearchProps {
    placeholder: string;
    searchFn: (query: string) => Promise<{ results: TmdbItem[] }>;
    onSelect: (item: { id: string; name: string }) => void;
}

export function AutocompleteSearch({ placeholder, searchFn, onSelect }: AutocompleteSearchProps) {
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
        onSelect({ id: String(item.id), name: item.name });
        setQuery('');
        setIsOpen(false);
    };

    return (
        <div ref={wrapperRef} className="relative w-full">
            <div className="relative">
                <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-white/50" />
                <Input
                    placeholder={placeholder}
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    className="pl-9"
                />
                {isLoading && (
                    <Loader2 className="absolute right-2.5 top-2.5 h-4 w-4 animate-spin text-white/50" />
                )}
            </div>

            {isOpen && results.length > 0 && (
                <div className="absolute z-50 mt-1 max-h-60 w-full overflow-auto rounded-md border border-marrow-light/10 bg-[#15151a] p-1 shadow-md">
                    {results.map((item) => (
                        <div
                            key={item.id}
                            onClick={() => handleSelect(item)}
                            className="relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none hover:bg-marrow-light/10 hover:text-white data-[disabled]:pointer-events-none data-[disabled]:opacity-50 cursor-pointer"
                        >
                            {item.name}
                        </div>
                    ))}
                </div>
            )}
            {isOpen && !isLoading && query.trim() && results.length === 0 && (
                <div className="absolute z-50 mt-1 w-full rounded-md border border-marrow-light/10 bg-[#15151a] p-2 text-sm text-white/50 text-center shadow-md">
                    Nessun risultato trovato.
                </div>
            )}
        </div>
    );
}
