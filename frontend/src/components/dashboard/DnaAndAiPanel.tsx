'use client';
import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { Profile, DNAItem, AnalyticsData, SyncStatus, CompiledVector } from '@/types';
import { api } from '@/lib/api';
import { BrainCircuit } from 'lucide-react';
import { DnaBarChart } from './DnaBarChart';
import { formatDnaLabel, groupDnaItems, DnaCategoryGroup } from '@/lib/dnaChart';

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

export function DnaAndAiPanel({ profile, syncStatus, userId }: DnaAndAiPanelProps) {
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

  const fetchAnalytics = useCallback(async () => {
    try {
      if (!activeUserId) return;
      const data = await api.getProfileAnalytics(profile.id, activeUserId);
      if (data && !data.error) {
        setAnalytics(data);
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
      {dnaGroups.length > 0 ? (
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
      ) : (
        <div className="glass-card rounded-2xl p-6 sm:p-10 border border-marrow-light/10 text-center flex flex-col items-center justify-center gap-3 shadow-sm">
          <div className="text-3xl">🧬</div>
          <div className="text-sm font-black text-marrow-deep">Nessun dato DNA rilevato</div>
          <p className="text-xs text-marrow-light/70 max-w-md leading-relaxed font-normal">
            Il grafico DNA si popola con la cronologia di visione e la sincronizzazione della tua libreria Stremio o Trakt.
          </p>
        </div>
      )}
    </div>
  );
}
