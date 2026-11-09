'use client';
import { useState, useMemo, useRef } from 'react';
import { CatalogoEsploraVoce, CataloghiEsploraResponse, ModoId, Preset } from '@/types';
import { CatalogItem } from '@/components/shared/CatalogItem';
import { catalogoVoceToCard } from '@/lib/catalogPresentation';
import { Search, Loader2, ChevronLeft, ChevronRight, Info } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { usePresets } from '@/hooks/usePresets';

export const ESPLORA_CATEGORIES = [
  '🔥 Top & Trend',
  "🎬 Cinema d'Autore & Registi",
  '👨‍👩‍👧‍👦 Bambini & Famiglia',
  '🐉 Fantascienza & Fantasy',
  '👻 Brivido & Paura',
  '🌏 K-Drama, Dizi & Asia',
  '🕵️ Crimine, Mistero & Thriller',
  '🍿 Serata Leggera & Risate',
  '💥 Adrenalina & Avventura',
  '🌍 Documentari & Storie Vere',
  '🔥 Altri Cataloghi',
  '📺 Network & Piattaforme',
] as const;

/**
 * Mappa estendibile per la suddivisione dei cataloghi anime in base a `media`.
 * Correzione 12: split in un unico punto senza if-chain, con supporto per future categorie anime.
 */
export const ANIME_MEDIA_CATEGORY_MAP: Record<string, { id: string; label: string }> = {
  movie: { id: 'film_anime', label: 'Film anime' },
  series: { id: 'serie_anime', label: 'Serie anime' },
};

export const DEFAULT_ANIME_CATEGORY: { id: string; label: string } = {
  id: 'film_anime',
  label: 'Film anime',
};

export function resolveAnimeCategory(media?: 'movie' | 'series' | null): { id: string; label: string } {
  if (media && ANIME_MEDIA_CATEGORY_MAP[media]) {
    return ANIME_MEDIA_CATEGORY_MAP[media];
  }
  // Se media è null o non determinabile, il catalogo finisce in Film anime
  return DEFAULT_ANIME_CATEGORY;
}

function cleanCategory(str?: string): string {
  if (!str) return '';
  return str.replace(/[\u200B-\u200D\uFEFF]/g, '').trim();
}

interface ExplorePill {
  id: string;
  label: string;
  items: CatalogoEsploraVoce[];
}

interface ExplorePanelProps {
  data: CataloghiEsploraResponse | null;
  loading?: boolean;
  activeModo?: ModoId;
  presets?: Preset[];
  onToggleActive?: (id: string, attivo: boolean) => Promise<any> | void;
  onEditCatalog?: (catalog: any) => void;
  onConfigChanged?: (configVersion: string) => void;
}

