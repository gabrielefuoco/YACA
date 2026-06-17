'use client';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { Profile, DNAItem, AnalyticsData, SyncStatus, CompiledVector } from '@/types';
import { api } from '@/lib/api';
import { X, BrainCircuit, Terminal, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { DnaRadarChart } from './DnaRadarChart';

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
  const [showProgressModal, setShowProgressModal] = useState(false);
  const [compiledVectors, setCompiledVectors] = useState<(CompiledVector & { idNames?: Record<string, string> }) | null>(null);

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

  const parseAndDeduplicateIds = (rawValue: unknown) => {
    if (typeof rawValue !== 'string' && typeof rawValue !== 'number') {
      return [];
    }
    return [...new Set(String(rawValue).split('|').map((v) => v.trim()).filter(Boolean))];
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

      // Auto-show modal if syncing or if onboarding is pending with suggestions
      if (status.isSyncing) {
        setShowProgressModal(true);
      }
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
    if (syncStatus?.isSyncing) {
      interval = setInterval(fetchSyncStatus, 2000);
    }
    return () => clearInterval(interval);
  }, [syncStatus?.isSyncing, fetchSyncStatus]);

  useEffect(() => {
    if (syncStatus?.isSyncing === false) {
      fetchAnalytics();
    }
  }, [fetchAnalytics, syncStatus?.isSyncing]);

  // Aggiornamento DNA manuale rimosso in favore del delta update automatico backend.

  const handleConfirmDNA = async () => {
    if (!activeUserId) return;
    const res = await api.confirmDNA(profile.id, activeUserId);
    if (res.success) {
      const currentManualDNA = profile.settings?.manualDNA ?? [];
      const mergedManualDNA = [...currentManualDNA];
      const seen = new Set(currentManualDNA.map((item) => `${item.type}:${item.id}`));
      for (const item of suggestedDNA) {
        const key = `${item.type}:${item.id}`;
        if (seen.has(key)) continue;
        mergedManualDNA.push(item);
        seen.add(key);
      }
      onUpdateProfile(profile.id, {
        settings: {
          ...(profile.settings ?? {}),
          manualDNA: mergedManualDNA,
          suggestedDNA: [],
        },
      });
      await fetchSyncStatus();
      setShowProgressModal(false);
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
          <div className="flex flex-col lg:flex-row gap-6 items-center">
            {/* Grafico Radar in primo piano */}
            <div className="w-full lg:w-1/2 flex justify-center py-2">
              <DnaRadarChart
                V_static={compiledVectors.V_static || {}}
                V_final={compiledVectors.V_final || {}}
                getDnaName={getDnaName}
              />
            </div>

            {/* Dettagli DNA (Liste di badge) */}
            <div className="w-full lg:w-1/2 flex flex-col gap-4">
              <div className="glass-panel p-3 sm:p-5 border border-marrow-light/10 flex-grow">
                <p className="text-xs font-bold text-marrow-light/60 mb-3 uppercase tracking-wider">DNA Base (Dai Preset)</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(compiledVectors.V_static || {})
                    .sort(([,a], [,b]) => (b as number) - (a as number))
                    .slice(0, 10)
                    .map(([key, weight]) => {
                      const type = key.charAt(0);
                      const name = getDnaName(key);
                      return (
                        <span key={key} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          type === 'g' ? 'bg-secondary text-marrow-deep border border-primary/20' : 
                          type === 'k' ? 'bg-accent/15 text-marrow-deep border border-accent/20' : 
                          'bg-primary/15 text-marrow-deep border border-primary/20'
                        }`}>
                          {name} <span className="opacity-50 ml-1">({Math.round(weight as number)})</span>
                        </span>
                      )
                    })
                  }
                  {Object.keys(compiledVectors.V_static || {}).length === 0 && (
                    <p className="text-xs text-marrow-light/40 italic">Nessun DNA base. Aggiungi dei preset.</p>
                  )}
                </div>
              </div>

              <div className="glass-panel p-3 sm:p-5 border border-marrow-light/10 relative overflow-hidden flex-grow">
                <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-primary via-secondary to-accent opacity-50"></div>
                <p className="text-xs font-bold text-marrow-light/60 mb-3 uppercase tracking-wider">DNA Evoluto (Base + Storico)</p>
                <div className="flex flex-wrap gap-1.5">
                  {Object.entries(compiledVectors.V_final || {})
                    .sort(([,a], [,b]) => (b as number) - (a as number))
                    .slice(0, 12)
                    .map(([key, weight]) => {
                      const type = key.charAt(0);
                      const name = getDnaName(key);
                      return (
                        <span key={key} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                          type === 'g' ? 'bg-secondary text-marrow-deep border border-primary/20' : 
                          type === 'k' ? 'bg-accent/15 text-marrow-deep border border-accent/20' : 
                          'bg-primary/15 text-marrow-deep border border-primary/20'
                        }`}>
                          {name} <span className="opacity-50 ml-1">({Math.round(weight as number)})</span>
                        </span>
                      )
                    })
                  }
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="glass-panel p-5 border border-marrow-light/10">
            <p className="text-xs text-marrow-light/40 italic">DNA non ancora calcolato. Seleziona dei preset e salva il profilo.</p>
          </div>
        )}




      </section>

      {/* ── Section 2: AI Inspector (Hero Catalogs) ── */}
      <section className="flex flex-col gap-4 sm:gap-6">
        <div className="flex items-center gap-2 sm:gap-3 text-primary">
          <Terminal className="h-5 w-5 sm:h-6 sm:w-6" />
          <h2 className="text-sm sm:text-lg font-black uppercase tracking-widest">Ispettore AI (Hero Catalogs)</h2>
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
            const movieLog = analytics?.aiLogs?.[idMovies];
            const seriesLog = analytics?.aiLogs?.[idSeries];
            const preferredLog = isSeriesEnabled && !isMoviesEnabled ? seriesLog : movieLog;
            const fallbackLog = preferredLog === movieLog ? seriesLog : movieLog;
            const aiLog = preferredLog ?? fallbackLog;

            return (
              <div
                key={catalog.idBase}
                className="glass-panel overflow-hidden flex flex-col shadow-lg shadow-marrow-light/5"
              >
                <div className="px-4 py-3 border-b border-marrow-light/10 bg-marrow-light/5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{catalog.emoji}</span>
                      <span className="text-xs font-bold text-marrow-light">{catalog.label}</span>
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
                  <p className="text-[10px] text-marrow-light/40 mt-1 leading-relaxed italic">
                    {catalog.desc}
                  </p>
                </div>
                <div className="p-3 flex-grow">
                  {isCatalogDisabled ? (
                    <div className="rounded-lg bg-marrow-light/5 border border-marrow-light/10 p-6 min-h-[140px] flex flex-col items-center justify-center text-center opacity-70">
                      <EyeOff className="h-8 w-8 text-marrow-light/20 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-marrow-light/40">
                        Ispettore disattivato
                      </p>
                      <p className="text-[10px] text-marrow-light/40 mt-1">
                        Attiva Film o Serie per visualizzare log e dettagli del catalogo.
                      </p>
                    </div>
                  ) : catalog.type === 'ai' ? (
                    <div className="flex flex-col h-full gap-2">
                       <div className="flex items-center gap-2 text-[10px] text-marrow-light/40 font-bold uppercase tracking-wider mb-1">
                        <span className="bg-primary/20 text-primary px-2 py-0.5 rounded border border-primary/10">Fase 1: AI Prompt</span>
                        <span className="text-xs">➔</span>
                        <span className="bg-marrow-deep text-white/90 px-2 py-0.5 rounded border border-white/5">Fase 2: Scoring</span>
                      </div>
                      <div className="rounded-lg bg-marrow-deep p-4 flex-grow overflow-auto border border-black/20 shadow-[inset_0_2px_10px_rgba(0,0,0,0.3)]">
                        <p className="text-[9px] text-white/60 font-bold mb-2 uppercase tracking-wider">
                          Log Query Synthesizer (Mistral):
                        </p>
                        {analyticsLoading ? (
                          <p className="text-secondary text-xs font-mono animate-pulse">Caricamento log AI in corso...</p>
                        ) : aiLog && Array.isArray(aiLog) && aiLog.length > 0 ? (
                          <pre className="text-white text-xs font-mono whitespace-pre-wrap break-words">
                            {JSON.stringify(aiLog, null, 2)}
                          </pre>
                        ) : (
                          <p className="text-white/40 text-xs font-mono">Nessun log AI generato. Configura una chiave API Mistral o forza l&apos;aggiornamento.</p>
                        )}
                      </div>
                    </div>
                  ) : (
                    <div className="rounded-lg bg-marrow-light/5 border border-marrow-light/10 p-4 min-h-[140px] flex flex-col items-center justify-center text-center h-full">
                      <span className="material-symbols-outlined text-3xl text-marrow-light/20 mb-2 opacity-60">
                        {catalog.idBase.includes('seed_network') ? 'hub' : 'forum'}
                      </span>
                      <p className="text-xs text-marrow-light/60 font-bold uppercase tracking-wider mb-1">
                        Analisi Motore Algoritmico
                      </p>
                      <p className="text-[10px] text-marrow-light/40 max-w-[90%] leading-relaxed mb-4">
                        Calcolo affinità puro (no LLM text query). Il tuo DNA viene forzato e iniettato direttamente nel calcolo matematico usando questi parametri TMDB:
                      </p>
                      <div className="w-full rounded-md p-3 text-left border border-marrow-light/10 bg-white/40">
                        <p className="text-[9px] text-marrow-light/60 font-bold mb-2 uppercase tracking-wider font-mono">DNA INIETTATO (MAPPING SEMANTICO)</p>
                        {analytics?.baseDnaParams && Object.keys(analytics.baseDnaParams).length > 0 ? (
                          <div className="flex flex-col gap-2">
                            {Object.entries(analytics.baseDnaParams).map(([key, rawValue]) => {
                              const ids = parseAndDeduplicateIds(rawValue);
                              if (ids.length === 0) return null;
                              const badgeLabel = TMDB_KEY_BADGE_LABEL[key] ?? { icon: '🧬', name: key };

                              return (
                                <div key={key} className="flex flex-wrap items-center gap-2 py-1 border-b border-marrow-light/10 last:border-b-0">
                                  {ids.map((id, idx) => (
                                    <div key={`${key}-${id}`} className="inline-flex items-center gap-2">
                                      <span className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-black ${
                                        badgeLabel.name === 'Genere' ? 'bg-secondary text-marrow-deep border border-primary/20' : 
                                        badgeLabel.name === 'Keyword' ? 'bg-accent/15 text-marrow-deep border border-accent/20' : 
                                        'bg-primary/15 text-marrow-deep border border-primary/20'
                                      }`}>
                                        {badgeLabel.icon} {badgeLabel.name}: {getDnaName(`${key.startsWith('with_genres') ? 'g' : key.startsWith('with_keywords') ? 'k' : 'o'}:${id}`)}
                                      </span>
                                      {idx < ids.length - 1 && (
                                        <span className="text-[9px] font-black uppercase tracking-wider text-marrow-light/60">&amp;</span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <p className="text-[10px] text-marrow-light/40 italic font-mono">Nessun filtro DNA attualmente attivo sul profilo.</p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Progress & Onboarding Modal ── */}
      {showProgressModal && syncStatus && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-marrow-light/60  p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-lg bg-background-light rounded-2xl shadow-2xl border border-marrow-light/10 overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-6 border-b border-marrow-light/10 flex items-center justify-between bg-marrow-light/5">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-white/40 border border-marrow-light/10">
                  <BrainCircuit className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-marrow-light">DNA Analysis Engine</h3>
                  <p className="text-xs text-marrow-light/40 uppercase tracking-wider font-semibold">
                    {syncStatus.isSyncing ? 'Elaborazione in corso...' : 'Analisi Completata'}
                  </p>
                </div>
              </div>
              {!syncStatus.isSyncing && (
                <button onClick={() => setShowProgressModal(false)} className="p-2 hover:bg-white/40 rounded-full transition-colors text-marrow-light/40">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-8">
              {syncStatus.isSyncing ? (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between text-sm font-bold text-marrow-light">
                    <span>Mappatura Catalogo</span>
                    <span className="text-primary">{syncStatus.current} / {syncStatus.total}</span>
                  </div>
                  <div className="h-3 w-full bg-marrow-light/10 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-500 ease-out" 
                      style={{ width: `${Math.round((syncStatus.current / (syncStatus.total || 1)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-center text-sm text-marrow-light/60 italic">
                    Stiamo analizzando i tuoi titoli per estrarre il tuo DNA cinofilo unico...
                  </p>
                </div>
              ) : !syncStatus.onboardingCompleted ? (
                <div className="flex flex-col gap-6">
                  <div className="p-4 rounded-xl bg-white/40 border border-marrow-light/10 shadow-inner">
                    <p className="text-sm text-marrow-light/80 mb-4 leading-relaxed font-medium">
                      Abbiamo analizzato il tuo catalogo! Ecco i tratti principali che abbiamo individuato. Confermi che corrispondono ai tuoi gusti?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedDNA.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-secondary text-primary border border-primary/20 px-3 py-1 text-xs font-bold shadow-sm">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleConfirmDNA}
                    className="w-full py-4 rounded-xl bg-primary text-white font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-xl shadow-primary/20"
                  >
                    🚀 Conferma DNA e Inizia
                  </button>
                  <p className="text-[10px] text-center text-marrow-light/40 uppercase font-black tracking-widest">
                    Potrai sempre modificare questi tratti nell&apos;editor manuale.
                  </p>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="inline-flex items-center justify-center p-4 rounded-full bg-secondary text-primary mb-4 border border-primary/10">
                    <span className="material-symbols-outlined text-4xl">check_circle</span>
                  </div>
                  <h4 className="text-xl font-bold mb-2 text-marrow-light">Prendi il volo!</h4>
                  <p className="text-sm text-marrow-light/60">I tuoi suggerimenti sono ora attivi nel sistema AI.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
