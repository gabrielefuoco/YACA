'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Profile, DNAItem, AnalyticsData, SyncStatus, CompiledVector } from '@/types';
import { api } from '@/lib/api';
import { X, BrainCircuit, Terminal, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { AutocompleteSearch } from '@/components/shared/AutocompleteSearch';
import { OrbitalDnaGraph } from './OrbitalDnaGraph';
import { CatalogLivePreview } from './CatalogLivePreview';

const HERO_CATALOGS_BASE = [
  { idBase: 'yaca_true_blend', label: 'True Blend', emoji: '🎯', type: 'ai', desc: 'Ricerca semantica AI + Scoring algoritmico.' },
  { idBase: 'yaca_seed_network', label: 'Seed Network', emoji: '🕸️', type: 'algo', desc: 'Espande la rete dei titoli amati (Stacking).' },
  { idBase: 'yaca_hidden_gems', label: 'Hidden Gems', emoji: '💎', type: 'ai', desc: 'Ricerca AI di nicchia + Quality Cage algoritmica.' },
  { idBase: 'yaca_trakt_filtered', label: 'Trakt Filtered', emoji: '🌐', type: 'algo', desc: 'Suggerimenti community filtrati col tuo DNA.' },
];

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
  syncProfileVectors?: (profileId: string, userId: string) => Promise<unknown>;
}

// Removed redundant SyncStatus

