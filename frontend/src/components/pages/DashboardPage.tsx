'use client';
import { useState, useEffect, useRef, useCallback } from 'react';
import { Profile, Catalog, MyList, ModoInfo, ModoId, CatalogoEsploraVoce, CataloghiEsploraResponse } from '@/types';
import { api } from '@/lib/api';
import { CreatorPanel } from '@/components/dashboard/CreatorPanel';
import { DnaAndAiPanel } from '@/components/dashboard/DnaAndAiPanel';
import { UserLibraryPanel } from '@/components/dashboard/UserLibraryPanel';
import { ActiveCatalogsPanel } from '@/components/dashboard/ActiveCatalogsPanel';
import { CatalogLivePreview } from '@/components/dashboard/CatalogLivePreview';
import { PosterRow } from '@/components/shared/PosterRow';
import { Slider } from '@/components/ui/slider';
import { Button } from '@/components/ui/button';
import { Film, Tv, Compass, Info, Check, Sparkles, Layers, Sliders } from 'lucide-react';

interface DashboardPageProps {
  profiles: Profile[];
  editingProfileId: string;
  activeProfileId: string;
  presets?: any[];
  categories?: string[];
  profileTemplates?: any[];
  myLists?: MyList[];
  customCatalogs?: Catalog[];
  onSelectEditing?: (id: string) => void;
  onSetActive?: (id: string) => void;
  onAddProfile?: (name: string) => Profile;
  onRemoveProfile?: (id: string) => void;
  onTogglePreset?: (profileId: string, presetId: string) => void;
  onReorderCatalogs?: (profileId: string, catalogs: Catalog[]) => void;
  onRemoveCatalog?: (profileId: string, catalogId: string) => void;
  onAddCatalog: (profileId: string, catalog: Catalog) => void;
  onUpdateCatalog: (profileId: string, catalog: Catalog) => void;
  onSaveMyList?: (list: MyList) => void;
  onRemoveMyList?: (id: string) => void;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
  onTemplateApplied?: (profileId: string, selectedPresets: string[], template?: any) => Promise<void> | void;
  syncStatus: any;
  userId?: string;
  onGoToExplore?: () => void;
  onConfigChanged?: (configVersion: string) => void;
}

const DEFAULT_MODI: { modo: ModoId; nome: string; emoji: string }[] = [
  { modo: 'generale', nome: 'Generale', emoji: '🏠' },
  { modo: 'film', nome: 'Film', emoji: '🎬' },
  { modo: 'serie', nome: 'Serie TV', emoji: '📺' },
  { modo: 'anime', nome: 'Anime', emoji: '🏮' },
  { modo: 'bambini', nome: 'Bambini', emoji: '🧸' },
];

