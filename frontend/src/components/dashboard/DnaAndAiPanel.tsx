'use client';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Profile, DNAItem, AnalyticsData, SyncStatus } from '@/types';
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
  syncStatus: SyncStatus & { onboardingCompleted?: boolean, lastSync?: string, manualDNA?: DNAItem[], suggestedDNA?: DNAItem[] };
  syncProfileVectors: (profileId: string, userId: string) => Promise<any>;
  userId?: string;
}

// Removed redundant SyncStatus

function dnaArraysEqual(a: DNAItem[] = [], b: DNAItem[] = []) {
  if (a.length !== b.length) return false;
  return a.every((item, idx) => item.type === b[idx]?.type && String(item.id) === String(b[idx]?.id) && item.name === b[idx]?.name);
}

export function DnaAndAiPanel({ profile, onUpdateProfile, syncStatus, syncProfileVectors, userId }: DnaAndAiPanelProps) {
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
    const uid = userId || localStorage.getItem('yaca_user_id');
    if (!uid) return;
    setShowProgressModal(true);
    try {
      await syncProfileVectors(profile.id, uid);
      await fetchAnalytics();
    } catch (err) {
      console.error('Refresh failed:', err);
    }
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
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white/40 hover:bg-white/60 text-marrow-light text-xs font-bold border border-marrow-light/10 transition-all disabled:opacity-50 shadow-sm"
          >
            <span className={`material-symbols-outlined text-sm ${syncStatus?.isSyncing ? 'animate-spin' : ''}`}>sync</span>
            {syncStatus?.isSyncing ? 'Sincronizzazione...' : 'Aggiorna DNA'}
          </button>
        </div>
        <p className="text-[11px] text-marrow-light/40 -mt-2">
          Aggiorna DNA ricalcola solo il DNA suggerito in base alla cronologia recente, senza modificare il tuo override manuale.
        </p>

        {/* Suggested DNA (read-only) */}
        <div className="glass-panel p-5">
          <p className="text-xs font-bold text-marrow-light/60 mb-3 uppercase tracking-wider">Suggested DNA (Appreso dall&apos;AI)</p>
          {suggestedDNA.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {suggestedDNA.map((p) => (
                <span
                  key={`${p.type}-${p.id}`}
                  className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-xs font-bold ${
                    p.type === 'genre'
                      ? 'bg-secondary text-marrow-deep border border-primary/20'
                      : p.type === 'keyword'
                        ? 'bg-accent/15 text-marrow-deep border border-accent/20'
                        : 'bg-primary/15 text-marrow-deep border border-primary/20'
                  }`}
                >
                  {p.name}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-xs text-marrow-light/40 italic">Apprendimento in corso: attiva cataloghi o guarda contenuti per arricchire il DNA.</p>
          )}
        </div>

        {/* Manual DNA Override */}
        <div className="glass-panel p-5">
          <p className="text-xs font-bold text-marrow-light/60 mb-3 uppercase tracking-wider">Override Manuale (DNA Forzato)</p>
          <div className="flex flex-wrap gap-2 mb-4">
            {profileDNA.length > 0 ? profileDNA.map((p) => (
              <span
                key={`${p.type}-${p.id}`}
                className={`inline-flex items-center gap-1 rounded px-3 py-1.5 text-xs font-black ${
                  p.type === 'genre'
                    ? 'bg-secondary text-marrow-deep border border-primary/20'
                    : p.type === 'keyword'
                      ? 'bg-accent/15 text-marrow-deep border border-accent/20'
                      : 'bg-primary/15 text-marrow-deep border border-primary/20'
                }`}
              >
                {p.type === 'genre' ? '🎭 ' : p.type === 'country' ? '🌍 ' : '🏷️ '} {p.name}
                <button
                  onClick={() => handleRemoveDNA(String(p.id))}
                  className="ml-1 opacity-70 hover:opacity-100 transition-opacity"
                >
                  <X className="h-3 w-3" />
                </button>
              </span>
            )) : (
              <p className="text-xs text-marrow-light/40 italic">Nessun DNA manuale impostato. Aggiungi generi o keyword per forzare i gusti.</p>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-marrow-light">
            <div className="relative [&_input]:pl-10 [&_input]:py-3 [&_input]:bg-white/40 [&_input]:border-marrow-light/10 [&_input]:rounded-lg [&_input]:text-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-marrow-light/40 z-10 pointer-events-none">movie</span>
              <AutocompleteSearch
                placeholder="Aggiungi genere (es. Thriller)"
                searchFn={api.searchTmdbGenres}
                onSelect={(item) => handleAddDNA({ type: 'genre', id: String(item.id), name: item.name })}
              />
            </div>
            <div className="relative [&_input]:pl-10 [&_input]:py-3 [&_input]:bg-white/40 [&_input]:border-marrow-light/10 [&_input]:rounded-lg [&_input]:text-sm">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-marrow-light/40 z-10 pointer-events-none">tag</span>
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
                          <p className="text-white/40 text-xs font-mono">Nessun log AI generato. Configura una chiave API Mistral o forza l'aggiornamento.</p>
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
                                        {badgeLabel.icon} {badgeLabel.name}: {getDnaName(id, key)}
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
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-marrow-light/60 backdrop-blur-md p-4 animate-in fade-in duration-300">
          <div className="w-full max-w-lg bg-beige rounded-2xl shadow-2xl border border-marrow-light/10 overflow-hidden animate-in zoom-in-95 duration-300">
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
