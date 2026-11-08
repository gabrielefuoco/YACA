'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Profile, DNAItem, AnalyticsData, SyncStatus, CompiledVector, HeroCatalogUiGroup, EngineSliders, DEFAULT_ENGINE_SLIDERS, ShelfMemberSeed, ShelfRepresentativeSeed } from '@/types';
import { api } from '@/lib/api';
import { BrainCircuit, Terminal, EyeOff, Sliders, RotateCcw, Info } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { DnaBarChart } from './DnaBarChart';
import { formatDnaLabel, groupDnaItems, DnaCategoryGroup } from '@/lib/dnaChart';
import { CatalogLivePreview } from './CatalogLivePreview';
import { registerHeroCatalogs } from '@/lib/catalogKind';
import { getShelfBadge, formatShelfSeeds, quantizeSliderValue } from '@/lib/shelfPresentation';

const TMDB_KEY_TO_DNA_TYPE: Record<string, DNAItem['type']> = {
  with_genres: 'genre',
  with_keywords: 'keyword',
  with_origin_country: 'country',
};

// Complete TMDB genre ID → human name (Movie + TV combined)
const GENRE_ID_TO_NAME: Record<string, string> = {
  '28': 'Azione', '12': 'Avventura', '16': 'Animazione', '35': 'Commedia',
  '80': 'Crime', '99': 'Documentario', '18': 'Dramma', '10751': 'Famiglia',
  '14': 'Fantasy', '36': 'Storia', '27': 'Horror', '10402': 'Musica',
  '9648': 'Mistero', '10749': 'Romance', '878': 'Fantascienza',
  '53': 'Thriller', '10752': 'Guerra', '37': 'Western',
  '10759': 'Azione & Avventura', '10762': 'Kids', '10763': 'News',
  '10764': 'Reality', '10765': 'Sci-Fi & Fantasy', '10766': 'Soap',
  '10767': 'Talk', '10768': 'War & Politics', '10770': 'Film TV',
};

interface DnaAndAiPanelProps {
  profile: Profile;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
  syncStatus: SyncStatus & { onboardingCompleted?: boolean, lastSync?: string, manualDNA?: DNAItem[], suggestedDNA?: DNAItem[], compiledVectors?: CompiledVector & { idNames?: Record<string, string> } };
  userId?: string;
}