export function DashboardPage({
  profiles,
  editingProfileId,
  activeProfileId,
  customCatalogs,
  onAddCatalog,
  onUpdateCatalog,
  onSaveMyList,
  onUpdateProfile,
  syncStatus,
  userId,
  onGoToExplore,
  onConfigChanged,
}: DashboardPageProps) {
  // Modalità
  const [modi, setModi] = useState<ModoInfo[]>([]);
  const [activeModo, setActiveModo] = useState<ModoId>('generale');
  const [isSwitchingModo, setIsSwitchingModo] = useState(false);
  const [propagationMessage, setPropagationMessage] = useState<string | null>(null);

  // Cataloghi per la modalità attiva (da GET /api/profilo/cataloghi)
  const [cataloghiData, setCataloghiData] = useState<CataloghiEsploraResponse | null>(null);

  // Cursori (Tonalità e Notorietà) — unici per account
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const initialSliders = activeProfile?.settings?.sliders || activeProfile?.sliders || { cozy: 0, canone: 0 };
  const [cozy, setCozy] = useState<number>(initialSliders.cozy ?? 0);
  const [canone, setCanone] = useState<number>(initialSliders.canone ?? 0);
  const sliderTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Caricamento modalità
  const fetchModi = useCallback(async () => {
    try {
      const data = await api.getModi();
      if (data && Array.isArray(data.modi)) {
        setModi(data.modi);
        if (data.attivo) {
          setActiveModo(data.attivo as ModoId);
        }
      }
    } catch (err) {
      console.warn('[DashboardPage] Errore caricamento modalità:', err);
    }
  }, []);

  // Caricamento cataloghi della modalità attiva
  const fetchCataloghi = useCallback(async () => {
    try {
      const data = await api.getCataloghi();
      if (data) {
        setCataloghiData(data);
      }
    } catch (err) {
      console.warn('[DashboardPage] Errore caricamento cataloghi:', err);
    }
  }, []);

  useEffect(() => {
    fetchModi();
  }, [fetchModi]);

  useEffect(() => {
    fetchCataloghi();
  }, [fetchCataloghi, activeModo]);

  // Cambio modalità
  const handleSelectModo = async (nuovoModo: ModoId) => {
    if (nuovoModo === activeModo || isSwitchingModo) return;
    setIsSwitchingModo(true);
    try {
      const res = await api.attivaModo(nuovoModo);
      setActiveModo(nuovoModo);
      if (res?.propagazione) {
        setPropagationMessage(res.propagazione);
      } else {
        setPropagationMessage(
          'Modalità attivata. I cataloghi su Stremio si aggiorneranno alla prossima apertura dell\'app; se Stremio è già aperta, ricarica la pagina o riavviala.'
        );
      }
      if (res?.configVersion && onConfigChanged) {
        onConfigChanged(res.configVersion);
      }
      // Ricarica cataloghi per il nuovo modo
      await fetchCataloghi();
      await fetchModi();
    } catch (err) {
      console.error('[DashboardPage] Errore cambio modalità:', err);
    } finally {
      setIsSwitchingModo(false);
    }
  };

  // Debounced auto-save per i cursori Tonalità e Notorietà
  const handleSliderChange = (newCozy: number, newCanone: number) => {
    setCozy(newCozy);
    setCanone(newCanone);

    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = setTimeout(async () => {
      try {
        const slidersPayload = { cozy: newCozy, canone: newCanone };
        if (activeProfile) {
          onUpdateProfile(activeProfile.id, {
            sliders: slidersPayload,
            settings: {
              ...activeProfile.settings,
              sliders: slidersPayload,
            }
          });
        }
        const res = await api.configure({
          sliders: { tonalita: newCozy, notorieta: newCanone }
        });
        if (res?.configVersion && onConfigChanged) {
          onConfigChanged(res.configVersion);
        }
      } catch (err) {
        console.warn('[DashboardPage] Errore salvataggio cursori:', err);
      }
    }, 500);
  };

  // Reorder cataloghi attivi
  const handleReorderActiveCatalogs = async (newIds: string[]) => {
    try {
      const res = await api.riordinaCataloghi(newIds);
      if (res?.configVersion && onConfigChanged) {
        onConfigChanged(res.configVersion);
      }
      await fetchCataloghi();
    } catch (err) {
      console.error('[DashboardPage] Errore riordino cataloghi:', err);
      await fetchCataloghi();
    }
  };

  // Toggle catalogo attivo
  const handleToggleActiveCatalog = async (id: string, attivo: boolean) => {
    try {
      const res = await api.attivaCatalogo(id, attivo);
      if (res?.configVersion && onConfigChanged) {
        onConfigChanged(res.configVersion);
      }
      await fetchCataloghi();
    } catch (err) {
      console.error('[DashboardPage] Errore attivazione catalogo:', err);
      await fetchCataloghi();
    }
  };

  // Cataloghi attivi per la modalità corrente
  const cataloghiAttivi: CatalogoEsploraVoce[] = (() => {
    if (!cataloghiData?.gruppi) return [];
    const tutti: CatalogoEsploraVoce[] = [
      ...(cataloghiData.gruppi.suggerimenti || []),
      ...(cataloghiData.gruppi.watchlist || []),
      ...(cataloghiData.gruppi.creazioni || []),
      ...(cataloghiData.gruppi.tutti || []),
    ];
    return tutti
      .filter(c => c.attivo)
      .sort((a, b) => (a.ordine ?? 999) - (b.ordine ?? 999));
  })();

  // Scaffali di suggerimento per la modalità attiva (da gruppi.suggerimenti)
  const suggerimentiScaffali = cataloghiData?.gruppi?.suggerimenti || [];

  // Primo catalogo per anteprima live
  const previewCatalogId = suggerimentiScaffali[0]?.id || 'yaca_mondi_movies';

  return (
    <div className="flex flex-col w-full gap-8 sm:gap-12 min-w-0">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 1. TOP BAR — Già presente in Header                                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 2. LE CINQUE MODALITÀ (Ticket 07)                                   */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-3">
        <div className="flex flex-col gap-1">
          <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">Modalità</h2>
          <p className="text-xs sm:text-sm text-marrow-light font-medium">
            Scegli come guardare in questo momento. Una sola modalità attiva alla volta; i contenuti e i cataloghi si adattano istantaneamente.
          </p>
        </div>

        {/* Le 5 caselle */}
        <div className="grid grid-cols-2 min-[460px]:grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
          {DEFAULT_MODI.map(({ modo, nome, emoji: defaultEmoji }) => {
            const apiModo = modi.find(m => m.modo === modo);
            const isAttivo = activeModo === modo;
            const emoji = apiModo?.emoji || defaultEmoji;

            return (
              <button
                key={modo}
                type="button"
                onClick={() => handleSelectModo(modo)}
                disabled={isSwitchingModo}
                className={`flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl transition-all duration-300 min-h-[88px] sm:min-h-[104px] touch-manipulation text-center ${
                  isAttivo
                    ? 'bg-primary text-white shadow-lg shadow-primary/30 ring-2 ring-primary/20 scale-[1.02]'
                    : 'glass-card bg-white/40 text-marrow-deep hover:bg-white/80 border border-marrow-light/10'
                }`}
              >
                <span className="text-2xl sm:text-3xl mb-1 select-none">{emoji}</span>
                <span className={`text-xs sm:text-sm font-black tracking-tight ${isAttivo ? 'text-white' : 'text-marrow-deep'}`}>
                  {nome}
                </span>
                {isAttivo && (
                  <span className="mt-1 text-[10px] font-black uppercase tracking-widest px-2 py-0.5 rounded-full bg-white/20 text-white">
                    Attivo
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Frase di propagazione honesta su Stremio */}
        {propagationMessage && (
          <div className="flex items-start gap-2.5 p-3 sm:p-4 rounded-xl bg-amber-500/10 border border-amber-500/20 text-amber-900 shadow-sm animate-in fade-in duration-200">
            <Info className="h-4 w-4 sm:h-5 sm:w-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="flex-1 min-w-0">
              <p className="text-xs sm:text-sm font-medium leading-relaxed">
                {propagationMessage}
              </p>
            </div>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 3. I DUE CURSORI: Tonalità e Notorietà (Ticket 07)                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="glass-panel p-4 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-marrow-light/10 pb-3">
          <div>
            <h2 className="text-lg sm:text-xl font-black text-marrow-deep tracking-tight flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              Tonalità & Notorietà
            </h2>
            <p className="text-xs text-marrow-light font-medium mt-0.5">
              Cursori unici per l&apos;account: regolano l&apos;atmosfera e la rarità delle raccomandazioni generate
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
          {/* Cursore 1: Tonalità */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-black uppercase tracking-wider text-marrow-deep">Tonalità</span>
              <span className="font-bold text-primary">
                {cozy < -0.2 ? 'Cupa / Intensa' : (cozy > 0.2 ? 'Leggera / Cozy' : 'Bilanciata')} ({cozy.toFixed(1)})
              </span>
            </div>
            <Slider
              value={[cozy]}
              min={-1}
              max={1}
              step={0.1}
              onValueChange={([val]) => handleSliderChange(val, canone)}
            />
            <div className="flex justify-between text-[11px] text-marrow-light/70 font-semibold px-0.5">
              <span>Cupa / Tesa</span>
              <span>Equilibrata</span>
              <span>Leggera / Cozy</span>
            </div>
          </div>

          {/* Cursore 2: Notorietà */}
          <div className="space-y-2">
            <div className="flex justify-between items-center text-xs">
              <span className="font-black uppercase tracking-wider text-marrow-deep">Notorietà</span>
              <span className="font-bold text-primary">
                {canone < -0.2 ? 'Di nicchia / Raro' : (canone > 0.2 ? 'Mainstream / Popolare' : 'Bilanciata')} ({canone.toFixed(1)})
              </span>
            </div>
            <Slider
              value={[canone]}
              min={-1}
              max={1}
              step={0.1}
              onValueChange={([val]) => handleSliderChange(cozy, val)}
            />
            <div className="flex justify-between text-[11px] text-marrow-light/70 font-semibold px-0.5">
              <span>Di nicchia / Cult</span>
              <span>Equilibrata</span>
              <span>Popolari / Mainstream</span>
            </div>
          </div>
        </div>

        {/* Anteprima che reagisce ai cursori */}
        <div className="pt-2">
          <div className="flex items-center gap-1.5 mb-2">
            <Sparkles className="h-3.5 w-3.5 text-primary" />
            <span className="text-xs font-bold text-marrow-deep uppercase tracking-wider">Anteprima in tempo reale</span>
          </div>
          <div className="rounded-xl border border-marrow-light/10 bg-white/30 p-2 overflow-hidden">
            <CatalogLivePreview
              catalogId={previewCatalogId}
              userId={userId || 'global'}
              profileId={activeProfile?.id || 'global'}
              sliders={{ cozy, canone }}
            />
          </div>
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 4. CATALOGHI DEI SUGGERIMENTI (SOLO MODO ATTIVO, NON ATTIVABILI QUI)*/}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">
                Suggerimenti di Visione
              </h2>
              <span className="text-xs font-bold text-marrow-light px-2 py-0.5 rounded-full bg-marrow-light/10">
                Sola lettura
              </span>
            </div>
            <p className="text-xs sm:text-sm text-marrow-light font-medium mt-0.5">
              Scaffali calcolati dal grafo per la modalità attiva. I suggerimenti si attivano esclusivamente in Esplora.
            </p>
          </div>
          {onGoToExplore && (
            <Button
              onClick={onGoToExplore}
              variant="outline"
              size="sm"
              className="rounded-xl text-xs font-bold text-primary border-primary/20 bg-primary/5 hover:bg-primary/10 gap-1.5 h-10 shrink-0"
            >
              <Compass className="h-4 w-4" />
              Gestisci in Esplora
            </Button>
          )}
        </div>

        {suggerimentiScaffali.length === 0 ? (
          <div className="p-8 text-center rounded-2xl border border-marrow-light/10 bg-white/30">
            <p className="text-xs sm:text-sm text-marrow-light font-medium italic">
              Nessun suggerimento generato per questa modalità.
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {suggerimentiScaffali.map((shelf) => {
              const tipoIcon = shelf.tipo === 'serie' ? <Tv className="h-3 w-3" /> : <Film className="h-3 w-3" />;
              const tipoLabel = shelf.tipo === 'serie' ? 'Serie' : (shelf.tipo === 'film' ? 'Film' : (shelf.tipo === 'anime' ? 'Anime' : 'Bambini'));

              return (
                <div
                  key={shelf.id}
                  className="glass-card p-4 rounded-2xl border border-marrow-light/10 bg-white/40 space-y-2 flex flex-col justify-between"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-black text-marrow-deep text-sm sm:text-base truncate">
                        {shelf.nome}
                      </h3>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg bg-primary/5 text-primary text-[11px] font-black uppercase tracking-wider border border-primary/10">
                          {tipoIcon}
                          <span>{tipoLabel}</span>
                        </span>
                        {shelf.attivo && (
                          <span className="inline-flex items-center gap-0.5 text-[10px] font-bold text-success bg-success/10 px-1.5 py-0.5 rounded-md">
                            <Check className="h-3 w-3" /> Attivo in Stremio
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Locandine di anteprima */}
                  <div className="overflow-hidden pt-1">
                    <PosterRow presetId={shelf.id} type={shelf.tipo === 'serie' ? 'series' : 'movie'} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 5. CREATOR (Ticket 07 & Ticket 09)                                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="border-b border-marrow-light/10 pb-2">
          <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">Creatore di Cataloghi</h2>
          <p className="text-xs sm:text-sm text-marrow-light font-medium mt-0.5">
            Crea nuovi cataloghi tematici personalizzati a livello di account
          </p>
        </div>
        <div className="glass-panel p-3 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
          <CreatorPanel
            onAddCatalog={(catalog) => onAddCatalog(activeProfileId, catalog)}
          />
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 6. DNA & AI LAB (Ticket 07)                                         */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="border-b border-marrow-light/10 pb-2">
          <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">DNA & AI Lab</h2>
          <p className="text-xs sm:text-sm text-marrow-light font-medium mt-0.5">
            Il DNA del tuo account calcolato sulla cronologia di visione completa
          </p>
        </div>
        <div className="glass-panel p-3 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
          {activeProfile && (
            <DnaAndAiPanel
              profile={activeProfile}
              onUpdateProfile={onUpdateProfile}
              syncStatus={syncStatus}
              userId={userId}
            />
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 7. LIBRERIA UTENTE (Ticket 07 & Ticket 09)                          */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="border-b border-marrow-light/10 pb-2">
          <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">Libreria Utente</h2>
          <p className="text-xs sm:text-sm text-marrow-light font-medium mt-0.5">
            La libreria dell&apos;account: titoli salvati e watchlist personale
          </p>
        </div>
        <div className="glass-panel p-3 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
          {activeProfile && userId && (
            <UserLibraryPanel
              profileId={activeProfile.id}
              userId={userId}
              profile={activeProfile}
              onUpdateProfile={onUpdateProfile}
              onCreateCatalog={(list) => {
                if (onSaveMyList) onSaveMyList(list);
              }}
            />
          )}
        </div>
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 8. CATALOGHI ATTIVI DELLA MODALITÀ (Ticket 06 & Ticket 07)           */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4">
        <div className="border-b border-marrow-light/10 pb-2">
          <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">
            Cataloghi Attivi ({DEFAULT_MODI.find(m => m.modo === activeModo)?.nome || activeModo})
          </h2>
          <p className="text-xs sm:text-sm text-marrow-light font-medium mt-0.5">
            L&apos;elenco definitivo dei cataloghi accesi nella modalità attiva. Trascina o usa le frecce per riordinarli.
          </p>
        </div>
        <div className="glass-panel p-3 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
          <ActiveCatalogsPanel
            catalogs={cataloghiAttivi}
            onReorder={handleReorderActiveCatalogs}
            onToggleActive={handleToggleActiveCatalog}
            onGoToExplore={onGoToExplore}
          />
        </div>
      </section>
    </div>
  );
}
