'use client';
import { useState, useMemo, useRef } from 'react';
import { Preset, Profile, Catalog } from '@/types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { CatalogItem } from '@/components/shared/CatalogItem';
import { Check, Search, ChevronLeft, ChevronRight } from 'lucide-react';
import { isCatalogConformant, getIncompatibilityReason } from '@/lib/catalogKind';

interface ExplorePanelProps {
  presets: Preset[];
  categories: string[];
  profile: Profile;
  customCatalogs?: Catalog[];
  onTogglePreset: (presetId: string) => void;
  onAddCatalog?: (catalog: Catalog) => void;
  onEditCatalog?: (catalog: Catalog) => void;
}

export function ExplorePanel({ presets, categories, profile, customCatalogs = [], onTogglePreset, onAddCatalog, onEditCatalog }: ExplorePanelProps) {
  const [search, setSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('Tutti');
  const [showSearch, setShowSearch] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const selectedPresets = profile.raw_ui_state.selectedPresets;

  const allCategories = ['Tutti', 'Le Mie Creazioni', ...categories];

  const combinedItems = useMemo(() => {
    const list: any[] = [...presets.map(p => ({...p, isCustom: false}))];
    
    customCatalogs.forEach(c => {
      list.push({
        id: c.id,
        name: c.name,
        type: c.type,
        category: 'Le Mie Creazioni',
        emoji: c.emoji || '💖',
        description: c.source === 'custom' ? 'Lista personalizzata' : 'Catalogo Custom',
        filters: c.filters,
        queries: c.queries,
        isCustom: true,
        originalCatalog: c
      });
    });

    return list;
  }, [presets, customCatalogs]);

  const filtered = useMemo(() => {
    let list = combinedItems;
    if (selectedCategory !== 'Tutti') {
      list = list.filter((p) => p.category === selectedCategory);
    }
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter((p) => p.name.toLowerCase().includes(q));
    }
    return list;
  }, [combinedItems, selectedCategory, search]);

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 250;
      scrollRef.current.scrollBy({ left: direction === 'left' ? -scrollAmount : scrollAmount, behavior: 'smooth' });
    }
  };

  return (
    <div className="space-y-4">
      {/* Search toggle */}
      <div className="flex items-center gap-1 sm:gap-2">
        <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 text-marrow-light/70 hover:text-primary hover:bg-marrow-light/10 hidden sm:flex touch-manipulation" onClick={() => scroll('left')}>
          <ChevronLeft className="h-5 w-5" />
        </Button>
        <div ref={scrollRef} className="flex-1 flex items-center gap-2 sm:gap-3 overflow-x-auto pb-2 pt-1 px-1 hide-scrollbar scroll-smooth">
          {allCategories.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`shrink-0 rounded-full inline-flex items-center justify-center min-h-[44px] px-4 sm:px-5 py-3.5 sm:py-3 text-xs sm:text-sm font-bold transition-all shadow-sm touch-manipulation ${selectedCategory === cat
                ? 'bg-primary text-white shadow-xl shadow-primary/40 scale-105 ring-2 ring-primary/20 ring-offset-1'
                : 'bg-white/80 text-marrow-deep hover:text-primary hover:bg-white transition-colors border border-marrow-light/10'
                }`}
            >
              {cat}
            </button>
          ))}
        </div>
        <Button variant="ghost" size="icon" className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 text-marrow-light/70 hover:text-primary hover:bg-marrow-light/10 hidden sm:flex touch-manipulation" onClick={() => scroll('right')}>
          <ChevronRight className="h-5 w-5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-11 w-11 min-h-[44px] min-w-[44px] shrink-0 text-marrow-deep bg-white/60 hover:bg-white hover:text-primary ml-1 sm:ml-2 rounded-xl shadow-sm border border-marrow-light/10 touch-manipulation"
          onClick={() => setShowSearch(!showSearch)}
        >
          <Search className="h-4 w-4 sm:h-5 sm:w-5" />
        </Button>
      </div>

      {showSearch && (
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Cerca cataloghi..."
          autoFocus
          className="bg-white/60 border-marrow-light/20 text-marrow-deep font-black placeholder:text-marrow-light/40 text-base sm:text-sm h-11 min-h-[44px]"
        />
      )}

      {/* Preset grid — always shows posters */}
      <div className="grid gap-4 sm:gap-8">
        {filtered.length === 0 && (
          <div className="py-8 text-center text-sm text-marrow-faded italic">
            Nessun catalogo trovato
          </div>
        )}
        {filtered.map((preset) => {
          const isSelected = preset.isCustom 
            ? profile.existingCatalogs.some(c => c.id === preset.id)
            : selectedPresets.includes(preset.id);

          const targetCatalog = preset.isCustom ? preset.originalCatalog : preset;
          const isConformant = isCatalogConformant(targetCatalog, profile.settings?.typeSelectors);
          const incompatibilityReason = isConformant ? null : getIncompatibilityReason(targetCatalog, profile.settings?.typeSelectors);

          return (
            <CatalogItem
              key={preset.id}
              catalog={preset}
              description={preset.description}
              badges={
                <>
                  {preset.category && (
                    <Badge variant="secondary" className="hidden sm:inline-flex text-xs px-1.5 py-0 shrink-0 bg-primary/10 text-primary hover:bg-primary/20 border-0">
                      {preset.category}
                    </Badge>
                  )}
                  {!isConformant && incompatibilityReason && (
                    <Badge variant="outline" className="text-xs px-1.5 py-0 shrink-0 bg-amber-500/10 text-amber-700 border-amber-500/30 font-bold">
                      {incompatibilityReason}
                    </Badge>
                  )}
                </>
              }
              actions={
                <>
                  <Button
                    size="sm"
                    disabled={!isConformant && !isSelected}
                    title={incompatibilityReason ?? undefined}
                    className={`min-h-[44px] rounded-xl text-xs font-black uppercase tracking-widest transition-all shadow-md max-w-[130px] truncate touch-manipulation ${
                      isSelected 
                        ? 'bg-success/20 text-success hover:bg-success/30 border border-success/20' 
                        : !isConformant
                        ? 'bg-marrow-light/10 text-marrow-light/50 border border-marrow-light/20 cursor-not-allowed shadow-none'
                        : 'bg-primary text-white hover:bg-marrow-deep hover:shadow-lg hover:-translate-y-0.5'
                    }`}
                    onClick={(e) => {
                      e.stopPropagation();
                      if (!isConformant && !isSelected) return;
                      if (preset.isCustom && onAddCatalog) {
                        onAddCatalog(preset.originalCatalog);
                      } else {
                        onTogglePreset(preset.id);
                      }
                    }}
                  >
                    {isSelected ? <><Check className="w-3 h-3 mr-1" /> Aggiunto</> : (!isConformant ? 'Non compatibile' : 'Aggiungi')}
                  </Button>
                  
                  {preset.isCustom && onEditCatalog && (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="min-h-[44px] rounded-xl text-xs font-black uppercase tracking-widest text-primary hover:bg-primary/10 transition-all shadow-sm border border-primary/20 ml-2 touch-manipulation"
                      onClick={(e) => {
                        e.stopPropagation();
                        onEditCatalog(preset.originalCatalog);
                      }}
                    >
                      Modifica
                    </Button>
                  )}
                </>
              }
            />
          );
        })}
      </div>
    </div>
  );
}
