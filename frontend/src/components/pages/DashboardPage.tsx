'use client';
import { useState, useRef } from 'react';
import {
  Profile,
  Catalog,
  MyList,
  ModoInfo,
  ModoId,
  CatalogoEsploraVoce,
  CataloghiEsploraResponse,
  Preset,
} from '@/types';
import { AppTab } from '@/components/layout/TabNav';
import { api } from '@/lib/api';
import { CreatorPanel } from '@/components/dashboard/CreatorPanel';
import { UserLibraryPanel } from '@/components/dashboard/UserLibraryPanel';
import { ActiveCatalogsPanel } from '@/components/dashboard/ActiveCatalogsPanel';
import { ExplorePanel } from '@/components/dashboard/ExplorePanel';
import { CatalogLivePreview } from '@/components/dashboard/CatalogLivePreview';
import { EditCatalogModal } from '@/components/modals/EditCatalogModal';
import { Slider } from '@/components/ui/slider';
import { Compass, Info, Sparkles, Layers, Sliders } from 'lucide-react';

interface DashboardPageProps {
  profiles: Profile[];
  editingProfileId: string;
  activeProfileId: string;
  presets?: Preset[];
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
  onConfigChanged?: (configVersion: string) => void;
  // Shared modo and catalog state from hook layer
  cataloghiData: CataloghiEsploraResponse | null;
  cataloghiLoading?: boolean;
  modi: ModoInfo[];
  activeModo: ModoId;
  isSwitchingModo: boolean;
  propagationMessage: string | null;
  onSelectModo: (modo: ModoId) => Promise<any>;
  onToggleCatalogActive?: (id: string, attivo: boolean) => Promise<any> | void;
  onReorderActiveCatalogs: (newIds: string[]) => Promise<any>;
  activeTab: AppTab;
  onTabChange: (tab: AppTab) => void;
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
  activeProfileId,
  presets,
  onAddCatalog,
  onUpdateCatalog,
  onSaveMyList,
  onUpdateProfile,
  userId,
  onConfigChanged,
  cataloghiData,
  cataloghiLoading,
  modi,
  activeModo,
  isSwitchingModo,
  propagationMessage,
  onSelectModo,
  onToggleCatalogActive,
  onReorderActiveCatalogs,
  activeTab,
  onTabChange,
}: DashboardPageProps) {
  // Cursori (Tonalità e Notorietà) — unici per account
  const activeProfile = profiles.find((p) => p.id === activeProfileId) || profiles[0];
  const initialSliders = activeProfile?.settings?.sliders || activeProfile?.sliders || { tonalita: 0, notorieta: 0 };
  const [tonalita, setTonalita] = useState<number>(initialSliders.tonalita ?? initialSliders.cozy ?? 0);
  const [notorieta, setNotorieta] = useState<number>(initialSliders.notorieta ?? initialSliders.canone ?? 0);
  const sliderTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Modale modifica catalogo personalizzato
  const [editingCatalog, setEditingCatalog] = useState<Catalog | null>(null);
  const [isEditOpen, setIsEditOpen] = useState(false);

  const handleEditCatalog = (catalog: any) => {
    if (catalog.source === 'preset' || catalog.fonte === 'preset') return;
    setEditingCatalog({ ...catalog });
    setIsEditOpen(true);
  };

  // Debounced auto-save per i cursori Tonalità e Notorietà
  const handleSliderChange = (newTonalita: number, newNotorieta: number) => {
    setTonalita(newTonalita);
    setNotorieta(newNotorieta);

    if (sliderTimerRef.current) clearTimeout(sliderTimerRef.current);
    sliderTimerRef.current = setTimeout(async () => {
      try {
        const res = await api.configure({
          sliders: { tonalita: newTonalita, notorieta: newNotorieta },
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
      .filter((c) => c.attivo)
      .sort((a, b) => (a.ordine ?? 999) - (b.ordine ?? 999));
  })();

  // Scaffali di suggerimento per la modalità attiva (usati per anteprima live)
  const suggerimentiScaffali = cataloghiData?.gruppi?.suggerimenti || [];
  const previewCatalog = suggerimentiScaffali[0] || cataloghiAttivi[0] || null;
  const previewCatalogId = previewCatalog?.id || null;
  const previewMediaType = previewCatalog?.media === 'series' ? 'series' : 'movie';

  return (
    <div className="flex flex-col w-full gap-6 sm:gap-8 min-w-0">
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* LIVELLO 2: DASHBOARD & ESPLORA (Sotto le 5 modalità)                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {(activeTab === 'dashboard' || activeTab === 'explore') && (
        <>
          {/* Le cinque modalità */}
          <section className="space-y-3">
            <div className="flex flex-col gap-1">
              <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">Modalità</h2>
              <p className="text-xs sm:text-sm text-marrow-light font-medium">
                Scegli come guardare in questo momento. Una sola modalità attiva alla volta; i contenuti e i cataloghi si adattano istantaneamente.
              </p>
            </div>

            <div className="grid grid-cols-2 min-[460px]:grid-cols-3 sm:grid-cols-5 gap-2 sm:gap-3">
              {DEFAULT_MODI.map(({ modo, nome, emoji: defaultEmoji }) => {
                const apiModo = modi.find((m) => m.modo === modo);
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

          {/* Seconda fila di pillole: esattamente due pannelli (Cataloghi attivi | Esplora) */}
          <div className="flex items-center justify-center sm:justify-start">
            <div className="flex items-center gap-1.5 p-1.5 bg-white/40 rounded-2xl border border-marrow-light/10">
              <button
                type="button"
                onClick={() => onTabChange('dashboard')}
                className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all touch-manipulation min-h-[40px] ${
                  activeTab === 'dashboard'
                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                    : 'text-marrow-deep hover:text-primary hover:bg-white/60'
                }`}
              >
                <Layers className="h-4 w-4" />
                <span>Cataloghi attivi</span>
                <span
                  className={`text-xs px-1.5 py-0.5 rounded-full font-bold ${
                    activeTab === 'dashboard' ? 'bg-white/20 text-white' : 'bg-primary/10 text-primary'
                  }`}
                >
                  {cataloghiAttivi.length}
                </span>
              </button>
              <button
                type="button"
                onClick={() => onTabChange('explore')}
                className={`flex items-center gap-2 px-4 sm:px-6 py-2.5 rounded-xl text-xs sm:text-sm font-black uppercase tracking-wider transition-all touch-manipulation min-h-[40px] ${
                  activeTab === 'explore'
                    ? 'bg-primary text-white shadow-lg shadow-primary/30'
                    : 'text-marrow-deep hover:text-primary hover:bg-white/60'
                }`}
              >
                <Compass className="h-4 w-4" />
                <span>Esplora</span>
              </button>
            </div>
          </div>

          {/* Pannello Cataloghi Attivi */}
          {activeTab === 'dashboard' && (
            <div className="glass-panel p-3 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
              <ActiveCatalogsPanel
                catalogs={cataloghiAttivi}
                onReorder={onReorderActiveCatalogs}
                onGoToExplore={() => onTabChange('explore')}
                onEditCatalog={handleEditCatalog}
              />
            </div>
          )}

          {/* Pannello Esplora */}
          {activeTab === 'explore' && (
            <div className="glass-panel p-3 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
              <ExplorePanel
                data={cataloghiData}
                loading={cataloghiLoading}
                activeModo={activeModo}
                presets={presets}
                onToggleActive={onToggleCatalogActive}
                onEditCatalog={handleEditCatalog}
                onConfigChanged={onConfigChanged}
              />
            </div>
          )}
        </>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* GUSTI (Cursori Raccomandazione a livello di account)                */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'gusti' && (
        <div className="space-y-6 min-w-0">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <Sliders className="h-6 w-6 text-primary" />
              <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">
                Gusti (Cursori Raccomandazione)
              </h2>
            </div>
            <p className="text-xs sm:text-sm text-marrow-light font-medium">
              Cursori unici per l&apos;account: regolano l&apos;atmosfera e la rarità delle raccomandazioni generate.
            </p>
          </div>

          <div className="space-y-6 glass-panel p-4 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-1">
              {/* Cursore 1: Tonalità */}
              <div className="space-y-2">
                <div className="flex justify-between items-center text-xs">
                  <span className="font-black uppercase tracking-wider text-marrow-deep">Tonalità</span>
                  <span className="font-bold text-primary">
                    {tonalita < -0.2 ? 'Cupa / Intensa' : tonalita > 0.2 ? 'Leggera / Cozy' : 'Bilanciata'} (
                    {tonalita.toFixed(1)})
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
                    {notorieta < -0.2 ? 'Di nicchia / Raro' : notorieta > 0.2 ? 'Mainstream / Popolare' : 'Bilanciata'} (
                    {notorieta.toFixed(1)})
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

            {/* Anteprima in tempo reale che reagisce ai cursori */}
            {previewCatalogId && (
              <div className="pt-2 border-t border-marrow-light/10">
                <div className="flex items-center gap-1.5 mb-2">
                  <Sparkles className="h-3.5 w-3.5 text-primary" />
                  <span className="text-xs font-bold text-marrow-deep uppercase tracking-wider">
                    Anteprima in tempo reale
                  </span>
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
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* CREATORE DI CATALOGHI (Aperto dalla Top Bar)                       */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'creator' && (
        <div className="space-y-6 min-w-0">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">Creatore di Cataloghi</h2>
            <p className="text-xs sm:text-sm text-marrow-light font-medium">
              Crea nuovi cataloghi tematici personalizzati a livello di account.
            </p>
          </div>
          <div className="glass-panel p-3 sm:p-6 bg-white/40 rounded-2xl border border-marrow-light/10">
            <CreatorPanel
              onAddCatalog={(catalog) => {
                onAddCatalog(activeProfileId, catalog);
                onTabChange('dashboard');
              }}
            />
          </div>
        </div>
      )}

      {/* ═══════════════════════════════════════════════════════════════════ */}
      {/* LIBRERIA UTENTE (Aperta dalla Top Bar)                             */}
      {/* ═══════════════════════════════════════════════════════════════════ */}
      {activeTab === 'library' && (
        <div className="space-y-6 min-w-0">
          <div className="flex flex-col gap-1">
            <h2 className="text-xl sm:text-2xl font-black text-marrow-deep tracking-tight">Libreria Utente</h2>
            <p className="text-xs sm:text-sm text-marrow-light font-medium">
              La libreria dell&apos;account: titoli salvati e watchlist personale.
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
                  onTabChange('dashboard');
                }}
              />
            )}
          </div>
        </div>
      )}

      {/* Modale modifica catalogo creato */}
      <EditCatalogModal
        open={isEditOpen}
        onClose={() => {
          setEditingCatalog(null);
          setIsEditOpen(false);
        }}
        catalog={editingCatalog}
        onUpdateCatalog={(cat) => onUpdateCatalog(activeProfileId, cat)}
      />
    </div>
  );
}
