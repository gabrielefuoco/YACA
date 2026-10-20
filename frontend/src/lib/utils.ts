import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { CatalogCardData, Profile, TypeSelectors, EngineSliders, DEFAULT_ENGINE_SLIDERS } from "@/types";
import { HERO_PRESET_IDS } from "@/lib/constants";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function generateId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID().split('-')[0];
  }
  return Math.random().toString(36).slice(2, 9);
}

/**
 * Shape of a profile as stored in the backend config (UserConfig).
 * Different from the frontend Profile type - uses `catalogs` instead of
 * `existingCatalogs`, and different settings field names.
 */
export interface BackendProfile {
  id?: string;
  _id?: string | { $oid: string };
  name?: unknown;
  catalogs?: BackendCatalog[];
  settings?: {
    fastPresetRefresh?: boolean;
    tmdbKey?: string;
    kidsMode?: boolean;
    animeIdMode?: 'kitsu' | 'imdb';
    manualDNA?: unknown[];
    suggestedDNA?: unknown[];
    typeSelectors?: TypeSelectors;
  };
  raw_ui_state?: {
    selectedPresets?: string[];
    presetOverrides?: Record<string, unknown>;
    catalogOrder?: string[];
    libraryOrder?: string[];
  };
}

interface BackendCatalog {
  id: string;
  name: string;
  type: string;
  filters?: Record<string, unknown>;
  raw_prompt?: string;
  source?: string;
  emoji?: string;
  queries?: import('@/types').QueryBlock[];
  presentation_strategy?: 'popularity';
}

export function sanitizeTypeSelectors(raw?: unknown): {
  film: boolean;
  serie: boolean;
  anime: 'only' | 'exclude' | null;
} {
  const defaultSelectors = { film: false, serie: false, anime: null as 'only' | 'exclude' | null };
  if (!raw || typeof raw !== 'object') {
    return defaultSelectors;
  }
  const obj = raw as Record<string, unknown>;
  const film = obj.film === true;
  const serie = obj.serie === true;
  const anime = (obj.anime === 'only' || obj.anime === 'exclude') ? obj.anime : null;

  return { film, serie, anime };
}

/**
 * Sceglie il profilo attivo da mostrare quando arriva la configurazione dal backend.
 *
 * Il profilo salvato nel backend vince sullo stato locale, ma solo la prima volta
 * per caricamento: dopo, la scelta dell'utente non va sovrascritta.
 *
 * Regressione coperta: l'effetto di sincronizzazione si limitava a conservare il
 * valore precedente (il default `global`), quindi dopo un refresh il dashboard
 * tornava sempre su "Generale".
 */
export function resolveHydratedActiveProfile({
  incomingActiveId,
  profiles,
  previousActiveId,
  alreadyAppliedIncomingId,
}: {
  incomingActiveId?: string | null;
  profiles?: Array<{ id: string }> | null;
  previousActiveId?: string | null;
  alreadyAppliedIncomingId?: string | null;
}): { activeId: string | null; appliedIncoming: boolean } {
  const ids = new Set((profiles ?? []).map((p) => p?.id).filter(Boolean) as string[]);

  if (incomingActiveId && ids.has(incomingActiveId) && incomingActiveId !== alreadyAppliedIncomingId) {
    return { activeId: incomingActiveId, appliedIncoming: true };
  }

  if (previousActiveId && ids.has(previousActiveId)) {
    return { activeId: previousActiveId, appliedIncoming: false };
  }

  return { activeId: (profiles ?? [])[0]?.id ?? null, appliedIncoming: false };
}

