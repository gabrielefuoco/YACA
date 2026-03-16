'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Profile, DNAItem, AnalyticsData } from '@/types';
import { AutocompleteSearch } from '@/components/shared/AutocompleteSearch';
import { api } from '@/lib/api';
import { X, BrainCircuit, Terminal, EyeOff } from 'lucide-react';
import { Switch } from '@/components/ui/switch';

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

interface DnaAndAiPanelProps {
  profile: Profile;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
}

interface SyncStatus {
  isSyncing: boolean;
  total: number;
  current: number;
  onboardingCompleted: boolean;
  lastSync?: string;
  manualDNA?: DNAItem[];
  suggestedDNA?: DNAItem[];
}

function dnaArraysEqual(a: DNAItem[] = [], b: DNAItem[] = []) {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item.type === b[idx]?.type && String(item.id) === String(b[idx]?.id) && item.name === b[idx]?.name);
}

export function DnaAndAiPanel({ profile, onUpdateProfile }: DnaAndAiPanelProps) {
  const profileDNA: DNAItem[] = profile?.settings?.manualDNA ?? [];
  const suggestedDNA: DNAItem[] = profile?.settings?.suggestedDNA ?? [];
  const dnaLookup = useMemo(() => {
    const lookup = new Map<string, string>();
    [...profileDNA, ...suggestedDNA].forEach((item) => {
      const dnaKey = `${item.type}:${String(item.id)}`;
      if (!lookup.has(dnaKey)) {
        lookup.set(dnaKey, item.name);
      }
    });
    return lookup;
  }, [profileDNA, suggestedDNA]);
  const latestSettingsRef = useRef(profile.settings);

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);
  const [syncStatus, setSyncStatus] = useState<SyncStatus | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);

  const getDnaName = (id: string, tmdbKey: string) => {
    const targetType = TMDB_KEY_TO_DNA_TYPE[tmdbKey];
    if (!targetType) return id;
    return dnaLookup.get(`${targetType}:${String(id)}`) ?? id;
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

  useEffect(() => {
    latestSettingsRef.current = profile.settings;
  }, [profile.settings]);

  const fetchAnalytics = useCallback(async () => {
    setAnalyticsLoading(true);
    try {
      const userId = typeof window !== 'undefined' ? localStorage.getItem('yaca_user_id') : null;
      if (!userId) return;
      const data = await api.getProfileAnalytics(profile.id, userId);
      if (data && !data.error) {
        setAnalytics(data);
      }
    } catch {
      // Analytics fetch failed — non-blocking
    } finally {
      setAnalyticsLoading(false);
    }
  }, [profile.id]);

  const fetchSyncStatus = useCallback(async () => {
    try {
      const userId = typeof window !== 'undefined' ? localStorage.getItem('yaca_user_id') : null;
      if (!userId) return;
      const status = await api.getSyncStatus(profile.id, userId);
      setSyncStatus(status);

      if (status && Array.isArray(status.manualDNA) && Array.isArray(status.suggestedDNA)) {
        const currentSettings = latestSettingsRef.current ?? {};
        const nextManualDNA = status.manualDNA;
        const nextSuggestedDNA = status.suggestedDNA;
        const currentManualDNA = currentSettings.manualDNA ?? [];
        const currentSuggestedDNA = currentSettings.suggestedDNA ?? [];

        if (!dnaArraysEqual(nextManualDNA, currentManualDNA) || !dnaArraysEqual(nextSuggestedDNA, currentSuggestedDNA)) {
          onUpdateProfile(profile.id, {
            settings: {
              ...currentSettings,
              manualDNA: nextManualDNA,
              suggestedDNA: nextSuggestedDNA,
            },
          });
        }
      }
      
      // Auto-show modal if syncing or if onboarding is pending with suggestions
      if (status.isSyncing) {
        setShowProgressModal(true);
      }
    } catch (e) {
      console.error('Failed to fetch sync status', e);
    }
  }, [onUpdateProfile, profile.id]);

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

  const handleRefresh = async () => {
    const userId = localStorage.getItem('yaca_user_id');
    if (!userId) return;
    await api.refreshSync(profile.id, userId);
    setSyncStatus(prev => prev ? { ...prev, isSyncing: true } : null);
    setShowProgressModal(true);
  };

  const handleConfirmDNA = async () => {
    const userId = localStorage.getItem('yaca_user_id');
    if (!userId) return;
    const res = await api.confirmDNA(profile.id, userId);
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

  const handleAddDNA = (item: DNAItem) => {
    if (profileDNA.find((p) => String(p.id) === String(item.id))) return;
    const newDNA = [...profileDNA, item];
    onUpdateProfile(profile.id, {
      settings: { ...profile.settings, manualDNA: newDNA },
    });
  };

  const handleRemoveDNA = (id: string) => {
    const newDNA = profileDNA.filter((p) => String(p.id) !== String(id));
    onUpdateProfile(profile.id, {
      settings: { ...profile.settings, manualDNA: newDNA },
    });
  };

  return (
    <div className="flex flex-col gap-10 w-full">
      {/* ── Section 1: DNA Tracker & Editor ── */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center justify-between gap-3 text-primary">
          <div className="flex items-center gap-3">
            <BrainCircuit className="h-6 w-6" />
            <h2 className="text-lg font-black uppercase tracking-widest">DNA Tracker &amp; Editor</h2>
          </div>
          <button 
            onClick={handleRefresh}
            disabled={syncStatus?.isSyncing}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary/10 hover:bg-primary/20 text-primary text-xs font-bold transition-all disabled:opacity-50"
          >
            <span className={`material-symbols-outlined text-sm ${syncStatus?.isSyncing ? 'animate-spin' : ''}`}>sync</span>
            {syncStatus?.isSyncing ? 'Sincronizzazione...' : 'Aggiorna DNA'}
          </button>
        </div>
        <p className="text-[11px] text-slate-500 -mt-2">
          Aggiorna DNA ricalcola solo il DNA suggerito in base alla cronologia recente, senza modificare il tuo override manuale.
        </p>

        {/* Suggested DNA (read-only) */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 p-5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Suggested DNA (Appreso dall&apos;AI)</p>
          {suggestedDNA.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {suggestedDNA.map((p) => (
                <span
                  key={`${p.type}-${p.id}`}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-semibold ${
                    p.type === 'genre'
                      ? 'bg-blue-100 text-blue-700 dark:bg-blue-500/20 dark:text-blue-300'
                      : p.type === 'keyword'
                        ? 'bg-violet-100 text-violet-700 dark:bg-violet-500/20 dark:text-violet-300'
                        : 'bg-emerald-100 text-emerald-700 dark:bg-emerald-500/20 dark:text-emerald-300'
                  }`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-slate-400">Apprendimento in corso: attiva cataloghi o guarda contenuti per arricchire il DNA.</p>
          )}
        </div>

        {/* Manual DNA Override */}
        <div className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 p-5">
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400 mb-3 uppercase tracking-wider">Override Manuale (DNA Forzato)</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {profileDNA.length > 0 ? profileDNA.map((p) => (
              <span
                key={`${p.type}-${p.id}`}
                className="inline-flex items-center gap-1 rounded bg-primary/20 text-primary px-3 py-1.5 text-xs font-bold"
              >
                {p.type === 'genre' ? '🎭 ' : p.type === 'country' ? '🌍 ' : '🏷️ '} {p.name}
                <button
                  onClick={() => handleRemoveDNA(String(p.id))}
                  className="ml-1 text-primary hover:text-primary/70 transition-colors"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )) : (
              <p className="text-xs text-slate-400">Nessun DNA manuale impostato. Aggiungi generi o keyword per forzare i gusti.</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-black dark:text-white">
            <div className="relative [&_input]:pl-10 [&_input]:py-3 [&_input]:bg-white dark:[&_input]:bg-slate-800 [&_input]:border-slate-200 dark:[&_input]:border-slate-700 [&_input]:rounded-lg [&_input]:text-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none">movie</span>
              <AutocompleteSearch
                placeholder="Aggiungi genere (es. Thriller)"
                searchFn={api.searchTmdbGenres}
                onSelect={(item) => handleAddDNA({ type: 'genre', id: String(item.id), name: item.name })}
              />
            </div>
            <div className="relative [&_input]:pl-10 [&_input]:py-3 [&_input]:bg-white dark:[&_input]:bg-slate-800 [&_input]:border-slate-200 dark:[&_input]:border-slate-700 [&_input]:rounded-lg [&_input]:text-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 z-10 pointer-events-none">tag</span>
              <AutocompleteSearch
                placeholder="Aggiungi keyword (es. Cyberpunk)"
                searchFn={api.searchTmdbKeywords}
                onSelect={(item) => handleAddDNA({ type: 'keyword', id: String(item.id), name: item.name })}
              />
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 2: AI Inspector (Hero Catalogs) ── */}
      <section className="flex flex-col gap-6">
        <div className="flex items-center gap-3 text-primary">
          <Terminal className="h-6 w-6" />
          <h2 className="text-lg font-black uppercase tracking-widest">Ispettore AI (Hero Catalogs)</h2>
        </div>

        <div className="flex flex-col gap-6">
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
                className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 overflow-hidden flex flex-col"
              >
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700/40 bg-slate-50 dark:bg-slate-800/60">
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{catalog.emoji}</span>
                      <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{catalog.label}</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <label htmlFor={movieSwitchId} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        Film
                        <Switch id={movieSwitchId} checked={isMoviesEnabled} onCheckedChange={(checked) => toggleHeroCatalog(idMovies, checked)} />
                      </label>
                      <label htmlFor={seriesSwitchId} className="inline-flex items-center gap-1.5 text-[10px] font-bold text-slate-600 dark:text-slate-300">
                        Serie
                        <Switch id={seriesSwitchId} checked={isSeriesEnabled} onCheckedChange={(checked) => toggleHeroCatalog(idSeries, checked)} />
                      </label>
                    </div>
                  </div>
                  <p className="text-[10px] text-slate-500 mt-1 leading-relaxed">
                    {catalog.desc}
                  </p>
                </div>
                <div className="p-3 flex-grow">
                  {isCatalogDisabled ? (
                    <div className="rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 p-6 min-h-[140px] flex flex-col items-center justify-center text-center opacity-70">
                      <EyeOff className="h-8 w-8 text-slate-400 mb-2" />
                      <p className="text-xs font-bold uppercase tracking-wider text-slate-500">
                        Ispettore disattivato
                      </p>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Attiva Film o Serie per visualizzare log e dettagli del catalogo.
                      </p>
                    </div>
                  ) : catalog.type === 'ai' ? (
                    <>
                      {/* Visualizzazione IBRIDA per Cataloghi AI */}
                      <div className="flex flex-col h-full gap-2">
                        <div className="flex items-center gap-2 text-[10px] text-slate-500 font-bold uppercase tracking-wider mb-1">
                          <span className="bg-primary/20 text-primary px-2 py-0.5 rounded">Fase 1: AI Prompt</span>
                          <span className="text-xs">➔</span>
                          <span className="bg-slate-200 dark:bg-slate-800 px-2 py-0.5 rounded">Fase 2: Scoring</span>
                        </div>
                        <div className="rounded-lg bg-slate-900 dark:bg-black p-4 flex-grow overflow-auto border border-slate-700/50 shadow-inner">
                          <p className="text-[9px] text-slate-400 font-bold mb-2 uppercase tracking-wider">
                            Log Query Synthesizer (Mistral):
                          </p>
                          {analyticsLoading ? (
                            <p className="text-green-400 text-xs font-mono animate-pulse">Caricamento log AI in corso...</p>
                          ) : aiLog && Array.isArray(aiLog) && aiLog.length > 0 ? (
                            <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap break-words">
                              {JSON.stringify(aiLog, null, 2)}
                            </pre>
                          ) : (
                            <p className="text-slate-500 text-xs font-mono">Nessun log AI generato. Configura una chiave API Mistral o forza l'aggiornamento.</p>
                          )}
                        </div>
                      </div>
                    </>
                  ) : (
                    <>
                      {/* Visualizzazione per Cataloghi Algoritmici */}
                      <div className="rounded-lg bg-slate-100 dark:bg-slate-800/50 border border-slate-200 dark:border-slate-700/50 p-4 min-h-[140px] flex flex-col items-center justify-center text-center h-full">
                        <span className="material-symbols-outlined text-3xl text-slate-400 mb-2 opacity-60">
                          {catalog.idBase.includes('seed_network') ? 'hub' : 'forum'}
                        </span>
                        <p className="text-xs text-slate-600 dark:text-slate-400 font-bold uppercase tracking-wider mb-1">
                          Analisi Motore Algoritmico
                        </p>
                        <p className="text-[10px] text-slate-500 max-w-[90%] leading-relaxed mb-4">
                          Calcolo affinità puro (no LLM text query). Il tuo DNA viene forzato e iniettato direttamente nel calcolo matematico usando questi parametri TMDB:
                        </p>
                        <div className="w-full rounded-md p-3 text-left border border-slate-200 dark:border-slate-700/60 bg-white/70 dark:bg-slate-900/50">
                          <p className="text-[9px] text-slate-500 font-bold mb-2 uppercase tracking-wider">DNA iniettato (mapping semantico)</p>
                          {analytics?.baseDnaParams && Object.keys(analytics.baseDnaParams).length > 0 ? (
                            <div className="flex flex-col gap-2">
                              {Object.entries(analytics.baseDnaParams).map(([key, rawValue]) => {
                                const ids = parseAndDeduplicateIds(rawValue);
                                if (ids.length === 0) {
                                  // If backend returns empty values we skip rendering this row to avoid misleading empty badges.
                                  return null;
                                }
                                const badgeLabel = TMDB_KEY_BADGE_LABEL[key] ?? { icon: '🧬', name: key };

                                return (
                                  <div key={key} className="flex flex-wrap items-center gap-2 py-1 border-b border-slate-200/70 dark:border-slate-700/40 last:border-b-0">
                                    {ids.map((id, idx) => (
                                      <div key={`${key}-${id}`} className="inline-flex items-center gap-2">
                                        <span className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-bold bg-primary/15 text-primary">
                                          {badgeLabel.icon} {badgeLabel.name}: {getDnaName(id, key)}
                                        </span>
                                        {idx < ids.length - 1 && (
                                          <span className="text-[9px] font-black uppercase tracking-wider text-slate-500">&amp;</span>
                                        )}
                                      </div>
                                    ))}
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <p className="text-[10px] text-slate-500 italic font-mono">Nessun filtro DNA attualmente attivo sul profilo.</p>
                          )}
                        </div>
                      </div>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>

      {/* ── Progress & Onboarding Modal ── */}
      {showProgressModal && syncStatus && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-lg bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden animate-in zoom-in-95 duration-300">
            {/* Modal Header */}
            <div className="p-6 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <BrainCircuit className="h-6 w-6 text-primary" />
                </div>
                <div>
                  <h3 className="text-lg font-bold">DNA Analysis Engine</h3>
                  <p className="text-xs text-slate-500 uppercase tracking-wider font-semibold">
                    {syncStatus.isSyncing ? 'Elaborazione in corso...' : 'Analisi Completata'}
                  </p>
                </div>
              </div>
              {!syncStatus.isSyncing && (
                <button onClick={() => setShowProgressModal(false)} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-full">
                  <X className="h-5 w-5" />
                </button>
              )}
            </div>

            {/* Modal Body */}
            <div className="p-8">
              {syncStatus.isSyncing ? (
                <div className="flex flex-col gap-6">
                  <div className="flex items-center justify-between text-sm font-bold">
                    <span>Mappatura Catalogo</span>
                    <span className="text-primary">{syncStatus.current} / {syncStatus.total}</span>
                  </div>
                  <div className="h-3 w-full bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                    <div 
                      className="h-full bg-primary transition-all duration-500 ease-out" 
                      style={{ width: `${Math.round((syncStatus.current / (syncStatus.total || 1)) * 100)}%` }}
                    />
                  </div>
                  <p className="text-center text-sm text-slate-500 italic">
                    Stiamo analizzando i tuoi titoli per estrarre il tuo DNA cinofilo unico...
                  </p>
                </div>
              ) : !syncStatus.onboardingCompleted ? (
                <div className="flex flex-col gap-6">
                  <div className="p-4 rounded-xl bg-primary/5 border border-primary/20">
                    <p className="text-sm text-slate-700 dark:text-slate-300 mb-4 leading-relaxed">
                      Abbiamo analizzato il tuo catalogo! Ecco i tratti principali che abbiamo individuato. Confermi che corrispondono ai tuoi gusti?
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {suggestedDNA.map((p) => (
                        <span key={p.id} className="inline-flex items-center gap-1 rounded-full bg-primary/20 text-primary px-3 py-1 text-xs font-bold">
                          {p.name}
                        </span>
                      ))}
                    </div>
                  </div>
                  
                  <button 
                    onClick={handleConfirmDNA}
                    className="w-full py-4 rounded-xl bg-primary text-white font-black uppercase tracking-widest hover:scale-[1.02] active:scale-95 transition-all shadow-lg shadow-primary/30"
                  >
                    🚀 Conferma DNA e Inizia
                  </button>
                  <p className="text-[10px] text-center text-slate-500 uppercase font-bold tracking-tighter">
                    Potrai sempre modificare questi tratti nell&apos;editor manuale.
                  </p>
                </div>
              ) : (
                <div className="text-center py-6">
                  <div className="inline-flex items-center justify-center p-4 rounded-full bg-emerald-500/20 text-emerald-500 mb-4">
                    <span className="material-symbols-outlined text-4xl">check_circle</span>
                  </div>
                  <h4 className="text-xl font-bold mb-2">Prendi il volo!</h4>
                  <p className="text-sm text-slate-500">I tuoi suggerimenti sono ora attivi nel sistema AI.</p>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
