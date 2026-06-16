'use client';
import { useState, useMemo, useRef } from 'react';
import { Preset, Profile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { PosterRow } from '@/components/shared/PosterRow';
import { Check, Search, ChevronLeft, ChevronRight } from 'lucide-react';

interface ExplorePanelProps {
  presets: Preset[];
  categories: string[];
  profile: Profile;
  onTogglePreset: (presetId: string) => void;
}

export function ExplorePanel({ presets, categories, profile, onTogglePreset }: ExplorePanelProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tutti');
  const [showSearch, setShowSearch] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedPresets = profile.raw_ui_state.selectedPresets;

  const filtered = useMemo(() => {
    let list = presets;
    if (selectedCategory !== 'Tutti') {
      list = list.filter((p) => p.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [presets, selectedCategory, search]);

  const allCategories = ['Tutti', ...categories];

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 250;
      scrollRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Search toggle */}
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-marrow-light/70 hover:text-primary hover:bg-marrow-light/10" onClick={() => scroll('left')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div ref={scrollRef} className="flex-1 flex gap-2 overflow-x-auto pb-1 hide-scrollbar scroll-smooth">
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all ${selectedCategory === cat
                ? 'bg-primary text-white shadow-xl shadow-primary/40 scale-105'
                : 'bg-white/40 text-marrow-light hover:text-primary transition-colors border border-marrow-light/10 shadow-sm'
                }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0 text-marrow-light/70 hover:text-primary hover:bg-marrow-light/10" onClick={() => scroll('right')}>
          <ChevronRight className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-marrow-light hover:text-primary ml-1"
          onClick={() => setShowSearch(!showSearch)}
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {showSearch && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca cataloghi..."
          autoFocus
          className="bg-white/60 border-marrow-light/20 text-marrow-deep font-black placeholder:text-marrow-light/40"
        />
      )}

      {/* Preset grid — always shows posters */}
      <div className="grid gap-8">
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-marrow-faded italic">
            Nessun catalogo trovato
          </div>
        )}
        {filtered.map((preset) => {
          const isSelected = selectedPresets.includes(preset.id);
          // calculate rough filter count from the first query object if exists
          const filterCount = preset.queries?.[0] ? Object.keys(preset.queries[0]).length - 1 : 0; 

          return (
            <div key={preset.id} className="group relative flex flex-col glass-card transition-all p-5 shadow-sm border-2 border-marrow-light/10 bg-white/60 hover:bg-white/90 hover:border-primary/30">
              
              <div className="flex items-start justify-between mb-4 relative z-10">
                <div className="flex gap-4 items-center min-w-0">
                  <div className="flex items-center gap-3">
                    <div className="size-12 rounded-2xl flex items-center justify-center transition-all bg-white shadow-inner text-marrow-deep">
                      <span className="text-2xl">{preset.emoji ?? '📋'}</span>
                    </div>
                  </div>
                  <div className="min-w-0">
                    <h3 className="font-black text-marrow-deep text-lg leading-tight truncate group-hover:text-primary transition-colors">{preset.name}</h3>
                    <div className="flex items-center gap-2 mt-1">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-lg bg-primary/5 text-primary text-[10px] font-black uppercase tracking-wider border border-primary/10">
                        <span className="material-symbols-outlined text-[10px] shrink-0">auto_awesome</span> 
                        <span className="truncate">Preset</span>
                      </span>
                      {preset.category && (
                        <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] px-1.5 py-0 shrink-0 bg-primary/10 text-primary hover:bg-primary/20 border-0">
                          {preset.category}
                        </Badge>
                      )}
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-1 shrink-0 ml-4">
                  <Button
                    size="sm"
                    className={`rounded-xl text-[10px] font-black uppercase tracking-widest transition-all shadow-md ${
                      isSelected 
                        ? 'bg-success/20 text-success hover:bg-success/30 border border-success/20' 
                        : 'bg-primary text-white hover:bg-marrow-deep hover:shadow-lg hover:-translate-y-0.5'
                    }`}
                    onClick={() => onTogglePreset(preset.id)}
                  >
                    {isSelected ? <><Check className="w-3 h-3 mr-1" /> Aggiunto</> : 'Aggiungi'}
                  </Button>
                </div>
              </div>

              <p className="text-sm text-marrow-light/80 font-medium line-clamp-1 mb-4 relative z-10 px-1">
                {preset.description || 'Catalogo tematico preconfigurato e costantemente aggiornato.'}
              </p>

              <div className="-mx-2 mb-4 relative z-10 group/row">
                 <div className="absolute inset-0 bg-primary/5 opacity-0 group-hover/poster:opacity-100 transition-opacity rounded-2xl -z-10" />
                 <PosterRow presetId={`yaca_preset_${preset.id}`} type={preset.type} />
              </div>

              <div className="mt-auto pt-4 border-t border-marrow-light/10 flex items-center justify-between relative z-10">
                <div className="flex items-center gap-3">
                   <div className="flex items-center gap-1.5 text-xs font-black text-marrow-deep/70">
                    <span className="material-symbols-outlined text-sm">{preset.type === 'movie' ? 'movie' : 'tv'}</span>
                    <span className="uppercase tracking-tight">{preset.type === 'movie' ? 'Film' : 'Serie'}</span>
                  </div>
                  <div className="w-1 h-1 rounded-full bg-marrow-light/20" />
                  <div className="text-xs font-bold text-marrow-light/60">
                    {Math.max(1, filterCount)} Filtr{Math.max(1, filterCount) !== 1 ? 'i' : 'o'}
                  </div>
                </div>
              </div>

            </div>
          );
        })}
      </div>
    </div>
  );
}
