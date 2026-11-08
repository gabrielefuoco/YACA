'use client';
import { useState, useEffect, useMemo, useCallback } from 'react';
import { api } from '@/lib/api';
import { CatalogoEsploraVoce, CataloghiEsploraResponse, ModoId } from '@/types';
import { CatalogItem } from '@/components/shared/CatalogItem';
import { Search, Loader2, Sparkles, Film, Tv } from 'lucide-react';
import { Input } from '@/components/ui/input';

interface ExplorePanelProps {
  activeModo?: ModoId;
  onEditCatalog?: (catalog: any) => void;
  onConfigChanged?: (configVersion: string) => void;
}

const ORDINE_TIPI = ['film', 'serie', 'anime', 'bambini'] as const;
const NOMI_TIPI: Record<string, { label: string; icon: string }> = {
  film: { label: 'Film', icon: '🎬' },
  serie: { label: 'Serie TV', icon: '📺' },
  anime: { label: 'Anime', icon: '🏮' },
  bambini: { label: 'Bambini & Famiglia', icon: '🧸' },
};

export function ExplorePanel({ activeModo, onEditCatalog, onConfigChanged }: ExplorePanelProps) {
  const [data, setData] = useState<CataloghiEsploraResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filtroTipo, setFiltroTipo] = useState<string>('tutti');
  const [togglingId, setTogglingId] = useState<string | null>(null);

  const fetchCataloghi = useCallback(async () => {
    try {
      setLoading(true);
      const res = await api.getCataloghi();
      setData(res);
    } catch (err) {
      console.error('[ExplorePanel] Errore caricamento cataloghi:', err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCataloghi();
  }, [fetchCataloghi, activeModo]);

  const handleToggle = async (id: string, attivo: boolean) => {
    if (togglingId === id) return;
    setTogglingId(id);

    // Aggiornamento ottimistico dello stato locale
    setData(prev => {
      if (!prev) return prev;
      const aggiornaLista = (lista?: CatalogoEsploraVoce[]) =>
        lista ? lista.map(item => item.id === id ? { ...item, attivo } : item) : undefined;
      return {
        ...prev,
        gruppi: {
          suggerimenti: aggiornaLista(prev.gruppi.suggerimenti),
          watchlist: aggiornaLista(prev.gruppi.watchlist),
          creazioni: aggiornaLista(prev.gruppi.creazioni),
          tutti: aggiornaLista(prev.gruppi.tutti),
        }
      };
    });

    try {
      const res = await api.attivaCatalogo(id, attivo);
      if (res?.configVersion && onConfigChanged) {
        onConfigChanged(res.configVersion);
      }
    } catch (err) {
      console.error('[ExplorePanel] Errore attivazione catalogo:', err);
      // Revert in caso di errore
      fetchCataloghi();
    } finally {
      setTogglingId(null);
    }
  };

  const filtraVoci = (voci?: CatalogoEsploraVoce[]) => {
    if (!voci) return [];
    let filtrati = voci;
    if (search.trim()) {
      const q = search.toLowerCase();
      filtrati = filtrati.filter(v => v.nome.toLowerCase().includes(q));
    }
    if (filtroTipo !== 'tutti') {
      filtrati = filtrati.filter(v => v.tipo === filtroTipo);
    }
    return filtrati;
  };

  // Gruppo 1: Suggerimenti di visione & Watchlist
  const vociSuggerimenti = data?.gruppi?.suggerimenti;
  const vociWatchlist = data?.gruppi?.watchlist;
  const gruppo1Tutti = useMemo(() => {
    const list: CatalogoEsploraVoce[] = [];
    if (vociSuggerimenti && vociSuggerimenti.length > 0) list.push(...vociSuggerimenti);
    if (vociWatchlist && vociWatchlist.length > 0) list.push(...vociWatchlist);
    return list;
  }, [vociSuggerimenti, vociWatchlist]);
  const gruppo1Filtrato = useMemo(() => filtraVoci(gruppo1Tutti), [gruppo1Tutti, search, filtroTipo]);

  // Gruppo 2: Le mie creazioni
  const vociCreazioni = data?.gruppi?.creazioni;
  const gruppo2Tutti = useMemo(() => vociCreazioni || [], [vociCreazioni]);
  const gruppo2Filtrato = useMemo(() => filtraVoci(gruppo2Tutti), [gruppo2Tutti, search, filtroTipo]);

  // Gruppo 3: Tutti (raggruppato per tipo)
  const vociTutti = data?.gruppi?.tutti;
  const gruppo3FiltratoPerTipo = useMemo(() => {
    if (!vociTutti || vociTutti.length === 0) return null;
    const filtrati = filtraVoci(vociTutti);
    if (filtrati.length === 0) return null;

    const mappa: Record<string, CatalogoEsploraVoce[]> = {};
    for (const tipo of ORDINE_TIPI) {
      const perTipo = filtrati.filter(v => v.tipo === tipo);
      if (perTipo.length > 0) {
        mappa[tipo] = perTipo;
      }
    }
    return mappa;
  }, [vociTutti, search, filtroTipo]);

  const renderVoce = (voce: CatalogoEsploraVoce) => {
    const cardData = {
      id: voce.id,
      name: voce.nome,
      type: (voce.tipo === 'serie' ? 'series' : 'movie') as 'movie' | 'series',
      tipo: voce.tipo,
      fonte: voce.fonte,
      attivo: voce.attivo,
      ordine: voce.ordine,
      emoji: voce.emoji,
      description: voce.description,
      isAnime: voce.tipo === 'anime',
    };

    return (
      <CatalogItem
        key={voce.id}
        catalog={cardData}
        onToggleActive={(attivo) => handleToggle(voce.id, attivo)}
        onEdit={voce.fonte === 'creazione' && onEditCatalog ? () => onEditCatalog(voce) : undefined}
      />
    );
  };

  return (
    <div className="space-y-6 sm:space-y-8">
      {/* Header e Ricerca */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl sm:text-3xl font-black text-marrow-deep tracking-tight">Esplora Cataloghi</h1>
          <p className="text-xs sm:text-sm text-marrow-light font-medium mt-0.5">
            L&apos;unico luogo dove attivare e scoprire i cataloghi disponibili per la modalità corrente
          </p>
        </div>

        {/* Barra di ricerca */}
        <div className="w-full sm:w-72 relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-marrow-light/60" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Cerca per nome..."
            className="pl-9 bg-white/60 border border-marrow-light/10 text-marrow-deep font-bold placeholder:text-marrow-light/40 h-10 rounded-xl"
          />
        </div>
      </div>

      {/* Selettore a pillola per tipo — Ticket 09: nessun contenitore rigido con ombra */}
      <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 hide-scrollbar">
        <button
          onClick={() => setFiltroTipo('tutti')}
          className={`shrink-0 rounded-full inline-flex items-center justify-center min-h-[38px] px-4 text-xs font-bold transition-all touch-manipulation ${
            filtroTipo === 'tutti'
              ? 'bg-primary text-white shadow-md shadow-primary/30 font-black'
              : 'text-marrow-deep hover:text-primary hover:bg-white/60 bg-white/30'
          }`}
        >
          Tutti i tipi
        </button>
        {ORDINE_TIPI.map((t) => {
          const info = NOMI_TIPI[t];
          return (
            <button
              key={t}
              onClick={() => setFiltroTipo(t)}
              className={`shrink-0 rounded-full inline-flex items-center gap-1.5 justify-center min-h-[38px] px-4 text-xs font-bold transition-all touch-manipulation ${
                filtroTipo === t
                  ? 'bg-primary text-white shadow-md shadow-primary/30 font-black'
                  : 'text-marrow-deep hover:text-primary hover:bg-white/60 bg-white/30'
              }`}
            >
              <span>{info.icon}</span>
              <span>{info.label}</span>
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="flex items-center justify-center p-16">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
        </div>
      ) : (
        <div className="space-y-8 sm:space-y-12">
          {/* GRUPPO 1: Suggerimenti di visione & Watchlist — omesso se vuoto */}
          {gruppo1Filtrato.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 bg-primary rounded-full shrink-0" />
                <h2 className="text-lg sm:text-xl font-black text-marrow-deep tracking-tight">
                  Suggerimenti di visione & Watchlist
                </h2>
                <span className="text-xs font-bold text-marrow-light ml-1">({gruppo1Filtrato.length})</span>
              </div>
              <div className="flex flex-col gap-3 sm:gap-4 w-full">
                {gruppo1Filtrato.map(renderVoce)}
              </div>
            </section>
          )}

          {/* GRUPPO 2: Le mie creazioni — omesso se vuoto */}
          {gruppo2Filtrato.length > 0 && (
            <section className="space-y-4">
              <div className="flex items-center gap-2">
                <div className="w-1.5 h-6 bg-accent rounded-full shrink-0" />
                <h2 className="text-lg sm:text-xl font-black text-marrow-deep tracking-tight">
                  Le mie creazioni
                </h2>
                <span className="text-xs font-bold text-marrow-light ml-1">({gruppo2Filtrato.length})</span>
              </div>
              <div className="flex flex-col gap-3 sm:gap-4 w-full">
                {gruppo2Filtrato.map(renderVoce)}
              </div>
            </section>
          )}

          {/* GRUPPO 3: Tutti — raggruppato per tipo, omesso se vuoto */}
          {gruppo3FiltratoPerTipo && Object.keys(gruppo3FiltratoPerTipo).length > 0 && (
            <section className="space-y-6">
              <div className="flex items-center gap-2 border-b border-marrow-light/10 pb-2">
                <div className="w-1.5 h-6 bg-marrow-deep rounded-full shrink-0" />
                <h2 className="text-lg sm:text-xl font-black text-marrow-deep tracking-tight">
                  Tutti i cataloghi
                </h2>
              </div>

              {ORDINE_TIPI.map((tipo) => {
                const voci = gruppo3FiltratoPerTipo[tipo];
                if (!voci || voci.length === 0) return null;
                const info = NOMI_TIPI[tipo];
                return (
                  <div key={tipo} className="space-y-3">
                    <h3 className="text-sm font-black uppercase tracking-wider text-marrow-light flex items-center gap-1.5">
                      <span>{info.icon}</span>
                      <span>{info.label}</span>
                      <span className="text-marrow-light/50 font-medium">({voci.length})</span>
                    </h3>
                    <div className="flex flex-col gap-3 sm:gap-4 w-full">
                      {voci.map(renderVoce)}
                    </div>
                  </div>
                );
              })}
            </section>
          )}

          {/* Fallback se non ci sono risultati con la ricerca */}
          {gruppo1Filtrato.length === 0 && gruppo2Filtrato.length === 0 && (!gruppo3FiltratoPerTipo || Object.keys(gruppo3FiltratoPerTipo).length === 0) && (
            <div className="p-12 text-center rounded-2xl border border-marrow-light/10 bg-white/20">
              <p className="text-sm text-marrow-light font-bold">Nessun catalogo trovato per la modalità corrente.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
