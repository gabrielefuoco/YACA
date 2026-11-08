'use client';
import { useState, useRef } from 'react';
import { Profile, Catalog, MyList, ModoInfo, ModoId, CatalogoEsploraVoce, CataloghiEsploraResponse } from '@/types';
import { api } from '@/lib/api';
import { TIPI_CATALOGO_MAP } from '@/lib/catalogPresentation';
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
  customCatalogs?: Catalog[];
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
  // Shared modo and catalog state from hook layer (S2)
  cataloghiData: CataloghiEsploraResponse | null;
  modi: ModoInfo[];
  activeModo: ModoId;
  isSwitchingModo: boolean;
  propagationMessage: string | null;
  onSelectModo: (modo: ModoId) => Promise<any>;
  onReorderActiveCatalogs: (newIds: string[]) => Promise<any>;
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
  cataloghiData,
  modi,
  activeModo,
  isSwitchingModo,
  propagationMessage,
  onSelectModo,
  onReorderActiveCatalogs,
}: DashboardPageProps) {
  // Cursori (Tonalità e Notorietà) — unici per account (S1)
  const activeProfile = profiles.find(p => p.id === activeProfileId) || profiles[0];
  const initialSliders = activeProfile?.settings?.sliders || activeProfile?.sliders || { tonalita: 0, notorieta: 0 };
  const [tonalita, setTonalita] = useState<number>(initialSliders.tonalita ?? initialSliders.cozy ?? 0);
  const [notorieta, setNotorieta] = useState<number>(initialSliders.notorieta ?? initialSliders.canone ?? 0);
  const sliderTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Debounced auto-save per i cursori Tonalità e Notorietà: un solo percorso di scrittura (S1)
  const handleSliderChange = (newTonalita: number, newNotorieta: number) => {
    setTonalita(newTonalita);
    setNotorieta(newNotorieta);

    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.configure({
          sliders: { tonalita: newTonalita, notorieta: newNotorieta }
        });
        if (res?.configVersion && onConfigChanged) {
          onConfigChanged(res.configVersion);
        }
      } catch (err) {
        console.warn('[DashboardPage] Errore salvataggio cursori:', err);
      }
    }, 500);
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

  // Primo catalogo per anteprima live della modalità corrente (P3)
  // Non ricade su 'yaca_mondi_movies': se non c'è catalogo per il modo attivo, non renderizza
  const previewCatalog = suggerimentiScaffali[0] || cataloghiAttivi[0] || null;
  const previewCatalogId = previewCatalog?.id || null;
  const previewMediaType = previewCatalog?.media === 'series' ? 'series' : 'movie';

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
                onClick={() => onSelectModo(modo)}
                disabled={isSwitchingModo}
                className={`relative flex flex-col items-center justify-center p-3 sm:p-4 rounded-2xl border transition-all text-center touch-manipulation min-h-[90px] sm:min-h-[108px] ${
                  isAttivo
                    ? 'border-primary bg-primary text-white shadow-lg shadow-primary/30 scale-[1.02]'
                    : 'border-marrow-light/15 bg-white/40 hover:bg-white/70 text-marrow-deep hover:border-primary/40'
                } ${isSwitchingModo ? 'opacity-50 cursor-wait' : 'cursor-pointer'}`}
              >
                <span className="text-2xl sm:text-3xl mb-1 select-none">{emoji}</span>
                <span className={`text-xs sm:text-sm font-black tracking-tight ${isAttivo ? 'text-white' : 'text-marrow-deep'}`}>
                  {nome}
                </span>
                {isAttivo && (
                  <span className="absolute top-2 right-2 flex h-2 w-2">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-white opacity-75" />
                    <span className="relative inline-flex rounded-full h-2 w-2 bg-white" />
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Feedback di propagazione verso Stremio */}
        {propagationMessage && (
          <div className="flex items-start gap-2.5 p-3 sm:p-3.5 bg-primary/5 border border-primary/20 rounded-xl text-xs sm:text-sm text-marrow-deep font-medium">
            <Info className="h-4 w-4 text-primary shrink-0 mt-0.5" />
            <div className="space-y-0.5">
              <span className="font-bold text-primary block">Stato sincronizzazione Stremio</span>
              <p className="text-marrow-light leading-relaxed">{propagationMessage}</p>
            </div>
          </div>
        )}
      </section>

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* 3. CURSORI (TONALITÀ E NOTORIETÀ) + ANTEPRIMA LIVE                  */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      <section className="space-y-4 glass-panel p-4 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
        <div className="flex items-center justify-between border-b border-marrow-light/10 pb-3">
          <div>
            <div className="flex items-center gap-2">
              <Sliders className="h-5 w-5 text-primary" />
              <h2 className="text-lg sm:text-xl font-black text-marrow-deep tracking-tight">
                Cursori Raccomandazione
              </h2>
            </div>
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
                {tonalita < -0.2 ? 'Cupa / Intensa' : (tonalita > 0.2 ? 'Leggera / Cozy' : 'Bilanciata')} ({tonalita.toFixed(1)})
              </span>
            </div>
            <Slider
              value={[tonalita]}
              min={-1}
              max={1}
              step={0.1}
              onValueChange={([val]) => handleSliderChange(val, notorieta)}
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
                {notorieta < -0.2 ? 'Di nicchia / Raro' : (notorieta > 0.2 ? 'Mainstream / Popolare' : 'Bilanciata')} ({notorieta.toFixed(1)})
              </span>
            </div>
            <Slider
              value={[notorieta]}
              min={-1}
              max={1}
              step={0.1}
              onValueChange={([val]) => handleSliderChange(tonalita, val)}
            />
            <div className="flex justify-between text-[11px] text-marrow-light/70 font-semibold px-0.5">
              <span>Di nicchia / Cult</span>
              <span>Equilibrata</span>
              <span>Popolari / Mainstream</span>
            </div>
          </div>
        </div>

        {/* Anteprima che reagisce ai cursori (P3: renderizza solo se c'è catalogo nel modo corrente) */}
        {previewCatalogId && (
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
                sliders={{ tonalita, notorieta }}
                type={previewMediaType}
              />
            </div>
          </div>
        )}
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
              Generati dal grafo sulla base della cronologia. Per accenderli o spegnerli in Stremio usa la scheda Esplora.
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
              const mediaIcon = shelf.media === 'series' ? <Tv className="h-3 w-3" /> : <Film className="h-3 w-3" />;
              const tipoLabel = TIPI_CATALOGO_MAP[shelf.tipo]?.badgeLabel || TIPI_CATALOGO_MAP[shelf.tipo]?.label || shelf.tipo;

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
                          {mediaIcon}
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
                    <PosterRow presetId={shelf.id} type={shelf.media === 'series' ? 'series' : 'movie'} />
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
            onReorder={onReorderActiveCatalogs}
            onGoToExplore={onGoToExplore}
          />
        </div>
      </section>
    </div>
  );
}
