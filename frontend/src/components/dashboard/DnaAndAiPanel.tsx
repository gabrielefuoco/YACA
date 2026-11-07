'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Profile, DNAItem, AnalyticsData, SyncStatus, CompiledVector, HeroCatalogUiGroup, EngineSliders, DEFAULT_ENGINE_SLIDERS } from '@/types';
import { api } from '@/lib/api';
import { BrainCircuit, Terminal, EyeOff, Sliders, RotateCcw } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { Slider } from '@/components/ui/slider';
import { DnaBarChart } from './DnaBarChart';
import { formatDnaLabel, groupDnaItems, DnaCategoryGroup } from '@/lib/dnaChart';
import { CatalogLivePreview } from './CatalogLivePreview';
import { registerHeroCatalogs } from '@/lib/catalogKind';

const TMDB_KEY_TO_DNA_TYPE: Record<string, DNAItem['type']> = {
  with_genres: 'genre',
  with_keywords: 'keyword',
  with_origin_country: 'country',
};

const TMDB_KEY_BADGE_LABEL: Record<string, { icon: string; name: string }> = {
  with_genres: { icon: '🎭', name: 'Genere' },
  with_keywords: { icon: '🏷️', name: 'Keyword' },
  with_origin_country: { icon: '🌍', name: 'Paese' },
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

// Removed redundant SyncStatus

export function DnaAndAiPanel({ profile, onUpdateProfile, syncStatus, userId }: DnaAndAiPanelProps) {
  const activeUserId = userId || (typeof window !== 'undefined' ? localStorage.getItem('yaca_user_id') : null);
  const suggestedDNA: DNAItem[] = profile?.settings?.suggestedDNA ?? [];
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
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [compiledVectors, setCompiledVectors] = useState<(CompiledVector & { idNames?: Record<string, string> }) | null>(null);
  const [localIsSyncing, setLocalIsSyncing] = useState<boolean>(false);

  const activeSliders: EngineSliders = useMemo(() => {
    const raw = profile?.settings?.sliders ?? profile?.sliders;
    return {
      cozy: typeof raw?.cozy === 'number' ? raw.cozy : DEFAULT_ENGINE_SLIDERS.cozy,
      canone: typeof raw?.canone === 'number' ? raw.canone : DEFAULT_ENGINE_SLIDERS.canone,
    };
  }, [profile?.settings?.sliders, profile?.sliders]);

  // Durante il trascinamento la verità è locale: se leggessimo il profilo, la manopola tornerebbe
  // indietro a ogni passo (il profilo si aggiorna solo al rilascio). Scrittura su onValueCommit.
  const [draftSliders, setDraftSliders] = useState<EngineSliders | null>(null);
  const shownSliders: EngineSliders = draftSliders ?? activeSliders;

  useEffect(() => {
    setDraftSliders(null);
  }, [activeSliders]);

  const handleSliderDraft = (key: keyof EngineSliders, value: number) => {
    setDraftSliders({ ...shownSliders, [key]: value });
  };

  const handleSliderChange = (key: keyof EngineSliders, value: number) => {
    const updatedSliders: EngineSliders = {
      ...activeSliders,
      [key]: value,
    };
    onUpdateProfile(profile.id, {
      sliders: updatedSliders,
      settings: {
        ...(profile.settings ?? {}),
        sliders: updatedSliders,
      },
    });
  };

  const handleResetSliders = () => {
    onUpdateProfile(profile.id, {
      sliders: { ...DEFAULT_ENGINE_SLIDERS },
      settings: {
        ...(profile.settings ?? {}),
        sliders: { ...DEFAULT_ENGINE_SLIDERS },
      },
    });
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
    setAnalyticsLoading(true);
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
    } finally {
      setAnalyticsLoading(false);
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

  // Ricarica i dati quando il sync FINISCE, non al mount: al mount ha già caricato l'effetto sopra.
  // (Prima questo effetto partiva anche subito, perché localIsSyncing parte false: due GET.)
  const wasSyncingRef = useRef(false);
  useEffect(() => {
    if (wasSyncingRef.current && !localIsSyncing) {
      fetchAnalytics();
    }
    wasSyncingRef.current = localIsSyncing;
  }, [localIsSyncing, fetchAnalytics]);

  // L'aggiornamento manuale del DNA è stato rimosso: il backend fa delta update automatico.




  /**
   * Gruppi mostrati nel grafico: generi dal vettore DNA + studi dalla libreria.
   * Keyword, persone e nodi interni del grafo restano fuori (solo codici TMDB).
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
      {/* ── Section 1: DNA Tracker & Editor ── */}
      <section className="flex flex-col gap-4 sm:gap-6">
        <div className="flex items-center justify-between gap-2 sm:gap-3 text-primary">
          <div className="flex items-center gap-2 sm:gap-3">
            <BrainCircuit className="h-5 w-5 sm:h-6 sm:w-6" />
            <h2 className="text-sm sm:text-lg font-black uppercase tracking-widest">DNA Tracker & Editor</h2>
          </div>
        </div>
        <p className="text-xs text-marrow-light/40 -mt-2">
          Il tuo DNA viene calcolato istantaneamente dai preset selezionati e si evolve man mano che guardi film e serie tv.
        </p>

        {/* DNA Dinamico (V_static e V_final) */}
        {dnaGroups.length > 0 ? (
          <div className="flex flex-col gap-6 items-center w-full">
            <div className="w-full flex justify-center py-2">
               <DnaBarChart groups={dnaGroups} />
            </div>
          </div>
        ) : (
          <div className="glass-panel p-5 border border-marrow-light/10">
            <p className="text-xs text-marrow-light/40 italic">DNA non ancora calcolato. Seleziona dei preset e salva il profilo.</p>
          </div>
        )}


      </section>

      {/* ── Section 2: DNA Engine ── */}
      <section className="flex flex-col gap-4 sm:gap-6">
        <div className="flex items-center gap-2 sm:gap-3 text-primary">
          <Terminal className="h-5 w-5 sm:h-6 sm:w-6" />
          <h2 className="text-sm sm:text-lg font-black uppercase tracking-widest">DNA Engine</h2>
        </div>


        <div className="flex flex-col gap-4 sm:gap-6">
          {/* ── Manopole del Motore (Assi di Modulazione del Grafo) ── */}
          <div className="glass-panel rounded-xl overflow-hidden flex flex-col shadow-lg shadow-marrow-light/5 border border-marrow-light/10">
            <div className="px-4 py-3 border-b border-marrow-light/10 bg-marrow-light/5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Sliders className="h-5 w-5 text-primary" />
                  <span className="text-sm font-bold text-marrow-light">Manopole del Motore</span>
                  <span className="text-xs font-mono uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                    Modulazione Attivazione
                  </span>
                </div>
                <button
                  type="button"
                  onClick={handleResetSliders}
                  className="inline-flex items-center gap-1.5 text-xs font-mono text-marrow-light/70 hover:text-primary transition-colors cursor-pointer px-2 rounded hover:bg-marrow-light/5 min-h-[44px] touch-manipulation"
                  title="Ripristina valori predefiniti"
                >
                  <RotateCcw className="h-3 w-3" />
                  <span>Ripristina Default</span>
                </button>
              </div>
              <p className="text-xs text-marrow-light/50 mt-1.5 leading-relaxed">
                Gli assi governano la camminata sul grafo e <strong>modulano l&apos;attivazione</strong> dei mondi: circa un terzo dei titoli cambia composizione lungo il percorso, senza svuotare le liste né imporre filtri rigidi.
              </p>
            </div>

            <div className="p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
              {/* Slider 1: Cozy / Impegnativo */}
              <div className="bg-marrow-light/5 border border-marrow-light/10 rounded-lg p-3 sm:p-4 flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <span className="text-xs font-bold text-marrow-light uppercase tracking-wider">Tonalità</span>
                    <span className="ml-1 text-xs font-mono text-marrow-light/40">(cozy)</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
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
                    onValueChange={([val]) => handleSliderDraft('cozy', val)}
                    onValueCommit={([val]) => handleSliderChange('cozy', val)}
                  />
                </div>
                <div className="flex justify-between items-center text-xs font-mono text-marrow-light/50">
                  <span>Impegnativo (-1.0)</span>
                  <span>Neutro (0.0)</span>
                  <span>Cozy (+1.0)</span>
                </div>
                <p className="text-xs text-marrow-light/40 leading-snug">
                  Bilancia il peso verso documentari/storia/guerra (-1) o commedia/famiglia/animazione (+1). Circa un terzo dei titoli modula il tono.
                </p>
              </div>

              {/* Slider 2: Canone */}
              <div className="bg-marrow-light/5 border border-marrow-light/10 rounded-lg p-3 sm:p-4 flex flex-col justify-between gap-3">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    {/* «Notorietà» e non «Popolarità»: il cursore non sposta verso i titoli più amati,
                        sposta il baricentro attorno alla mediana dei voti dello storico — da un titolo che
                        conoscono in pochi a uno che conoscono tutti. Il campo resta `canone` ovunque
                        (API, impostazioni, chiavi di cache): cambia solo l'etichetta visibile. */}
                    <span className="text-xs font-bold text-marrow-light uppercase tracking-wider">Notorietà</span>
                    <span className="ml-1 text-xs font-mono text-marrow-light/40">(canone)</span>
                  </div>
                  <span className="text-xs font-mono font-bold text-primary bg-primary/10 px-2 py-0.5 rounded shrink-0">
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
                    onValueChange={([val]) => handleSliderDraft('canone', val)}
                    onValueCommit={([val]) => handleSliderChange('canone', val)}
                  />
                </div>
                <div className="flex justify-between items-center text-xs font-mono text-marrow-light/50">
                  <span>Poco nota (-1.0)</span>
                  <span>Come da storico (0.0)</span>
                  <span>Molto nota (+1.0)</span>
                </div>
                <p className="text-xs text-marrow-light/40 leading-snug">
                  Sposta la finestra attorno al canone dedotto dallo storico (DELTA_FASCIA calibrato a 1.0, ~2.7x di fattore). Modula senza escludere.
                </p>
              </div>
            </div>
          </div>

          {heroListItems.length === 0 ? (
            <div className="glass-panel rounded-xl p-6 sm:p-10 border border-marrow-light/10 text-center flex flex-col items-center justify-center gap-3">
              <div className="text-3xl">📚</div>
              <div className="text-sm font-bold text-marrow-light">Nessuno scaffale generato per questo profilo</div>
              <p className="text-xs text-marrow-light/60 max-w-md leading-relaxed">
                Gli scaffali del motore nascono dalla tua cronologia e dai tuoi gusti reali. Guarda qualche titolo o sincronizza la tua libreria Stremio/Trakt per far emergere i tuoi primi scaffali tematici.
              </p>
            </div>
          ) : (
            heroListItems.map((item) => {
              const isEnabled = (profile.raw_ui_state?.selectedPresets ?? []).includes(item.id);
              const switchId = `${item.id}-switch`;
              const mediumBadge = item.type === 'movie' ? 'Film' : 'Serie';
              const switchLabel = item.type === 'movie' ? 'FILM' : 'SERIE';

              return (
                <div
                  key={item.id}
                  className="glass-panel rounded-xl overflow-hidden flex flex-col shadow-lg shadow-marrow-light/5"
                >
                  <div className="px-4 py-3 border-b border-marrow-light/10 bg-marrow-light/5">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{item.emoji}</span>
                        <span className="text-sm font-bold text-marrow-light">{item.label || item.idBase}</span>
                        <span className="text-xs font-mono font-bold uppercase tracking-wider text-primary bg-primary/10 px-2 py-0.5 rounded">
                          {mediumBadge}
                        </span>
                      </div>
                      <div className="flex items-center gap-3 shrink-0">
                        <label htmlFor={switchId} className="inline-flex items-center gap-1.5 text-xs font-bold font-mono text-marrow-light/60">
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
                      <p className="text-xs text-marrow-light/50 mt-1 leading-relaxed">
                        {item.desc}
                      </p>
                    )}
                  </div>
                  <div className="p-4 flex-grow flex flex-col gap-4">
                    {!isEnabled ? (
                      <div className="rounded-lg bg-marrow-light/5 border border-marrow-light/10 p-3 sm:p-6 min-h-[80px] sm:min-h-[140px] flex flex-col items-center justify-center text-center opacity-70">
                        <EyeOff className="h-8 w-8 text-marrow-light/20 mb-2" />
                        <p className="text-xs font-bold uppercase tracking-wider text-marrow-light/40">
                          Catalogo disattivato
                        </p>
                        <p className="text-xs text-marrow-light/40 mt-1">
                          Attiva il catalogo per visualizzare l&apos;anteprima dal vivo.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col gap-2">
                        <div className="flex flex-wrap items-center justify-between gap-1.5">
                          <span className="text-xs font-bold text-marrow-light/60 uppercase tracking-widest">Anteprima (DuckDB + VSM)</span>
                        </div>
                        <CatalogLivePreview 
                          catalogId={item.id} 
                          userId={activeUserId!} 
                          profileId={profile.id} 
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
