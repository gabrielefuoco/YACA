'use client';
import { useState, useMemo } from 'react';
import { Preset, Profile } from '@/types';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { TypeBadge } from '@/components/shared/TypeBadge';
import { PosterRow } from '@/components/shared/PosterRow';
import { Check, ChevronDown, ChevronUp, Search } from 'lucide-react';

interface ExplorePanelProps {
  presets: Preset[];
  categories: string[];
  profile: Profile;
  onTogglePreset: (presetId: string) => void;
}

export function ExplorePanel({ presets, categories, profile, onTogglePreset }: ExplorePanelProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tutti');
  const [expandedPreset, setExpandedPreset] = useState<string | null>(null);
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
              className={`shrink-0 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                selectedCategory === cat
                  ? 'bg-[#8a5aeb] text-white'
                  : 'bg-white/10 text-white/60 hover:bg-white/20 hover:text-white'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-8 w-8 shrink-0"
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
        />
      )}

      {/* Preset grid */}
      <div className="grid gap-3">
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-white/40">
            Nessun catalogo trovato
          </div>
        )}
        {filtered.map((preset) => {
          const isSelected = selectedPresets.includes(preset.id);
          const isExpanded = expandedPreset === preset.id;

          return (
            <Card key={preset.id} className="p-3 hover:border-white/20 transition-colors">
              <div className="flex items-start gap-3">
                <span className="text-2xl shrink-0 mt-0.5">{preset.emoji ?? '📋'}</span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h4 className="text-sm font-medium text-white truncate">{preset.name}</h4>
                    <TypeBadge type={preset.type as 'movie' | 'series' | 'both'} />
                    {preset.category && (
                      <Badge variant="secondary" className="text-[10px] px-1.5 py-0">
                        {preset.category}
                      </Badge>
                    )}
                  </div>
                  {preset.description && (
                    <p className="text-xs text-white/40 mb-2 line-clamp-2">{preset.description}</p>
                  )}

                  {/* Expanded poster row */}
                  {isExpanded && (
                    <PosterRow presetId={preset.id} type={preset.type} />
                  )}
                </div>

                <div className="flex flex-col gap-2 shrink-0">
                  <Button
                    size="sm"
                    variant={isSelected ? 'secondary' : 'default'}
                    onClick={() => onTogglePreset(preset.id)}
                    className="h-7 text-xs"
                  >
                    {isSelected ? (
                      <>
                        <Check className="h-3 w-3 mr-1" />
                        Aggiunto
                      </>
                    ) : (
                      'Aggiungi'
                    )}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setExpandedPreset(isExpanded ? null : preset.id)}
                    className="h-7 text-xs"
                  >
                    {isExpanded ? (
                      <ChevronUp className="h-3 w-3" />
                    ) : (
                      <ChevronDown className="h-3 w-3" />
                    )}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