export function ExplorePanel({
  data,
  loading = false,
  presets: propsPresets,
  onToggleActive,
  onEditCatalog,
}: ExplorePanelProps) {
  const { presets: hookPresets } = usePresets();
  const presets = propsPresets && propsPresets.length > 0 ? propsPresets : hookPresets;

  const [selectedPillId, setSelectedPillId] = useState<string>('raccomandazioni');
  const [search, setSearch] = useState('');
  const [showSearch, setShowSearch] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // Mappa di preset per risolvere la categoria per ID (supporta con e senza prefisso yaca_preset_)
  const presetCategoryMap = useMemo(() => {
    const map = new Map<string, string>();
    presets.forEach((p) => {
      if (p.id && p.category) {
        map.set(p.id, p.category);
        const cleanId = p.id.replace(/^yaca_preset_/, '');
        map.set(cleanId, p.category);
        map.set(`yaca_preset_${cleanId}`, p.category);
      }
    });
    return map;
  }, [presets]);

  const getCategoryForCatalog = (id: string): string | undefined => {
    return presetCategoryMap.get(id);
  };

  // Costruzione dinamica delle pillole di Esplora:
  // Raccomandazioni · Le mie creazioni · Tutti · <le 13 categorie>
  // I gruppi assenti dalla risposta API non generano la pillola (niente pillole vuote)
  const availablePills = useMemo<ExplorePill[]>(() => {
    const pills: ExplorePill[] = [];

    // 1. Raccomandazioni (suggerimenti del grafo + watchlist per la modalità attiva)
    const suggerimenti = data?.gruppi?.suggerimenti || [];
    const watchlist = data?.gruppi?.watchlist || [];
    const raccomandazioni = [...suggerimenti, ...watchlist];
    if (raccomandazioni.length > 0) {
      pills.push({ id: 'raccomandazioni', label: 'Raccomandazioni', items: raccomandazioni });
    }

    // 2. Le mie creazioni (gruppo creazioni servibili nel modo)
    const creazioni = data?.gruppi?.creazioni || [];
    if (creazioni.length > 0) {
      pills.push({ id: 'creazioni', label: 'Le mie creazioni', items: creazioni });
    }

    // 3. Tutti (tutto il resto nella modalità corrente)
    const tutti = data?.gruppi?.tutti || [];
    if (tutti.length > 0) {
      pills.push({ id: 'tutti', label: 'Tutti', items: tutti });

      // Separazione Anime (correzione 12: split in Film anime e Serie anime tramite mapping)
      const animeItems = tutti.filter((item) => {
        const cat = getCategoryForCatalog(item.id);
        return item.tipo === 'anime' || (cat && cleanCategory(cat) === cleanCategory('🏮 Solo Anime'));
      });

      const animeGroups: Record<string, CatalogoEsploraVoce[]> = {
        film_anime: [],
        serie_anime: [],
      };
      animeItems.forEach((item) => {
        const resolved = resolveAnimeCategory(item.media);
        if (!animeGroups[resolved.id]) {
          animeGroups[resolved.id] = [];
        }
        animeGroups[resolved.id].push(item);
      });

      // 4..16: Categorie dei preset presenti in 'tutti'
      for (const cat of ESPLORA_CATEGORIES) {
        const cleanCat = cleanCategory(cat);
        const matching = tutti.filter((item) => {
          if (item.tipo === 'anime') return false;
          const itemCat = getCategoryForCatalog(item.id);
          return itemCat && cleanCategory(itemCat) === cleanCat;
        });
        if (matching.length > 0) {
          pills.push({ id: cat, label: cat, items: matching });
        }

        // Posiziona i due pill anime (Film anime e Serie anime) subito dopo '🔥 Top & Trend'
        if (cleanCat === cleanCategory('🔥 Top & Trend')) {
          if (animeGroups.film_anime.length > 0) {
            pills.push({ id: 'film_anime', label: 'Film anime', items: animeGroups.film_anime });
          }
          if (animeGroups.serie_anime.length > 0) {
            pills.push({ id: 'serie_anime', label: 'Serie anime', items: animeGroups.serie_anime });
          }
        }
      }

      // Se '🔥 Top & Trend' non era presente in tutti (es. modalità Anime), aggiungi i gruppi anime
      const animeAlreadyAdded = pills.some((p) => p.id === 'film_anime' || p.id === 'serie_anime');
      if (!animeAlreadyAdded) {
        if (animeGroups.film_anime.length > 0) {
          pills.push({ id: 'film_anime', label: 'Film anime', items: animeGroups.film_anime });
        }
        if (animeGroups.serie_anime.length > 0) {
          pills.push({ id: 'serie_anime', label: 'Serie anime', items: animeGroups.serie_anime });
        }
      }
    }

    return pills;
  }, [data, presetCategoryMap]);

  // Pillola attiva con fallback se la precedente non esiste più (es. cambio modalità)
  const activePill = useMemo(() => {
    if (availablePills.length === 0) return null;
    const found = availablePills.find((p) => p.id === selectedPillId);
    return found || availablePills[0];
  }, [availablePills, selectedPillId]);

  // Elementi filtrati dalla ricerca interna alla pillola selezionata
  const filteredItems = useMemo(() => {
    if (!activePill) return [];
    if (!search.trim()) return activePill.items;
    const q = search.toLowerCase();
    return activePill.items.filter((item) => item.nome.toLowerCase().includes(q));
  }, [activePill, search]);

  const handleToggle = async (id: string, attivo: boolean) => {
    if (!onToggleActive || togglingId === id) return;
    setTogglingId(id);
    try {
      await onToggleActive(id, attivo);
    } catch (err) {
      console.error('[ExplorePanel] Errore attivazione catalogo:', err);
    } finally {
      setTogglingId(null);
    }
  };

  const scroll = (direction: 'left' | 'right') => {
    if (scrollRef.current) {
      const scrollAmount = 250;
      scrollRef.current.scrollBy({
        left: direction === 'left' ? -scrollAmount : scrollAmount,
        behavior: 'smooth',
      });
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6 min-w-0">
      {/* Intestazione Esplora */}
      <div className="flex flex-col gap-1">
        <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">Esplora Cataloghi</h2>
        <p className="text-xs sm:text-sm text-marrow-light font-medium">
          Tutti i cataloghi disponibili per questa modalità. Accendili per renderli visibili nella tua configurazione.
        </p>
      </div>

      {/* Pill row (Terzo livello di navigazione): frecce, scroll orizzontale e toggle ricerca */}
      <div className="flex items-center gap-1 sm:gap-2">
        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 min-h-[40px] min-w-[40px] shrink-0 text-marrow-light/70 hover:text-primary hover:bg-marrow-light/10 hidden sm:flex touch-manipulation rounded-full"
          onClick={() => scroll('left')}
          aria-label="Scorri a sinistra"
        >
          <ChevronLeft className="h-5 w-5" />
        </Button>

        {/* Contenitore orizzontale SENZA ombra perimetrale */}
        <div
          ref={scrollRef}
          className="flex-1 flex items-center gap-1.5 sm:gap-2 overflow-x-auto py-1.5 px-0.5 no-scrollbar scroll-smooth"
        >
          {availablePills.map((pill) => {
            const isSelected = activePill?.id === pill.id;
            return (
              <button
                key={pill.id}
                type="button"
                onClick={() => setSelectedPillId(pill.id)}
                className={`shrink-0 rounded-full inline-flex items-center justify-center min-h-[40px] px-4 sm:px-5 py-2 text-xs sm:text-sm transition-all touch-manipulation whitespace-nowrap ${
                  isSelected
                    ? 'bg-primary text-white shadow-lg shadow-primary/30 font-black'
                    : 'bg-white/60 text-marrow-deep hover:text-primary hover:bg-white transition-colors border border-marrow-light/10 font-bold'
                }`}
              >
                <span>{pill.label}</span>
                <span className={`ml-1.5 text-xs ${isSelected ? 'text-white/80' : 'text-marrow-light/60 font-normal'}`}>
                  ({pill.items.length})
                </span>
              </button>
            );
          })}
        </div>

        <Button
          variant="ghost"
          size="icon"
          className="h-10 w-10 min-h-[40px] min-w-[40px] shrink-0 text-marrow-light/70 hover:text-primary hover:bg-marrow-light/10 hidden sm:flex touch-manipulation rounded-full"
          onClick={() => scroll('right')}
          aria-label="Scorri a destra"
        >
          <ChevronRight className="h-5 w-5" />
        </Button>

        <Button
          variant="ghost"
          size="icon"
          className={`h-10 w-10 min-h-[40px] min-w-[40px] shrink-0 rounded-full transition-colors touch-manipulation border ${
            showSearch || search
              ? 'bg-primary text-white border-primary shadow-sm'
              : 'text-marrow-deep bg-white/60 hover:bg-white hover:text-primary border-marrow-light/10'
          }`}
          onClick={() => {
            setShowSearch((prev) => !prev);
            if (showSearch) setSearch('');
          }}
          aria-label="Cerca cataloghi"
        >
          <Search className="h-4 w-4" />
        </Button>
      </div>

      {/* Campo di ricerca (visibile solo su toggle) */}
      {showSearch && (
        <div className="pt-0.5">
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={`Cerca in ${activePill?.label || 'questo gruppo'}...`}
            autoFocus
            className="bg-white/60 border-marrow-light/20 text-marrow-deep font-medium placeholder:text-marrow-light/40 text-sm h-11 rounded-xl"
          />
        </div>
      )}

      {/* Elenco dei cataloghi — stesso widget CatalogItem con switch di attivazione */}
      {loading ? (
        <div className="flex items-center justify-center p-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="py-12 text-center rounded-2xl border border-marrow-light/10 bg-white/20">
          <p className="text-sm text-marrow-light font-bold">
            {search ? 'Nessun catalogo corrisponde alla ricerca.' : 'Nessun catalogo disponibile per questo gruppo nella modalità corrente.'}
          </p>
        </div>
      ) : (
        <div className="flex flex-col gap-3 sm:gap-4 w-full">
          {filteredItems.map((item) => {
            const cardData = catalogoVoceToCard(item);
            return (
              <CatalogItem
                key={item.id}
                catalog={cardData}
                onToggleActive={onToggleActive ? (attivo) => handleToggle(item.id, attivo) : undefined}
                onEdit={item.fonte === 'creazione' && onEditCatalog ? () => onEditCatalog(item) : undefined}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