export function profilesToApiPayload(profiles: Profile[]) {
  return profiles.map((p) => {
    const sliders: EngineSliders = p.settings?.sliders ?? p.sliders ?? DEFAULT_ENGINE_SLIDERS;
    return {
      id: p.id,
      name: p.name,
      selectedPresets: p.raw_ui_state.selectedPresets,
      presetOverrides: p.raw_ui_state.presetOverrides,
      catalogOrder: p.raw_ui_state.catalogOrder,
      libraryOrder: p.raw_ui_state.libraryOrder ?? [],
      heroPresetsInitialized: p.raw_ui_state.heroPresetsInitialized ?? true,
      existingCatalogs: p.existingCatalogs,
      newPrompts: p.raw_ui_state.newPrompts,
      sliders,
      settings: {
        fastPresetRefresh: p.settings?.fastRefresh ?? false,
        tmdbKey: p.settings?.tmdbKey,
        kidsMode: p.settings?.kidsMode ?? false,
        animeIdMode: p.settings?.animeIdMode ?? 'kitsu',
        manualDNA: p.settings?.manualDNA ?? [],
        suggestedDNA: p.settings?.suggestedDNA ?? [],
        typeSelectors: sanitizeTypeSelectors(p.settings?.typeSelectors),
        sliders,
      },
    };
  });
}

export function mapBackendProfile(backendProfile: BackendProfile): Profile {
  const bCatalogs: BackendCatalog[] = backendProfile.catalogs ?? [];
  const rawUi = backendProfile.raw_ui_state ?? {};
  const bSettings = backendProfile.settings ?? {};

  // Non-preset catalogs are the "existing" custom/AI catalogs
  const existingCatalogs: Profile['existingCatalogs'] = bCatalogs
    .filter((c) => !c.id.startsWith('yaca_preset_'))
    .map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type === 'series' ? 'series' : 'movie',
      filters: c.filters,
      raw_prompt: c.raw_prompt,
      source: c.source,
      emoji: c.emoji,
      queries: c.queries,
      presentation_strategy: c.presentation_strategy,
    }));

  const targetId = backendProfile.id || 
                   (typeof backendProfile._id === 'string' ? backendProfile._id : 
                    (backendProfile._id as Record<string, unknown>)?.$oid) || 
                   generateId();

  let selectedPresets = Array.isArray(rawUi.selectedPresets) ? rawUi.selectedPresets : [];
  const catalogOrder = Array.isArray(rawUi.catalogOrder) ? rawUi.catalogOrder : [];
  const libraryOrder = Array.isArray(rawUi.libraryOrder) ? rawUi.libraryOrder : [];
  const heroPresetsInitialized = (rawUi as Record<string, unknown>).heroPresetsInitialized ?? false;

  if (!heroPresetsInitialized) {
    selectedPresets = Array.from(new Set([...selectedPresets, ...HERO_PRESET_IDS]));
    HERO_PRESET_IDS.forEach(id => {
      if (!catalogOrder.includes(id)) {
        catalogOrder.push(id);
      }
    });
  } else {
    // TICKET 20: un profilo che ha gia' salvato lo stato ha `heroPresetsInitialized: true`, quindi la
    // migrazione qui sopra non lo tocca mai. Se non ha NESSUNA delle sei famiglie nuove ma ha le righe
    // hero storiche, vuol dire che non le ha mai viste: si aggiungono una volta sola. Dopo il primo
    // salvataggio le id sono nel profilo, quindi spegnere una famiglia vince.
    // Limite dichiarato: chi spegne TUTTE e sei le famiglie se le ritrova accese (non distinguo «mai
    // viste» da «spente tutte») — togliere anche quel caso richiede un marcatore di versione persistito.
    const tutte: readonly string[] = HERO_PRESET_IDS;
    const nuoveFamiglie = tutte.filter(id => /_(classici|ultime_visioni|punti_incontro|micro_cluster_[123])_/.test(id));
    const haGiaUnaNuova = selectedPresets.some(id => nuoveFamiglie.includes(id));
    const haUnaStorica = selectedPresets.some(id => tutte.includes(id) && !nuoveFamiglie.includes(id));
    if (!haGiaUnaNuova && haUnaStorica) {
      selectedPresets = Array.from(new Set([...selectedPresets, ...nuoveFamiglie]));
      nuoveFamiglie.forEach(id => {
        if (!catalogOrder.includes(id)) {
          catalogOrder.push(id);
        }
      });
    }
  }

  const rawSliders = ((bSettings as Record<string, unknown>).sliders ?? (backendProfile as Record<string, unknown>).sliders ?? {}) as Partial<EngineSliders>;
  const sliders: EngineSliders = {
    largo: typeof rawSliders.largo === 'number' ? rawSliders.largo : DEFAULT_ENGINE_SLIDERS.largo,
    lontano: typeof rawSliders.lontano === 'number' ? rawSliders.lontano : DEFAULT_ENGINE_SLIDERS.lontano,
    cozy: typeof rawSliders.cozy === 'number' ? rawSliders.cozy : DEFAULT_ENGINE_SLIDERS.cozy,
    canone: typeof rawSliders.canone === 'number' ? rawSliders.canone : DEFAULT_ENGINE_SLIDERS.canone,
  };

  return {
    id: String(targetId),
    name: String(backendProfile.name ?? 'Profilo'),
    raw_ui_state: {
      selectedPresets,
      newPrompts: [],
      presetOverrides: rawUi.presetOverrides ?? {},
      catalogOrder,
      libraryOrder,
      heroPresetsInitialized: true,
    },
    existingCatalogs,
    sliders,
    settings: {
      fastRefresh: Boolean(bSettings.fastPresetRefresh),
      tmdbKey: bSettings.tmdbKey ?? '',
      kidsMode: Boolean(bSettings.kidsMode),
      animeIdMode: (bSettings.animeIdMode === 'imdb' ? 'imdb' : 'kitsu') as 'kitsu' | 'imdb',
      manualDNA: Array.isArray(bSettings.manualDNA) ? bSettings.manualDNA as import('@/types').DNAItem[] : [],
      suggestedDNA: Array.isArray(bSettings.suggestedDNA) ? bSettings.suggestedDNA as import('@/types').DNAItem[] : [],
      typeSelectors: sanitizeTypeSelectors(bSettings.typeSelectors),
      sliders,
    },
  };
}