export function DnaAndAiPanel({ profile, onUpdateProfile, syncStatus, userId }: DnaAndAiPanelProps) {
  const activeUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('yaca_user_id') : null);
  const dnaLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    [...(profile?.settings?.manualDNA ?? []), ...(profile?.settings?.suggestedDNA ?? [])].forEach((item) => {
      const dnaKey = `${item.type}:${String(item.id)}`;
      if (!lookup.has(dnaKey)) {
        lookup.set(dnaKey, item.name);
      }
    });
    return lookup;
  }, [profile?.settings?.manualDNA, profile?.settings?.suggestedDNA]);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [compiledVectors, setCompiledVectors] = useState<(CompiledVector & { idNames?: Record<string, string> }) | null>(null);
  const [localIsSyncing, setLocalIsSyncing] = useState<boolean>(false);
  const [openInfoCatalogId, setOpenInfoCatalogId] = useState<string | null>(null);

  const activeSliders: EngineSliders = useMemo(() => {
    const raw = profile?.settings?.sliders ?? profile?.sliders;
    return {
      cozy: typeof raw?.cozy === 'number' ? quantizeSliderValue(raw.cozy) : DEFAULT_ENGINE_SLIDERS.cozy,
      canone: typeof raw?.canone === 'number' ? quantizeSliderValue(raw.canone) : DEFAULT_ENGINE_SLIDERS.canone,
    };
  }, [profile?.settings?.sliders, profile?.sliders]);

  // Stato visivo immediato (manopola e badge numerico reattivi al drag)
  const [shownSliders, setShownSliders] = useState<EngineSliders>(activeSliders);
  // Stato debounced per le anteprime (~400 ms)
  const [previewSliders, setPreviewSliders] = useState<EngineSliders>(activeSliders);
  // Stato di salvataggio discreto: «salvato» / «salvataggio…»
  const [saveStatus, setSaveStatus] = useState<'saved' | 'saving'>('saved');

  const previewDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const autoSaveDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const savedSlidersRef = useRef<EngineSliders>(activeSliders);
  const isInteractingRef = useRef<boolean>(false);

  // Sincronizza con aggiornamenti esterni al profilo se non si sta trascinando
  useEffect(() => {
    if (!isInteractingRef.current) {
      setShownSliders(activeSliders);
      setPreviewSliders(activeSliders);
      savedSlidersRef.current = activeSliders;
      setSaveStatus('saved');
    }
  }, [activeSliders]);

  // Pulisci i timer all'unmount
  useEffect(() => {
    return () => {
      if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
      if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    };
  }, []);

  const handleSliderMove = (key: keyof EngineSliders, rawVal: number) => {
    const val = quantizeSliderValue(rawVal);
    const nextSliders: EngineSliders = {
      ...shownSliders,
      [key]: val,
    };

    isInteractingRef.current = true;
    setShownSliders(nextSliders);

    const hasChangedFromSaved = (
      nextSliders.cozy !== savedSlidersRef.current.cozy ||
      nextSliders.canone !== savedSlidersRef.current.canone
    );

    if (hasChangedFromSaved) {
      setSaveStatus('saving');
    }

    // 1. Immediate feedback per le anteprime: debounce ~400 ms al livello di valore
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    previewDebounceRef.current = setTimeout(() => {
      previewDebounceRef.current = null;
      setPreviewSliders((prev) => {
        if (prev.cozy === nextSliders.cozy && prev.canone === nextSliders.canone) return prev;
        return nextSliders;
      });
    }, 400);

    // 2. Auto-save con persistenza sul profilo: debounce ~1 s dopo l'ultimo movimento
    if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);
    autoSaveDebounceRef.current = setTimeout(() => {
      autoSaveDebounceRef.current = null;
      isInteractingRef.current = false;

      if (hasChangedFromSaved) {
        savedSlidersRef.current = nextSliders;
        onUpdateProfile(profile.id, {
          sliders: nextSliders,
          settings: {
            ...(profile.settings ?? {}),
            sliders: nextSliders,
          },
        });
      }
      setSaveStatus('saved');
    }, 1000);
  };

  const handleResetSliders = () => {
    const resetValues: EngineSliders = { ...DEFAULT_ENGINE_SLIDERS };
    if (previewDebounceRef.current) clearTimeout(previewDebounceRef.current);
    if (autoSaveDebounceRef.current) clearTimeout(autoSaveDebounceRef.current);

    isInteractingRef.current = false;
    setShownSliders(resetValues);
    setPreviewSliders(resetValues);

    const hasChangedFromSaved = (
      resetValues.cozy !== savedSlidersRef.current.cozy ||
      resetValues.canone !== savedSlidersRef.current.canone
    );

    if (hasChangedFromSaved) {
      savedSlidersRef.current = resetValues;
      setSaveStatus('saving');
      onUpdateProfile(profile.id, {
        sliders: resetValues,
        settings: {
          ...(profile.settings ?? {}),
          sliders: resetValues,
        },
      });
      setTimeout(() => setSaveStatus('saved'), 350);
    } else {
      setSaveStatus('saved');
    }
  };

  const toggleCatalogInfo = (catalogId: string) => {
    setOpenInfoCatalogId((prev) => (prev === catalogId ? null : catalogId));
  };

  const heroCatalogs: HeroCatalogUiGroup[] = useMemo(() => {
    if (analytics?.heroCatalogs && analytics.heroCatalogs.length > 0) {
      return analytics.heroCatalogs;
    }
    return [];
  }, [analytics?.heroCatalogs]);

  const heroListItems = useMemo(() => {
    const items: Array<{
      id: string;
      idBase: string;
      label: string;
      emoji: string;
      desc: string;
      type: 'movie' | 'series';
      anime?: boolean;
      nome_fonte?: string;
      confidenza?: number | null;
      semi_membri?: ShelfMemberSeed[];
      semi_rappresentativi?: ShelfRepresentativeSeed[];
    }> = [];

    heroCatalogs.forEach((catalog) => {
      const rawType = catalog.medium || catalog.type;
      const type: 'movie' | 'series' = rawType === 'series' || (rawType as string) === 'tv' ? 'series' : 'movie';
      const id = catalog.catalog_id || catalog.id || `${catalog.idBase || 'yaca_shelf'}_${type === 'movie' ? 'movies' : 'series'}`;
      items.push({
        id,
        idBase: catalog.idBase || id,
        label: catalog.nome || catalog.label || catalog.idBase || id,
        emoji: catalog.emoji || (type === 'movie' ? '🎬' : '📺'),
        desc: catalog.desc || '',
        type,
        anime: catalog.anime,
        nome_fonte: catalog.nome_fonte,
        confidenza: catalog.confidenza,
        semi_membri: catalog.semi_membri,
        semi_rappresentativi: catalog.semi_rappresentativi,
      });
    });

    return items;
  }, [heroCatalogs]);

  const getDnaName = (vectorKey: string) => {
    const prefix = vectorKey.charAt(0);
    const id = vectorKey.substring(2);
    
    // 1. Try labels map from analytics endpoint (covers keywords resolved during extraction)
    const analyticsLabel = analytics?.baseDnaParams?.labels?.[id];
    if (analyticsLabel) return analyticsLabel;
    
    // 1b. Try idNames from compiled vectors if available
    const backendLabel = compiledVectors?.idNames?.[id];
    if (backendLabel) return backendLabel;
    
    // 2. For genres, use the hardcoded TMDB map
    if (prefix === 'g' && GENRE_ID_TO_NAME[id]) return GENRE_ID_TO_NAME[id];
    
    // 3. Try dnaLookup from profile settings (manualDNA/suggestedDNA)
    const tmdbKey = prefix === 'g' ? 'with_genres' : prefix === 'k' ? 'with_keywords' : 'with_origin_country';
    const targetType = TMDB_KEY_TO_DNA_TYPE[tmdbKey];
    if (targetType) {
      const name = dnaLookup.get(`${targetType}:${id}`);
      if (name) return name;
    }
    
    // 4. Fallback: prefix + ID formatted presentably
    const prefixLabels: Record<string, string> = { g: 'Genere', k: 'Keyword', d: 'Regista', a: 'Attore', o: 'Paese', n: 'Network', c: 'Casa' };
    const rawFallback = `${prefixLabels[prefix] || prefix} #${id}`;
    return formatDnaLabel(rawFallback, vectorKey);
  };

  const toggleHeroCatalog = (fullCatalogId: string, isEnabled: boolean) => {
    const currentPresets = profile.raw_ui_state?.selectedPresets || [];
    const currentCatalogOrder = profile.raw_ui_state?.catalogOrder || [];

    const newPresets = isEnabled
      ? (currentPresets.includes(fullCatalogId) ? currentPresets : [...currentPresets, fullCatalogId])
      : currentPresets.filter((id) => id !== fullCatalogId);

    const newCatalogOrder = isEnabled
      ? (currentCatalogOrder.includes(fullCatalogId) ? currentCatalogOrder : [...currentCatalogOrder, fullCatalogId])
      : currentCatalogOrder.filter((id) => id !== fullCatalogId);

    onUpdateProfile(profile.id, {
      raw_ui_state: {
        ...profile.raw_ui_state,
        selectedPresets: newPresets,
        catalogOrder: newCatalogOrder,
      },
    });
  };

  const fetchAnalytics = useCallback(async () => {
    try {
      if (!activeUserId) return;
      const data = await api.getProfileAnalytics(profile.id, activeUserId);
      if (data && !data.error) {
        setAnalytics(data);
        if (data.heroCatalogs) {
          registerHeroCatalogs(data.heroCatalogs);
        }
      }
    } catch {
      // Analytics fetch failed — non-blocking
    }
  }, [profile.id, activeUserId]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      if (!activeUserId) return;
      const status = await api.getSyncStatus(profile.id, activeUserId);

      // Store compiled vectors for DNA display
      if (status?.compiledVectors && Object.keys(status.compiledVectors).length > 0) {
        setCompiledVectors({
          ...status.compiledVectors,
          idNames: status.idNames || {}
        });
      }

      setLocalIsSyncing(status.isSyncing || false);
    } catch (e) {
      console.error('Failed to fetch sync status', e);
    }
  }, [profile.id, activeUserId]);

  useEffect(() => {
    fetchAnalytics();
    fetchSyncStatus();
  }, [fetchAnalytics, fetchSyncStatus]);

  // Polling during sync
  useEffect(() => {
    let interval: NodeJS.Timeout;
    if (localIsSyncing) {
      interval = setInterval(fetchSyncStatus, 2000);
    }
    return () => clearInterval(interval);
  }, [localIsSyncing, fetchSyncStatus]);

  // Ricarica i dati quando il sync FINISCE
  const wasSyncingRef = useRef(false);
  useEffect(() => {
    if (wasSyncingRef.current && !localIsSyncing) {
      fetchAnalytics();
    }
    wasSyncingRef.current = localIsSyncing;
  }, [localIsSyncing, fetchAnalytics]);

  /**
   * Gruppi mostrati nel grafico: generi dal vettore DNA + studi dalla libreria.
   */
  const dnaGroups: DnaCategoryGroup[] = useMemo(() => {
    const finalVector = compiledVectors?.V_final && Object.keys(compiledVectors.V_final).length > 0
      ? compiledVectors.V_final
      : compiledVectors?.V_static;

    const genreGroups = finalVector && Object.keys(finalVector).length > 0
      ? groupDnaItems(finalVector, getDnaName, { maxItemsPerCategory: 8, allowedCategories: ['genres'] })
      : [];

    const studioItems = (analytics?.studios || []).map(studio => ({
      id: studio.id,
      type: 'company',
      weight: studio.weight,
      name: studio.name,
    }));

    const studioGroups = studioItems.length > 0
      ? groupDnaItems(studioItems, null, { maxItemsPerCategory: 6, allowedCategories: ['companies'] })
      : [];

    return [...genreGroups, ...studioGroups];
  }, [compiledVectors, getDnaName, analytics]);

  return (
    <div className="flex flex-col gap-6 sm:gap-10 w-full">
      {/* ── Section 1: DNA Tracker & Editor (mostrata solo se sono presenti dati di DNA per non lasciare vuoti etichettati) ── */}
      {dnaGroups.length > 0 && (
        <section className="flex flex-col gap-4 sm:gap-6">
          <div className="flex items-center justify-between gap-2 sm:gap-3 text-primary">
            <div className="flex items-center gap-2 sm:gap-3">
              <BrainCircuit className="h-5 w-5 sm:h-6 sm:w-6" />
              <h2 className="text-sm sm:text-lg font-black uppercase tracking-widest text-marrow-deep">DNA Tracker & Editor</h2>
            </div>
          </div>
          <p className="text-xs text-marrow-light/70 -mt-2 font-medium">
            Il tuo DNA viene calcolato istantaneamente dai preset selezionati e si evolve man mano che guardi film e serie tv.
          </p>

          <div className="flex flex-col gap-6 items-center w-full">
            <div className="w-full flex justify-center py-2">
              <DnaBarChart groups={dnaGroups} />
            </div>
          </div>
        </section>
      )}

      {/* ── Section 2: DNA Engine ── */}
      <section className="flex flex-col gap-4 sm:gap-6">
        <div className="flex items-center gap-2 sm:gap-3 text-primary">
          <Terminal className="h-5 w-5 sm:h-6 sm:w-6" />
          <h2 className="text-sm sm:text-lg font-black uppercase tracking-widest text-marrow-deep">DNA Engine</h2>
        </div>

        <div className="flex flex-col gap-4 sm:gap-6">
          {/* ── Manopole del Motore (Assi di Modulazione del Grafo) ── */}
          <div className="glass-card rounded-2xl overflow-hidden flex flex-col shadow-sm border border-marrow-light/10">
            <div className="px-4 py-3 border-b border-marrow-light/10 bg-white/40">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-primary" />
                  <span className="text-sm font-black text-marrow-deep">Manopole del Motore</span>
                  <span className="text-xs font-mono font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                    Modulazione Attivazione
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span className="text-xs font-mono font-medium text-marrow-light/70 flex items-center gap-1.5 min-w-[85px] justify-end">
                    {saveStatus === 'saving' && (
                      <>
                        <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
                        <span>salvataggio…</span>
                      </>
                    )}
                    {saveStatus === 'saved' && (
                      <>
                        <span className="h-2 w-2 rounded-full bg-emerald-500" />
                        <span>salvato</span>
                      </>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={handleResetSliders}
                    className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold text-marrow-light/80 hover:text-primary transition-colors cursor-pointer px-2.5 py-1 rounded-lg hover:bg-white/60 border border-transparent hover:border-marrow-light/10 min-h-[44px] touch-manipulation"
                    title="Ripristina valori predefiniti"
                  >
                    <RotateCcw className="h-3 w-3" />
                    <span>Ripristina Default</span>
                  </button>
                </div>
              </div>
              <p className="text-xs text-marrow-light/70 mt-1.5 leading-relaxed font-normal">
                Gli assi governano la camminata sul grafo e <strong>modulano l&apos;attivazione</strong> dei mondi: circa un terzo dei titoli cambia composizione lungo il percorso, senza svuotare le liste né imporre filtri rigidi.
              </p>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Slider 1: Cozy / Impegnativo */}
              <div className="bg-white/50 border border-marrow-light/10 rounded-xl p-3 sm:p-4 flex flex-col justify-between gap-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-black text-marrow-deep uppercase tracking-wider">Tonalità</span>
                    <span className="ml-1 text-xs font-mono text-marrow-light/60">(cozy)</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded shrink-0">
                    {shownSliders.cozy < -0.05
                      ? `Impegnativo (${shownSliders.cozy.toFixed(1)})`
                      : shownSliders.cozy > 0.05
                      ? `Cozy (+${shownSliders.cozy.toFixed(1)})`
                      : 'Neutro (0.0)'}
                  </span>
                </div>
                <div className="py-1">
                  <Slider
                    min={-1}
                    max={1}
                    step={0.1}
                    value={[shownSliders.cozy]}
                    onValueChange={([val]) => handleSliderMove('cozy', val)}
                  />
                </div>
                <div className="flex justify-between items-center text-xs font-mono text-marrow-light/70 font-medium">
                  <span>Impegnativo (-1.0)</span>
                  <span>Neutro (0.0)</span>
                  <span>Cozy (+1.0)</span>
                </div>
                <p className="text-xs text-marrow-light/70 leading-snug">
                  Bilancia il peso verso documentari/storia/guerra (-1) o commedia/famiglia/animazione (+1). Circa un terzo dei titoli modula il tono.
                </p>
              </div>

              {/* Slider 2: Canone */}
              <div className="bg-white/50 border border-marrow-light/10 rounded-xl p-3 sm:p-4 flex flex-col justify-between gap-3 shadow-sm">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-black text-marrow-deep uppercase tracking-wider">Notorietà</span>
                    <span className="ml-1 text-xs font-mono text-marrow-light/60">(canone)</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded shrink-0">
                    {shownSliders.canone < -0.05
                      ? `Poco nota (${shownSliders.canone.toFixed(1)})`
                      : shownSliders.canone > 0.05
                      ? `Molto nota (+${shownSliders.canone.toFixed(1)})`
                      : 'Come da storico (0.0)'}
                  </span>
                </div>
                <div className="py-1">
                  <Slider
                    min={-1}
                    max={1}
                    step={0.1}
                    value={[shownSliders.canone]}
                    onValueChange={([val]) => handleSliderMove('canone', val)}
                  />
                </div>
                <div className="flex justify-between items-center text-xs font-mono text-marrow-light/70 font-medium">
                  <span>Poco nota (-1.0)</span>
                  <span>Come da storico (0.0)</span>
                  <span>Molto nota (+1.0)</span>
                </div>
                <p className="text-xs text-marrow-light/70 leading-snug">
                  Sposta la finestra attorno al canone dedotto dallo storico (DELTA_FASCIA calibrato a 1.0, ~2.7x di fattore). Modula senza escludere.
                </p>
              </div>
            </div>
          </div>

          {heroListItems.length === 0 ? (
            <div className="glass-card rounded-2xl p-6 sm:p-10 border border-marrow-light/10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
              <div className="text-3xl">📚</div>
              <div className="text-sm font-black text-marrow-deep">Nessuno scaffale generato per questo profilo</div>
              <p className="text-xs text-marrow-light/70 max-w-md leading-relaxed font-normal">
                Gli scaffali del motore nascono dalla tua cronologia e dai tuoi gusti reali. Guarda qualche titolo o sincronizza la tua libreria Stremio/Trakt per far emergere i tuoi primi scaffali tematici.
              </p>
            </div>
          ) : (
            heroListItems.map((item) => {
              const isEnabled = (profile.raw_ui_state?.selectedPresets ?? []).includes(item.id);
              const switchId = `${item.id}-switch`;
              const { badge: mediumBadge, switchLabel } = getShelfBadge(item);
              const isInfoOpen = openInfoCatalogId === item.id;
              const seeds = formatShelfSeeds(item);

              return (
                <div
                  key={item.id}
                  className="glass-card rounded-2xl overflow-hidden flex flex-col shadow-sm border border-marrow-light/10"
                >
                  <div className="px-4 py-3 border-b border-marrow-light/10 bg-white/40">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{item.emoji}</span>
                        <span className="text-sm font-black text-marrow-deep">{item.label || item.idBase}</span>
                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-primary bg-primary/10 border border-primary/20 px-2 py-0.5 rounded">
                          {mediumBadge}
                        </span>
                      </div>
                      <div className="flex items-center gap-2.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => toggleCatalogInfo(item.id)}
                          className={`inline-flex items-center justify-center p-1.5 rounded-lg border transition-colors cursor-pointer min-h-[36px] min-w-[36px] ${
                            isInfoOpen
                              ? 'bg-primary/15 text-primary border-primary/30'
                              : 'bg-white/60 text-marrow-light/70 hover:text-primary hover:bg-white border-marrow-light/10'
                          }`}
                          title="Dettagli attivazione e semi del profilo"
                          aria-label="Info semi catalogo"
                        >
                          <Info className="h-4 w-4" />
                        </button>
                        <label htmlFor={switchId} className="inline-flex items-center gap-1.5 text-xs font-bold font-mono text-marrow-light/80 cursor-pointer">
                          {switchLabel}
                          <Switch
                            id={switchId}
                            checked={isEnabled}
                            onCheckedChange={(checked: boolean) => toggleHeroCatalog(item.id, checked)}
                          />
                        </label>
                      </div>
                    </div>
                    {item.desc && (
                      <p className="text-xs text-marrow-light/70 mt-1 leading-relaxed">
                        {item.desc}
                      </p>
                    )}

                    {/* Pannello Info Dettagli e Semi che hanno attivato lo scaffale */}
                    {isInfoOpen && (
                      <div className="mt-3 pt-3 border-t border-marrow-light/10 flex flex-col gap-2.5">
                        <div className="flex flex-wrap items-center gap-2 sm:gap-3 text-xs font-mono">
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-marrow-deep">Fonte:</span>
                            <span className="px-1.5 py-0.5 rounded bg-white/70 border border-marrow-light/15 text-primary font-semibold">
                              {item.nome_fonte || 'tassonomia'}
                            </span>
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="font-bold text-marrow-deep">Medium:</span>
                            <span className="px-1.5 py-0.5 rounded bg-white/70 border border-marrow-light/15 text-marrow-deep font-semibold">
                              {item.type === 'movie' ? 'film' : (item.anime ? 'anime (serie)' : 'serie')}
                            </span>
                          </div>
                          {typeof item.confidenza === 'number' && (
                            <div className="flex items-center gap-1 text-marrow-light/70">
                              <span className="font-bold text-marrow-deep">Confidenza:</span>
                              <span>{item.confidenza.toFixed(2)}</span>
                            </div>
                          )}
                        </div>

                        <div className="flex flex-col gap-1.5">
                          <div className="flex items-center justify-between text-[11px] font-bold uppercase tracking-wider text-marrow-deep">
                            <span>Titoli del tuo profilo che hanno attivato lo scaffale</span>
                            <span className="font-mono text-marrow-light/60">({seeds.length})</span>
                          </div>
                          {seeds.length === 0 ? (
                            <p className="text-xs text-marrow-light/60 italic py-1">Nessun seme registrato per questo scaffale.</p>
                          ) : (
                            <div className="flex flex-col divide-y divide-marrow-light/10 bg-white/60 rounded-xl border border-marrow-light/15 overflow-hidden">
                              {seeds.map((seed, idx) => (
                                <div key={`${seed.tmdbId || seed.titolo}-${idx}`} className="px-3 py-1.5 flex items-center justify-between gap-2 text-xs">
                                  <div className="flex items-center gap-1.5 min-w-0">
                                    <span className="font-semibold text-marrow-deep truncate">{seed.titolo}</span>
                                    {seed.anno && (
                                      <span className="text-marrow-light/60 font-mono shrink-0">({seed.anno})</span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] font-mono text-marrow-light/70 shrink-0">
                                    {typeof seed.plays === 'number' && (
                                      <span className="bg-primary/10 text-primary px-1.5 py-0.5 rounded">
                                        {seed.plays === 1 ? '1 visione' : `${seed.plays} visioni`}
                                      </span>
                                    )}
                                    {typeof seed.eta_giorni === 'number' && (
                                      <span>
                                        {seed.eta_giorni <= 0 ? 'oggi' : seed.eta_giorni === 1 ? '1 giorno fa' : `${seed.eta_giorni} giorni fa`}
                                      </span>
                                    )}
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="p-4 flex-grow flex flex-col gap-4">
                    {!isEnabled ? (
                      <div className="rounded-xl bg-white/30 border border-dashed border-marrow-light/20 p-3 sm:p-6 min-h-[80px] sm:min-h-[140px] flex flex-col items-center justify-center text-center">
                        <EyeOff className="h-8 w-8 text-marrow-light/30 mb-2" />
                        <p className="text-xs font-bold uppercase tracking-wider text-marrow-light/60">
                          Catalogo disattivato
                        </p>
                        <p className="text-xs text-marrow-light/60 mt-1">
                          Attiva il catalogo per visualizzare l&apos;anteprima dal vivo.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="text-xs font-bold text-marrow-light/70 uppercase tracking-widest">Anteprima</span>
                        </div>
                        <CatalogLivePreview 
                          catalogId={item.id} 
                          userId={activeUserId!} 
                          profileId={profile.id}
                          sliders={previewSliders}
                        />
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </section>
    </div>
  );
}