export function DnaAndAiPanel({ profile, onUpdateProfile, syncStatus, userId, syncProfileVectors }: DnaAndAiPanelProps) {
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
  const [manualScore, setManualScore] = useState<number>(200);
  const [localIsSyncing, setLocalIsSyncing] = useState<boolean>(false);

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
    
    // 4. Fallback: prefix + ID
    const prefixLabels: Record<string, string> = { g: 'Genere', k: 'Keyword', d: 'Regista', a: 'Attore', o: 'Paese' };
    return `${prefixLabels[prefix] || prefix} ${id}`;
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

  useEffect(() => {
    if (!localIsSyncing) {
      fetchAnalytics();
    }
  }, [fetchAnalytics, localIsSyncing]);

  // Aggiornamento DNA manuale rimosso in favore del delta update automatico backend.



  const handleAddManualDna = (item: DNAItem) => {
    const currentManual = profile.settings?.manualDNA ?? [];
    if (currentManual.some((d) => String(d.id) === String(item.id) && d.type === item.type)) return;
    const updatedManual = [...currentManual, item];
    onUpdateProfile(profile.id, {
      settings: {
        ...(profile.settings ?? {}),
        manualDNA: updatedManual,
      },
    });
  };

  const handleRemoveManualDna = (item: DNAItem) => {
    const currentManual = profile.settings?.manualDNA ?? [];
    const updatedManual = currentManual.filter(
      (d) => !(String(d.id) === String(item.id) && d.type === item.type)
    );
    onUpdateProfile(profile.id, {
      settings: {
        ...(profile.settings ?? {}),
        manualDNA: updatedManual,
      },
    });
  };

  const handleSync = async () => {
    if (!syncProfileVectors || !activeUserId) return;
    try {
      setLocalIsSyncing(true);
      await syncProfileVectors(profile.id, activeUserId);
    } catch (err) {
      console.error('Errore durante la ricalcolazione dei vettori:', err);
      setLocalIsSyncing(false);
    }
  };




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
        <p className="text-[11px] text-marrow-light/40 -mt-2">
          Il tuo DNA viene calcolato istantaneamente dai preset selezionati e si evolve man mano che guardi film e serie tv.
        </p>

        {/* DNA Dinamico (V_static e V_final) */}
        {compiledVectors && (Object.keys(compiledVectors.V_static || {}).length > 0 || Object.keys(compiledVectors.V_final || {}).length > 0) ? (
          <div className="flex flex-col gap-6 items-center w-full">
            <div className="w-full flex justify-center py-2">
               <OrbitalDnaGraph 
                 compiledVectors={compiledVectors}
                 getDnaName={getDnaName}
               />
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
          {HERO_CATALOGS_BASE.map((catalog) => {
            const idMovies = `${catalog.idBase}_movies`;
            const idSeries = `${catalog.idBase}_series`;
            const movieSwitchId = `${catalog.idBase}-switch-movies`;
            const seriesSwitchId = `${catalog.idBase}-switch-series`;
            const selectedPresets = profile.raw_ui_state?.selectedPresets ?? [];
            const isMoviesEnabled = selectedPresets.includes(idMovies);
            const isSeriesEnabled = selectedPresets.includes(idSeries);
            const isCatalogDisabled = !isMoviesEnabled && !isSeriesEnabled;
            
            // Tolerance Meter logic
            let toleranceColor = 'bg-primary';
            let toleranceLabel = 'Bilanciata';
            let toleranceDesc = 'Mantiene un buon equilibrio tra il tuo DNA e titoli molto popolari.';
            let activeId = isMoviesEnabled ? idMovies : idSeries;

            if (catalog.idBase.includes('hidden_gems')) {
              toleranceColor = 'bg-red-500';
              toleranceLabel = 'Severità Alta (0.3x)';
              toleranceDesc = 'Scarta quasi tutto ciò che non fa match esatto col tuo DNA. Mostra solo veri "diamanti grezzi".';
            } else if (catalog.idBase.includes('true_blend')) {
              toleranceColor = 'bg-orange-500';
              toleranceLabel = 'Severità Media (0.6x)';
              toleranceDesc = 'Penalizza i generi che non ti piacciono ma conserva grandi classici e blockbuster affini.';
            }

            return (
              <div
                key={catalog.idBase}
                className="glass-panel rounded-xl overflow-hidden flex flex-col shadow-lg shadow-marrow-light/5"
              >
                <div className="px-4 py-3 border-b border-marrow-light/10 bg-marrow-light/5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{catalog.emoji}</span>
                      <span className="text-sm font-bold text-marrow-light">{catalog.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <label htmlFor={movieSwitchId} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-marrow-light/60 font-mono">
                        FILM
                        <Switch id={movieSwitchId} checked={isMoviesEnabled} onCheckedChange={(checked: boolean) => toggleHeroCatalog(idMovies, checked)} />
                      </label>
                      <label htmlFor={seriesSwitchId} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-marrow-light/60 font-mono">
                        SERIE
                        <Switch id={seriesSwitchId} checked={isSeriesEnabled} onCheckedChange={(checked: boolean) => toggleHeroCatalog(idSeries, checked)} />
                      </label>
                    </div>
                  </div>
                  <p className="text-xs text-marrow-light/50 mt-1 leading-relaxed">
                    {catalog.desc}
                  </p>
                </div>
                <div className="p-4 flex-grow flex flex-col gap-4">
                  {isCatalogDisabled ? (
                    <div className="rounded-lg bg-marrow-light/5 border border-marrow-light/10 p-6 min-h-[140px] flex flex-col items-center justify-center text-center opacity-70">
                      <EyeOff className="h-8 w-8 text-marrow-light/20 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-marrow-light/40">
                        Catalogo disattivato
                      </p>
                      <p className="text-[10px] text-marrow-light/40 mt-1">
                        Attiva Film o Serie per visualizzare l'anteprima dal vivo.
                      </p>
                    </div>
                  ) : (
                    <>
                      {/* Tolerance Meter */}
                      <div className="w-full bg-marrow-light/5 border border-marrow-light/10 rounded-lg p-3">
                        <div className="flex justify-between items-center mb-2">
                          <span className="text-[10px] font-bold text-marrow-light/60 uppercase tracking-widest">Filtro Alien Ratio</span>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded text-white ${toleranceColor}`}>{toleranceLabel}</span>
                        </div>
                        <div className="w-full h-1.5 bg-marrow-light/20 rounded-full overflow-hidden mb-2">
                          <div className={`h-full ${toleranceColor}`} style={{ width: catalog.idBase.includes('hidden_gems') ? '90%' : catalog.idBase.includes('true_blend') ? '50%' : '20%' }} />
                        </div>
                        <p className="text-[10px] text-marrow-light/40">{toleranceDesc}</p>
                      </div>

                      {/* Live Preview */}
                      <div className="flex flex-col gap-2">
                         <div className="flex items-center justify-between">
                           <span className="text-[10px] font-bold text-marrow-light/60 uppercase tracking-widest">Anteprima (DuckDB + VSM)</span>
                           {isMoviesEnabled && isSeriesEnabled && (
                             <span className="text-[9px] text-primary bg-primary/10 px-1.5 py-0.5 rounded">Mostrando: {activeId.includes('movies') ? 'Film' : 'Serie'}</span>
                           )}
                         </div>
                         <CatalogLivePreview 
                           catalogId={activeId} 
                           userId={activeUserId!} 
                           profileId={profile.id} 
                         />
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