/**
 * Quanti filtri dichiara un catalogo (o un preset): serve alle card per dire "N Filtri".
 *
 * Sta qui e non nella card perché è lettura del modello dati (chiavi TMDB con i loro alias e i
 * loro default neutri), non presentazione: vedi docs/FRONTEND.md sulla divisione dei ruoli.
 */
export function countCatalogFilters(cat: CatalogCardData): number {
  const queryBlocks: Record<string, unknown>[] =
    (cat.queries as Record<string, unknown>[] | undefined) ||
    (cat.filters && Array.isArray((cat.filters as Record<string, unknown>).queries)
      ? ((cat.filters as Record<string, unknown>).queries as Record<string, unknown>[])
      : []) ||
    (cat.filters ? [cat.filters] : []);

  if (queryBlocks.length === 0) return 0;

  let count = 0;
  // Un filtro conta solo se NON è al suo valore di default: 0 di voto, 10 di voto massimo,
  // array vuoto. Lo stesso filtro può arrivare con nomi diversi (alias TMDB o nomi UI).
  const filterKeys = [
    'similar_to', 'similarTo',
    'text_search', 'textSearch',
    'with_genres', 'genre_ids', 'genres',
    'with_keywords', 'keyword', 'keywords',
    'with_cast', 'cast',
    'with_crew', 'crew',
    'with_companies', 'company_name',
    'watch_provider',
    'with_original_language', 'original_language', 'language',
    'year_from', 'year_to', 'primary_release_date.gte', 'primary_release_date.lte', 'first_air_date.gte', 'first_air_date.lte',
    'runtime_lte', 'runtimeGte', 'runtimeLte', 'with_runtime.gte', 'with_runtime.lte',
    'vote_average.gte', 'vote_average.lte', 'voteMin', 'voteMax',
    'vote_count.gte',
    'without_genres', 'withoutGenres',
    'without_keywords', 'withoutKeywords',
    'certification_country', 'certification.lte', 'certificationLte',
  ];

  for (const q of queryBlocks) {
    if (!q) continue;
    for (const key of filterKeys) {
      const val = q[key];
      if (val !== undefined && val !== null && val !== '') {
        if (Array.isArray(val) && val.length === 0) continue;
        if (key === 'voteMin' && val === 0) continue;
        if (key === 'voteMax' && val === 10) continue;
        if (key === 'vote_average.gte' && val === 0) continue;
        if (key === 'vote_average.lte' && val === 10) continue;
        count++;
      }
    }
  }
  return count;
}
