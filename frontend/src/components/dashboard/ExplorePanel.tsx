'use client';
import { useState, useMemo } from 'react';
import { Preset, Profile } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { PosterRow } from '@/components/shared/PosterRow';
import { Check, Search } from 'lucide-react';

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

  return (
    <div className="space-y-4">
      {/* Search toggle */}
      <div className="flex items-center gap-2">
        <div className="flex-1 flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-medium transition-all ${selectedCategory === cat
                ? 'bg-primary text-white shadow-md shadow-primary/20'
                : 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 hover:text-primary transition-colors border border-slate-200 dark:border-slate-700'
                }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0 text-slate-500 hover:text-primary"
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
          className="bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700"
        />
      )}

      {/* Preset grid — always shows posters */}
      <div className="grid gap-8">
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
            Nessun catalogo trovato
          </div>
        )}
        {filtered.map((preset) => {
          const isSelected = selectedPresets.includes(preset.id);

          return (
            <div key={preset.id} className="w-full min-w-0 p-0 flex flex-col group bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700/50 shadow-sm overflow-hidden">
              <div className="flex flex-col p-4 bg-slate-50 dark:bg-slate-800/40 border-b border-slate-100 dark:border-slate-700/50 relative z-10">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2 min-w-0 flex-1">
                    <span className="text-xl shrink-0 leading-none">{preset.emoji ?? '📋'}</span>
                    <h4 className="flex-1 truncate text-sm font-bold text-slate-900 dark:text-slate-100">{preset.name}</h4>
                    <div className="shrink-0">
                      <TypeBadge type={preset.type as 'movie' | 'series' | 'both'} />
                    </div>
                    {preset.category && (
                      <Badge variant="secondary" className="hidden sm:inline-flex text-[10px] px-1.5 py-0 shrink-0 bg-primary/10 text-primary hover:bg-primary/20 border-0">
                        {preset.category}
                      </Badge>
                    )}
                  </div>

                  <Button
                    size="sm"
                    variant={isSelected ? 'secondary' : 'default'}
                    onClick={() => onTogglePreset(preset.id)}
                    className={`h-8 px-3 text-xs shrink-0 ml-auto font-bold ${isSelected ? 'bg-emerald-500/10 text-emerald-600 hover:bg-emerald-500/20' : 'bg-primary text-white hover:brightness-110'
                      }`}
                  >
                    {isSelected ? (
                      <>
                        <Check className="h-3.5 w-3.5 mr-1" />
                        Aggiunto
                      </>
                    ) : (
                      'Aggiungi'
                    )}
                  </Button>
                </div>
                {preset.description && (
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-2 line-clamp-2">{preset.description}</p>
                )}
              </div>

              {/* Always-visible poster row */}
              <div className="w-full min-w-0 overflow-hidden bg-white dark:bg-slate-800 p-2">
                <PosterRow presetId={preset.id} type={preset.type} />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
