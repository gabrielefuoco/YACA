'use client';
import { useState, useEffect, useCallback } from 'react';
import { Profile, DNAItem, AnalyticsData } from '@/types';
import { AutocompleteSearch } from '@/components/shared/AutocompleteSearch';
import { api } from '@/lib/api';
import { X, BrainCircuit, Terminal } from 'lucide-react';

const HERO_CATALOGS = [
  { id: 'yaca_true_blend_movies', label: 'True Blend (Film)', emoji: '🎯' },
  { id: 'yaca_true_blend_series', label: 'True Blend (Serie)', emoji: '🎯' },
  { id: 'yaca_seed_network_movies', label: 'Seed Network (Film)', emoji: '🕸️' },
  { id: 'yaca_seed_network_series', label: 'Seed Network (Serie)', emoji: '🕸️' },
  { id: 'yaca_hidden_gems_movies', label: 'Hidden Gems (Film)', emoji: '💎' },
  { id: 'yaca_hidden_gems_series', label: 'Hidden Gems (Serie)', emoji: '💎' },
  { id: 'yaca_trakt_filtered_movies', label: 'Trakt Filtered (Film)', emoji: '🌐' },
  { id: 'yaca_trakt_filtered_series', label: 'Trakt Filtered (Serie)', emoji: '🌐' },
];

interface DnaAndAiPanelProps {
  profile: Profile;
  onUpdateProfile: (id: string, updates: Partial<Profile>) => void;
}

export function DnaAndAiPanel({ profile, onUpdateProfile }: DnaAndAiPanelProps) {
  const profileDNA: DNAItem[] = profile?.settings?.manualDNA ?? [];
  const suggestedDNA: DNAItem[] = profile?.settings?.suggestedDNA ?? [];

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [analyticsLoading, setAnalyticsLoading] = useState(true);

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

  useEffect(() => {
    fetchAnalytics();
  }, [fetchAnalytics]);

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
        <div className="flex items-center gap-3 text-primary">
          <BrainCircuit className="h-6 w-6" />
          <h2 className="text-lg font-black uppercase tracking-widest">DNA Tracker &amp; Editor</h2>
        </div>

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

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {HERO_CATALOGS.map((catalog) => {
            const aiLog = analytics?.aiLogs?.[catalog.id];

            return (
              <div
                key={catalog.id}
                className="rounded-xl border border-slate-200 dark:border-slate-700/60 bg-white dark:bg-slate-900/40 overflow-hidden"
              >
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700/40 bg-slate-50 dark:bg-slate-800/60 flex items-center gap-2">
                  <span className="text-lg">{catalog.emoji}</span>
                  <span className="text-xs font-bold text-slate-700 dark:text-slate-200">{catalog.label}</span>
                </div>
                <div className="p-3">
                  <div className="rounded-lg bg-slate-900 dark:bg-black p-4 min-h-[120px] max-h-[300px] overflow-auto">
                    {analyticsLoading ? (
                      <p className="text-green-400 text-xs font-mono animate-pulse">Caricamento log AI in corso...</p>
                    ) : aiLog && Array.isArray(aiLog) && aiLog.length > 0 ? (
                      <pre className="text-green-400 text-xs font-mono whitespace-pre-wrap break-words">
                        {JSON.stringify(aiLog, null, 2)}
                      </pre>
                    ) : (
                      <p className="text-slate-500 text-xs font-mono">Nessun log AI disponibile per questo catalogo.</p>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
