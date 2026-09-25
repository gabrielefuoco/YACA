import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";
import { Profile, TypeSelectors } from "@/types";

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
  presentation_strategy?: 'popularity' | 'interleave';
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
  return profiles.map((p) => ({
    id: p.id,
    name: p.name,
    selectedPresets: p.raw_ui_state.selectedPresets,
    presetOverrides: p.raw_ui_state.presetOverrides,
    catalogOrder: p.raw_ui_state.catalogOrder,
    heroPresetsInitialized: p.raw_ui_state.heroPresetsInitialized ?? true,
    existingCatalogs: p.existingCatalogs,
    newPrompts: p.raw_ui_state.newPrompts,
    settings: {
      fastPresetRefresh: p.settings?.fastRefresh ?? false,
      tmdbKey: p.settings?.tmdbKey,
      kidsMode: p.settings?.kidsMode ?? false,
      animeIdMode: p.settings?.animeIdMode ?? 'kitsu',
      manualDNA: p.settings?.manualDNA ?? [],
      suggestedDNA: p.settings?.suggestedDNA ?? [],
      typeSelectors: sanitizeTypeSelectors(p.settings?.typeSelectors),
    },
  }));
}

export function mapBackendProfile(backendProfile: BackendProfile): Profile {
  const bCatalogs: BackendCatalog[] = backendProfile.catalogs ?? [];
  const rawUi = backendProfile.raw_ui_state ?? {};
  const bSettings = backendProfile.settings ?? {};

  // Non-preset catalogs are the "existing" custom/AI/merged catalogs
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
  const heroPresetsInitialized = (rawUi as Record<string, unknown>).heroPresetsInitialized ?? false;

  const HERO_PRESET_IDS = [
    'yaca_true_blend_movies', 'yaca_true_blend_series',
    'yaca_seed_network_movies', 'yaca_seed_network_series',
    'yaca_hidden_gems_movies', 'yaca_hidden_gems_series',
    'yaca_trakt_filtered_movies', 'yaca_trakt_filtered_series'
  ];

  if (!heroPresetsInitialized) {
    selectedPresets = Array.from(new Set([...selectedPresets, ...HERO_PRESET_IDS]));
    HERO_PRESET_IDS.forEach(id => {
      if (!catalogOrder.includes(id)) {
        catalogOrder.push(id);
      }
    });
  }

  return {
    id: String(targetId),
    name: String(backendProfile.name ?? 'Profilo'),
    raw_ui_state: {
      selectedPresets,
      newPrompts: [],
      presetOverrides: rawUi.presetOverrides ?? {},
      catalogOrder,
      heroPresetsInitialized: true,
    },
    existingCatalogs,
    settings: {
      fastRefresh: Boolean(bSettings.fastPresetRefresh),
      tmdbKey: bSettings.tmdbKey ?? '',
      kidsMode: Boolean(bSettings.kidsMode),
      animeIdMode: (bSettings.animeIdMode === 'imdb' ? 'imdb' : 'kitsu') as 'kitsu' | 'imdb',
      manualDNA: Array.isArray(bSettings.manualDNA) ? bSettings.manualDNA as import('@/types').DNAItem[] : [],
      suggestedDNA: Array.isArray(bSettings.suggestedDNA) ? bSettings.suggestedDNA as import('@/types').DNAItem[] : [],
      typeSelectors: sanitizeTypeSelectors(bSettings.typeSelectors),
    },
  };
}
